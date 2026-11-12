import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { assertProjectAccess, requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { removeArtifactDir } from '../lib/storage.js';
import { getProjectInsights } from '../services/insights.js';
import { removeSchedule, syncSchedule } from '../queue.js';
import cronParser from '../lib/cron.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const url = z.string().trim().url('Must be a valid URL (including http:// or https://)');
const browsers = z.array(z.enum(['chromium', 'firefox', 'webkit'])).min(1);

const projectBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  baseUrl: url,
  defaultBrowsers: browsers.optional(),
  maxParallel: z.number().int().min(1).max(10).optional(),
  retries: z.number().int().min(0).max(3).optional(),
  notifyEmail: z.boolean().optional(),
  slackWebhookUrl: z.string().trim().url().startsWith('https://').optional().nullable().or(z.literal('').transform(() => null)),
});

projectsRouter.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const projects = await prisma.project.findMany({
    where: {
      members: { some: { userId: req.user!.id } },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { baseUrl: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      members: { where: { userId: req.user!.id }, select: { role: true } },
      _count: { select: { suites: true, runs: true } },
      runs: { orderBy: { queuedAt: 'desc' }, take: 1, select: { id: true, status: true, passed: true, failed: true, total: true, queuedAt: true } },
    },
  });
  const caseCounts = await prisma.testCase.groupBy({
    by: ['suiteId'],
    where: { suite: { projectId: { in: projects.map((p) => p.id) } } },
    _count: true,
  });
  const suites = await prisma.testSuite.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, select: { id: true, projectId: true } });
  res.json({
    projects: projects.map(({ members, runs, ...p }) => ({
      ...p,
      role: members[0]?.role,
      lastRun: runs[0] ?? null,
      caseCount: caseCounts.filter((c) => suites.find((s) => s.id === c.suiteId)?.projectId === p.id).reduce((a, c) => a + c._count, 0),
    })),
  });
});

projectsRouter.post('/', async (req, res) => {
  const body = projectBody.extend({ environments: z.array(z.object({ name: z.string().trim().min(1).max(50), baseUrl: url })).optional() }).parse(req.body);
  const { environments, ...data } = body;
  const envs = environments?.length ? environments : [{ name: 'Production', baseUrl: body.baseUrl }];
  const project = await prisma.project.create({
    data: {
      ...data,
      members: { create: { userId: req.user!.id, role: 'OWNER' } },
      environments: { create: envs.map((e, i) => ({ ...e, isDefault: i === 0 })) },
    },
  });
  res.status(201).json({ project });
});

projectsRouter.get('/:projectId', async (req, res) => {
  const m = await assertProjectAccess(req.params.projectId, req.user!.id);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: req.params.projectId },
    include: {
      environments: { orderBy: { createdAt: 'asc' } },
      suites: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { cases: true } }, cases: { select: { enabled: true } } },
      },
    },
  });
  res.json({
    project: {
      ...project,
      role: m.role,
      suites: project.suites.map(({ cases, ...s }) => ({ ...s, enabledCases: cases.filter((c) => c.enabled).length })),
    },
  });
});

projectsRouter.patch('/:projectId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = projectBody.partial().parse(req.body);
  const project = await prisma.project.update({ where: { id: req.params.projectId }, data: body });
  res.json({ project });
});

projectsRouter.delete('/:projectId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'OWNER');
  const [runs, schedules] = await Promise.all([
    prisma.testRun.findMany({ where: { projectId: req.params.projectId }, select: { id: true } }),
    prisma.schedule.findMany({ where: { projectId: req.params.projectId }, select: { id: true } }),
  ]);
  await prisma.project.delete({ where: { id: req.params.projectId } });
  await Promise.allSettled([...schedules.map((s) => removeSchedule(s.id)), ...runs.map((r) => removeArtifactDir(`runs/${r.id}`))]);
  res.status(204).end();
});

projectsRouter.get('/:projectId/insights', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id);
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  res.json(await getProjectInsights(req.params.projectId, days));
});

/* ---------- Environments ---------- */
const envBody = z.object({
  name: z.string().trim().min(1).max(50),
  baseUrl: url,
  variables: z.record(z.string().regex(/^[A-Za-z_][\w.-]*$/, 'Invalid variable name'), z.string()).optional(),
  isDefault: z.boolean().optional(),
});

projectsRouter.post('/:projectId/environments', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = envBody.parse(req.body);
  const env = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.environment.updateMany({ where: { projectId: req.params.projectId }, data: { isDefault: false } });
    const count = await tx.environment.count({ where: { projectId: req.params.projectId } });
    return tx.environment.create({ data: { ...body, isDefault: body.isDefault || count === 0, projectId: req.params.projectId } });
  });
  res.status(201).json({ environment: env });
});

projectsRouter.patch('/:projectId/environments/:envId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = envBody.partial().parse(req.body);
  const env = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.environment.updateMany({ where: { projectId: req.params.projectId }, data: { isDefault: false } });
    const { count } = await tx.environment.updateMany({ where: { id: req.params.envId, projectId: req.params.projectId }, data: body });
    if (!count) throw notFound('Environment');
    return tx.environment.findUniqueOrThrow({ where: { id: req.params.envId } });
  });
  res.json({ environment: env });
});

projectsRouter.delete('/:projectId/environments/:envId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const env = await prisma.environment.findFirst({ where: { id: req.params.envId, projectId: req.params.projectId } });
  if (!env) throw notFound('Environment');
  await prisma.environment.delete({ where: { id: env.id } });
  if (env.isDefault) {
    const next = await prisma.environment.findFirst({ where: { projectId: req.params.projectId }, orderBy: { createdAt: 'asc' } });
    if (next) await prisma.environment.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.status(204).end();
});

/* ---------- Members (team collaboration) ---------- */
projectsRouter.get('/:projectId/members', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id);
  const members = await prisma.projectMember.findMany({
    where: { projectId: req.params.projectId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ members });
});

projectsRouter.post('/:projectId/members', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'OWNER');
  const body = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['OWNER', 'EDITOR', 'VIEWER']).default('EDITOR') }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw badRequest('No user with that email exists. Ask them to register first.');
  const existing = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: req.params.projectId, userId: user.id } } });
  if (existing) throw conflict('That user is already a member of this project');
  const member = await prisma.projectMember.create({
    data: { projectId: req.params.projectId, userId: user.id, role: body.role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json({ member });
});

async function ensureAnotherOwner(projectId: string, memberId: string) {
  const owners = await prisma.projectMember.count({ where: { projectId, role: 'OWNER', id: { not: memberId } } });
  if (!owners) throw badRequest('A project must keep at least one owner');
}

projectsRouter.patch('/:projectId/members/:memberId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'OWNER');
  const body = z.object({ role: z.enum(['OWNER', 'EDITOR', 'VIEWER']) }).parse(req.body);
  const member = await prisma.projectMember.findFirst({ where: { id: req.params.memberId, projectId: req.params.projectId } });
  if (!member) throw notFound('Member');
  if (member.role === 'OWNER' && body.role !== 'OWNER') await ensureAnotherOwner(req.params.projectId, member.id);
  res.json({ member: await prisma.projectMember.update({ where: { id: member.id }, data: { role: body.role } }) });
});

projectsRouter.delete('/:projectId/members/:memberId', async (req, res) => {
  const me = await assertProjectAccess(req.params.projectId, req.user!.id);
  const member = await prisma.projectMember.findFirst({ where: { id: req.params.memberId, projectId: req.params.projectId } });
  if (!member) throw notFound('Member');
  // Owners can remove anyone; everyone can leave
  if (me.role !== 'OWNER' && member.userId !== req.user!.id) await assertProjectAccess(req.params.projectId, req.user!.id, 'OWNER');
  if (member.role === 'OWNER') await ensureAnotherOwner(req.params.projectId, member.id);
  await prisma.projectMember.delete({ where: { id: member.id } });
  res.status(204).end();
});

/* ---------- Schedules ---------- */
const scheduleBody = z.object({
  name: z.string().trim().min(1).max(100),
  cron: z.string().trim().refine((c) => cronParser.isValid(c), 'Invalid cron expression (5 fields, e.g. "0 * * * *")'),
  timezone: z.string().default('UTC').refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone'),
  suiteId: z.string().optional().nullable(),
  environmentId: z.string().optional().nullable(),
  browsers: browsers.default(['chromium']),
  enabled: z.boolean().default(true),
});

async function checkScheduleRefs(projectId: string, b: { suiteId?: string | null; environmentId?: string | null }) {
  if (b.suiteId && !(await prisma.testSuite.findFirst({ where: { id: b.suiteId, projectId } }))) throw badRequest('Suite not found in project');
  if (b.environmentId && !(await prisma.environment.findFirst({ where: { id: b.environmentId, projectId } })))
    throw badRequest('Environment not found in project');
}

projectsRouter.get('/:projectId/schedules', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id);
  const schedules = await prisma.schedule.findMany({
    where: { projectId: req.params.projectId },
    include: { suite: { select: { name: true } }, environment: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ schedules: schedules.map((s) => ({ ...s, nextRunAt: s.enabled ? cronParser.next(s.cron, s.timezone) : null })) });
});

projectsRouter.post('/:projectId/schedules', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = scheduleBody.parse(req.body);
  await checkScheduleRefs(req.params.projectId, body);
  const schedule = await prisma.schedule.create({ data: { ...body, projectId: req.params.projectId } });
  await syncSchedule(schedule);
  res.status(201).json({ schedule });
});

projectsRouter.patch('/:projectId/schedules/:scheduleId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = scheduleBody.partial().parse(req.body);
  await checkScheduleRefs(req.params.projectId, body);
  const { count } = await prisma.schedule.updateMany({ where: { id: req.params.scheduleId, projectId: req.params.projectId }, data: body });
  if (!count) throw notFound('Schedule');
  const schedule = await prisma.schedule.findUniqueOrThrow({ where: { id: req.params.scheduleId } });
  await syncSchedule(schedule);
  res.json({ schedule });
});

projectsRouter.delete('/:projectId/schedules/:scheduleId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const { count } = await prisma.schedule.deleteMany({ where: { id: req.params.scheduleId, projectId: req.params.projectId } });
  if (!count) throw notFound('Schedule');
  await removeSchedule(req.params.scheduleId);
  res.status(204).end();
});

/* ---------- API keys (CI/CD) ---------- */
projectsRouter.get('/:projectId/api-keys', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const keys = await prisma.apiKey.findMany({
    where: { projectId: req.params.projectId },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true, createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ apiKeys: keys });
});

projectsRouter.post('/:projectId/api-keys', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  const key = `qa_${randomToken(24)}`;
  const apiKey = await prisma.apiKey.create({
    data: { projectId: req.params.projectId, createdById: req.user!.id, name: body.name, prefix: key.slice(0, 10), keyHash: sha256(key) },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  // The plain key is only ever returned once
  res.status(201).json({ apiKey, key });
});

projectsRouter.delete('/:projectId/api-keys/:keyId', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const { count } = await prisma.apiKey.deleteMany({ where: { id: req.params.keyId, projectId: req.params.projectId } });
  if (!count) throw notFound('API key');
  res.status(204).end();
});
