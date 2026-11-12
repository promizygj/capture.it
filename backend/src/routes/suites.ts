import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { assertProjectAccess, requireAuth } from '../middleware/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { publicTemplates, templateMap } from '../engine/templates.js';
import { ASSERTION_TYPES, STEP_ACTIONS } from '../engine/types.js';

export const suitesRouter = Router();
suitesRouter.use(requireAuth);

export const SUITE_CATEGORIES = ['Authentication', 'Navigation', 'Forms', 'Shopping cart', 'Checkout', 'User profile', 'API testing', 'Visual', 'General'];

suitesRouter.get('/templates', (_req, res) => {
  res.json({ templates: publicTemplates, stepActions: STEP_ACTIONS, assertionTypes: ASSERTION_TYPES, categories: SUITE_CATEGORIES });
});

async function suiteWithAccess(suiteId: string, userId: string, role: 'VIEWER' | 'EDITOR' = 'VIEWER') {
  const suite = await prisma.testSuite.findUnique({ where: { id: suiteId } });
  if (!suite) throw notFound('Test suite');
  const m = await assertProjectAccess(suite.projectId, userId, role);
  return { suite, role: m.role };
}

async function caseWithAccess(caseId: string, userId: string, role: 'VIEWER' | 'EDITOR' = 'VIEWER') {
  const tc = await prisma.testCase.findUnique({ where: { id: caseId }, include: { suite: true } });
  if (!tc) throw notFound('Test case');
  await assertProjectAccess(tc.suite.projectId, userId, role);
  return tc;
}

/* ---------- Suites ---------- */
const suiteBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  category: z.string().trim().min(1).max(50).default('General'),
  enabled: z.boolean().optional(),
});

suitesRouter.post('/projects/:projectId/suites', async (req, res) => {
  await assertProjectAccess(req.params.projectId, req.user!.id, 'EDITOR');
  const body = suiteBody.parse(req.body);
  const position = await prisma.testSuite.count({ where: { projectId: req.params.projectId } });
  const suite = await prisma.testSuite.create({ data: { ...body, projectId: req.params.projectId, position } });
  res.status(201).json({ suite });
});

suitesRouter.get('/suites/:suiteId', async (req, res) => {
  const { role } = await suiteWithAccess(req.params.suiteId, req.user!.id);
  const suite = await prisma.testSuite.findUniqueOrThrow({
    where: { id: req.params.suiteId },
    include: {
      project: { select: { id: true, name: true, baseUrl: true } },
      cases: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { results: { orderBy: { startedAt: 'desc' }, take: 1, select: { status: true, startedAt: true, durationMs: true, runId: true } } },
      },
    },
  });
  res.json({
    suite: { ...suite, role, cases: suite.cases.map(({ results, ...c }) => ({ ...c, lastResult: results[0] ?? null })) },
  });
});

suitesRouter.patch('/suites/:suiteId', async (req, res) => {
  await suiteWithAccess(req.params.suiteId, req.user!.id, 'EDITOR');
  const body = suiteBody.partial().parse(req.body);
  res.json({ suite: await prisma.testSuite.update({ where: { id: req.params.suiteId }, data: body }) });
});

suitesRouter.delete('/suites/:suiteId', async (req, res) => {
  await suiteWithAccess(req.params.suiteId, req.user!.id, 'EDITOR');
  await prisma.testSuite.delete({ where: { id: req.params.suiteId } });
  res.status(204).end();
});

/* ---------- Test cases ---------- */
const stepSchema = z.object({
  action: z.enum(STEP_ACTIONS),
  selector: z.string().max(500).optional(),
  value: z.string().max(5000).optional(),
  description: z.string().max(200).optional(),
});
const expectationSchema = z.object({
  type: z.enum(ASSERTION_TYPES),
  selector: z.string().max(500).optional(),
  value: z.string().max(5000).optional(),
});

const caseBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  template: z.string().refine((t) => templateMap.has(t), 'Unknown template'),
  targetUrl: z.string().trim().max(2000).default('/'),
  config: z.record(z.unknown()).default({}),
  steps: z.array(stepSchema).max(100).optional(),
  expectations: z.array(expectationSchema).max(100).optional(),
  expectedResult: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  timeoutMs: z.number().int().min(1000).max(300_000).default(30_000),
  enabled: z.boolean().default(true),
});

const STEPS_NEED_SELECTOR = new Set(['click', 'fill', 'select', 'check', 'uncheck', 'hover', 'waitForSelector', 'scrollIntoView']);
const ASSERT_NEED_SELECTOR = new Set(['visible', 'hidden', 'textEquals', 'valueEquals', 'count']);

/** Turns template config into executable steps (or validates hand-written custom steps). */
function materialise(data: z.infer<typeof caseBody>) {
  const tpl = templateMap.get(data.template)!;
  const missing = tpl.fields.filter((f) => f.required && (data.config[f.name] === undefined || String(data.config[f.name]).trim() === ''));
  if (missing.length) throw badRequest(`Missing required field(s): ${missing.map((f) => f.label).join(', ')}`);

  let steps = data.steps ?? [];
  let expectations = data.expectations ?? [];
  if (!tpl.editableSteps) ({ steps, expectations } = tpl.build(data.config));
  if (tpl.editableSteps && !steps.length && !expectations.length) throw badRequest('Add at least one step or assertion');
  steps.forEach((s, i) => {
    if (STEPS_NEED_SELECTOR.has(s.action) && !s.selector) throw badRequest(`Step ${i + 1} (${s.action}) needs a selector`);
  });
  expectations.forEach((e, i) => {
    if (ASSERT_NEED_SELECTOR.has(e.type) && !e.selector) throw badRequest(`Assertion ${i + 1} (${e.type}) needs a selector`);
  });
  return {
    ...data,
    expectedResult: data.expectedResult ?? tpl.defaults.expectedResult,
    config: data.config as Prisma.InputJsonValue,
    steps: steps as unknown as Prisma.InputJsonValue,
    expectations: expectations as unknown as Prisma.InputJsonValue,
  };
}

suitesRouter.post('/suites/:suiteId/cases', async (req, res) => {
  await suiteWithAccess(req.params.suiteId, req.user!.id, 'EDITOR');
  const data = materialise(caseBody.parse(req.body));
  const position = await prisma.testCase.count({ where: { suiteId: req.params.suiteId } });
  const testCase = await prisma.testCase.create({ data: { ...data, suiteId: req.params.suiteId, position } });
  res.status(201).json({ testCase });
});

suitesRouter.get('/cases/:caseId', async (req, res) => {
  const tc = await caseWithAccess(req.params.caseId, req.user!.id);
  const [history, baselines] = await Promise.all([
    prisma.testResult.findMany({
      where: { testCaseId: tc.id, status: { in: ['PASSED', 'FAILED', 'ERROR'] } },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: { id: true, runId: true, status: true, browser: true, durationMs: true, startedAt: true, errorMessage: true, isFlaky: true },
    }),
    prisma.visualBaseline.findMany({ where: { testCaseId: tc.id }, select: { id: true, browser: true, updatedAt: true } }),
  ]);
  res.json({ testCase: tc, history, baselines });
});

suitesRouter.patch('/cases/:caseId', async (req, res) => {
  const tc = await caseWithAccess(req.params.caseId, req.user!.id, 'EDITOR');
  // Toggle-only updates skip template materialisation
  const quick = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
  if (quick.success) {
    return res.json({ testCase: await prisma.testCase.update({ where: { id: tc.id }, data: quick.data }) });
  }
  const merged = caseBody.parse({
    name: tc.name,
    description: tc.description,
    template: tc.template,
    targetUrl: tc.targetUrl,
    config: tc.config,
    steps: tc.steps,
    expectations: tc.expectations,
    expectedResult: tc.expectedResult,
    priority: tc.priority,
    timeoutMs: tc.timeoutMs,
    enabled: tc.enabled,
    ...req.body,
  });
  const testCase = await prisma.testCase.update({ where: { id: tc.id }, data: materialise(merged) });
  if (merged.template !== tc.template) await prisma.visualBaseline.deleteMany({ where: { testCaseId: tc.id } });
  res.json({ testCase });
});

suitesRouter.post('/cases/:caseId/duplicate', async (req, res) => {
  const tc = await caseWithAccess(req.params.caseId, req.user!.id, 'EDITOR');
  const { id: _id, createdAt: _c, updatedAt: _u, suite: _s, ...rest } = tc;
  const position = await prisma.testCase.count({ where: { suiteId: tc.suiteId } });
  const testCase = await prisma.testCase.create({
    data: {
      ...rest,
      name: `${tc.name} (copy)`,
      position,
      config: tc.config as Prisma.InputJsonValue,
      steps: tc.steps as Prisma.InputJsonValue,
      expectations: tc.expectations as Prisma.InputJsonValue,
    },
  });
  res.status(201).json({ testCase });
});

suitesRouter.delete('/cases/:caseId', async (req, res) => {
  const tc = await caseWithAccess(req.params.caseId, req.user!.id, 'EDITOR');
  await prisma.testCase.delete({ where: { id: tc.id } });
  res.status(204).end();
});
