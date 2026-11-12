import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, RunStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { assertProjectAccess, requireAuth } from '../middleware/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { readArtifact, removeArtifactDir, saveArtifact } from '../lib/storage.js';
import { cancelRun, createRun } from '../services/runService.js';
import { compareRuns, getDashboard } from '../services/insights.js';
import { analyseFailure } from '../services/aiAnalysis.js';

export const runsRouter = Router();
runsRouter.use(requireAuth);

const browsers = z.array(z.enum(['chromium', 'firefox', 'webkit'])).min(1).optional();

async function myProjectIds(userId: string) {
  return (await prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } })).map((m) => m.projectId);
}

async function runWithAccess(runId: string, userId: string, role: 'VIEWER' | 'EDITOR' = 'VIEWER') {
  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound('Test run');
  await assertProjectAccess(run.projectId, userId, role);
  return run;
}

async function resultWithAccess(resultId: string, userId: string, role: 'VIEWER' | 'EDITOR' = 'VIEWER') {
  const result = await prisma.testResult.findUnique({ where: { id: resultId }, include: { run: true } });
  if (!result) throw notFound('Test result');
  await assertProjectAccess(result.run.projectId, userId, role);
  return result;
}

runsRouter.get('/dashboard', async (req, res) => {
  const ids = await myProjectIds(req.user!.id);
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  if (projectId && !ids.includes(projectId)) throw notFound('Project');
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  res.json(await getDashboard(projectId ? [projectId] : ids, days));
});

/** Start a run: whole project (all enabled suites) or one suite */
runsRouter.post('/projects/:projectId/runs', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = z.object({ suiteId: z.string().optional().nullable(), environmentId: z.string().optional().nullable(), browsers }).parse(req.body ?? {});
  const run = await createRun({ projectId: req.params.projectId, ...body, trigger: 'MANUAL', userId: req.user!.id });
  res.status(201).json({ run });
});

const STATUSES: RunStatus[] = ['QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'CANCELLED'];

runsRouter.get('/runs', async (req, res) => {
  const q = z
    .object({
      projectId: z.string().optional(),
      suiteId: z.string().optional(),
      status: z.string().optional(),
      trigger: z.enum(['MANUAL', 'SCHEDULE', 'CI']).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);
  const ids = await myProjectIds(req.user!.id);
  const statuses = q.status?.split(',').filter((s): s is RunStatus => STATUSES.includes(s as RunStatus));
  const to = q.to ? new Date(q.to.getTime() + (q.to.getUTCHours() === 0 && q.to.getUTCMinutes() === 0 ? 86400_000 - 1 : 0)) : undefined;
  const where: Prisma.TestRunWhereInput = {
    projectId: q.projectId ? (ids.includes(q.projectId) ? q.projectId : '__none__') : { in: ids },
    ...(q.suiteId ? { suiteId: q.suiteId } : {}),
    ...(statuses?.length ? { status: { in: statuses } } : {}),
    ...(q.trigger ? { trigger: q.trigger } : {}),
    ...(q.from || to ? { queuedAt: { ...(q.from ? { gte: q.from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const [total, runs] = await Promise.all([
    prisma.testRun.count({ where }),
    prisma.testRun.findMany({
      where,
      orderBy: { queuedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        project: { select: { id: true, name: true } },
        suite: { select: { id: true, name: true } },
        environment: { select: { name: true } },
        triggeredBy: { select: { name: true } },
      },
    }),
  ]);
  res.json({ runs, total, page: q.page, pageSize: q.pageSize });
});

runsRouter.get('/runs/compare', async (req, res) => {
  const { base, head } = z.object({ base: z.string(), head: z.string() }).parse(req.query);
  await runWithAccess(base, req.user!.id);
  await runWithAccess(head, req.user!.id);
  const cmp = await compareRuns(base, head);
  if (!cmp) throw notFound('Test run');
  res.json(cmp);
});

runsRouter.get('/runs/:runId', async (req, res) => {
  await runWithAccess(req.params.runId, req.user!.id);
  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: req.params.runId },
    include: {
      project: { select: { id: true, name: true, baseUrl: true, retries: true, maxParallel: true } },
      suite: { select: { id: true, name: true } },
      environment: { select: { id: true, name: true, baseUrl: true } },
      triggeredBy: { select: { name: true } },
      results: {
        orderBy: [{ suiteName: 'asc' }, { testCaseName: 'asc' }, { browser: 'asc' }],
        select: {
          id: true,
          testCaseId: true,
          testCaseName: true,
          suiteName: true,
          template: true,
          browser: true,
          browserVersion: true,
          status: true,
          attempts: true,
          isFlaky: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          errorMessage: true,
          screenshotPath: true,
          diffRatio: true,
        },
      },
    },
  });
  res.json({ run });
});

runsRouter.post('/runs/:runId/cancel', async (req, res) => {
  await runWithAccess(req.params.runId, req.user!.id, 'EDITOR');
  await cancelRun(req.params.runId);
  res.json({ ok: true });
});

runsRouter.post('/runs/:runId/rerun', async (req, res) => {
  const old = await runWithAccess(req.params.runId, req.user!.id, 'EDITOR');
  const run = await createRun({
    projectId: old.projectId,
    suiteId: old.suiteId,
    environmentId: old.environmentId,
    browsers: old.browsers,
    trigger: 'MANUAL',
    userId: req.user!.id,
  });
  res.status(201).json({ run });
});

runsRouter.delete('/runs/:runId', async (req, res) => {
  const run = await runWithAccess(req.params.runId, req.user!.id, 'EDITOR');
  if (run.status === 'RUNNING' || run.status === 'QUEUED') throw badRequest('Cancel the run before deleting it');
  await prisma.testRun.delete({ where: { id: run.id } });
  await removeArtifactDir(`runs/${run.id}`).catch(() => undefined);
  res.status(204).end();
});

/* ---------- Individual test reports ---------- */
runsRouter.get('/results/:resultId', async (req, res) => {
  const r = await resultWithAccess(req.params.resultId, req.user!.id);
  const [testCase, baseline, previous] = await Promise.all([
    r.testCaseId
      ? prisma.testCase.findUnique({
          where: { id: r.testCaseId },
          select: { id: true, suiteId: true, targetUrl: true, steps: true, expectations: true, expectedResult: true, priority: true, timeoutMs: true, description: true },
        })
      : null,
    r.testCaseId ? prisma.visualBaseline.findUnique({ where: { testCaseId_browser: { testCaseId: r.testCaseId, browser: r.browser } } }) : null,
    r.testCaseId
      ? prisma.testResult.findMany({
          where: { testCaseId: r.testCaseId, browser: r.browser, status: { in: ['PASSED', 'FAILED', 'ERROR'] } },
          orderBy: { startedAt: 'desc' },
          take: 15,
          select: { id: true, runId: true, status: true, durationMs: true, startedAt: true },
        })
      : [],
  ]);
  const { run, ...result } = r;
  res.json({
    result,
    run: { id: run.id, projectId: run.projectId, status: run.status, trigger: run.trigger },
    testCase,
    hasBaseline: !!baseline,
    history: previous,
  });
});

const IMAGE_KINDS = ['screenshot', 'diff', 'baseline', 'current'] as const;
runsRouter.get('/results/:resultId/images/:kind', async (req, res) => {
  const kind = z.enum(IMAGE_KINDS).parse(req.params.kind);
  const r = await resultWithAccess(req.params.resultId, req.user!.id);
  let rel: string | null = null;
  if (kind === 'screenshot') rel = r.screenshotPath;
  if (kind === 'diff') rel = r.diffPath;
  if (kind === 'current') rel = `runs/${r.runId}/${r.id}-current.png`;
  if (kind === 'baseline' && r.testCaseId) {
    rel = (await prisma.visualBaseline.findUnique({ where: { testCaseId_browser: { testCaseId: r.testCaseId, browser: r.browser } } }))?.imagePath ?? null;
  }
  const buf = rel ? await readArtifact(rel) : null;
  if (!buf) throw notFound('Image');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', kind === 'baseline' ? 'no-cache' : 'private, max-age=86400');
  res.send(buf);
});

/** Promote this result's screenshot to be the new visual baseline */
runsRouter.post('/results/:resultId/approve-baseline', async (req, res) => {
  const r = await resultWithAccess(req.params.resultId, req.user!.id, 'EDITOR');
  if (r.template !== 'visual-regression' || !r.testCaseId) throw badRequest('Only visual regression results have baselines');
  const img = await readArtifact(`runs/${r.runId}/${r.id}-current.png`);
  if (!img) throw badRequest('This result has no captured screenshot to approve');
  const path = await saveArtifact(`baselines/${r.testCaseId}-${r.browser}.png`, img);
  await prisma.visualBaseline.upsert({
    where: { testCaseId_browser: { testCaseId: r.testCaseId, browser: r.browser } },
    create: { projectId: r.run.projectId, testCaseId: r.testCaseId, browser: r.browser, imagePath: path },
    update: { imagePath: path },
  });
  res.json({ ok: true });
});

runsRouter.post('/results/:resultId/analyze', async (req, res) => {
  const r = await resultWithAccess(req.params.resultId, req.user!.id);
  if (r.status !== 'FAILED' && r.status !== 'ERROR') throw badRequest('Only failed tests can be analysed');
  const refresh = req.query.refresh === 'true';
  if (r.aiAnalysis && !refresh) return res.json({ analysis: r.aiAnalysis, cached: true });
  const [tc, history] = await Promise.all([
    r.testCaseId ? prisma.testCase.findUnique({ where: { id: r.testCaseId }, select: { targetUrl: true } }) : null,
    r.testCaseId
      ? prisma.testResult.findMany({
          where: { testCaseId: r.testCaseId, status: { in: ['PASSED', 'FAILED', 'ERROR'] } },
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: { status: true },
        })
      : [],
  ]);
  const { analysis, source } = await analyseFailure({ ...r, targetUrl: tc?.targetUrl, history: history.map((h) => h.status) });
  await prisma.testResult.update({ where: { id: r.id }, data: { aiAnalysis: analysis } });
  res.json({ analysis, source, cached: false });
});
