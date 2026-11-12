import type { BrowserName, Prisma, RunTrigger } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { templateMap } from '../engine/templates.js';
import { enqueueRun } from '../queue.js';
import { recountRun } from './runStats.js';

export interface CreateRunInput {
  projectId: string;
  suiteId?: string | null;
  environmentId?: string | null;
  browsers?: BrowserName[];
  trigger: RunTrigger;
  userId?: string | null;
  ciMetadata?: Prisma.InputJsonValue;
}

/**
 * Creates a TestRun with one pending TestResult per (test case × browser) and queues it for a worker.
 * Disabled test cases are recorded as SKIPPED so they show up in reports.
 */
export async function createRun(input: CreateRunInput) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw notFound('Project');

  let environmentId = input.environmentId ?? null;
  if (environmentId) {
    const env = await prisma.environment.findFirst({ where: { id: environmentId, projectId: project.id } });
    if (!env) throw badRequest('Environment does not belong to this project');
  } else {
    const def = await prisma.environment.findFirst({ where: { projectId: project.id, isDefault: true } });
    environmentId = def?.id ?? null;
  }

  const suites = await prisma.testSuite.findMany({
    where: input.suiteId ? { id: input.suiteId, projectId: project.id } : { projectId: project.id, enabled: true },
    include: { cases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  if (input.suiteId && !suites.length) throw notFound('Test suite');
  if (input.suiteId && !suites[0].enabled) throw badRequest('This test suite is disabled. Enable it before running.');

  const browsers = [...new Set(input.browsers?.length ? input.browsers : project.defaultBrowsers)];
  if (!browsers.length) browsers.push('chromium');

  const results: Prisma.TestResultCreateWithoutRunInput[] = [];
  for (const suite of suites) {
    for (const tc of suite.cases) {
      const tpl = templateMap.get(tc.template);
      // API tests do not use a browser, so they execute once per run
      const caseBrowsers = tpl?.kind === 'api' ? [browsers[0]] : browsers;
      for (const browser of caseBrowsers) {
        results.push({
          testCase: { connect: { id: tc.id } },
          testCaseName: tc.name,
          suiteName: suite.name,
          template: tc.template,
          browser,
          status: tc.enabled ? 'PENDING' : 'SKIPPED',
          errorMessage: tc.enabled ? undefined : 'Test case is disabled',
        });
      }
    }
  }

  const runnable = results.filter((r) => r.status === 'PENDING').length;
  if (runnable === 0) throw badRequest('There are no enabled test cases to run');

  const run = await prisma.testRun.create({
    data: {
      projectId: project.id,
      suiteId: input.suiteId ?? null,
      environmentId,
      triggeredById: input.userId ?? null,
      trigger: input.trigger,
      browsers,
      total: results.length,
      skipped: results.length - runnable,
      ciMetadata: input.ciMetadata,
      results: { create: results },
    },
  });
  await enqueueRun(run.id);
  return run;
}

export async function cancelRun(runId: string) {
  const { count } = await prisma.testRun.updateMany({
    where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });
  if (!count) throw badRequest('Only queued or running test runs can be cancelled');
  // Pending results are marked skipped; the worker stops picking up new cases once it sees the cancellation
  await prisma.testResult.updateMany({
    where: { runId, status: 'PENDING' },
    data: { status: 'SKIPPED', errorMessage: 'Run was cancelled' },
  });
  await recountRun(runId);
}
