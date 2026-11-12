import pLimit from 'p-limit';
import type { Prisma, TestResult, TestCase } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { readArtifact, saveArtifact } from '../lib/storage.js';
import { BrowserPool } from '../engine/browserPool.js';
import { runApiCase, runBrowserCase } from '../engine/executor.js';
import { normaliseConfig, templateMap } from '../engine/templates.js';
import type { CaseInput, CaseOutcome, Expectation, Step } from '../engine/types.js';
import { recountRun } from './runStats.js';
import { notifyRunFinished } from './notify.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function isCancelled(runId: string) {
  const run = await prisma.testRun.findUnique({ where: { id: runId }, select: { status: true } });
  return !run || run.status === 'CANCELLED';
}

/** Executes a queued run. Safe to call once per run; a second call is a no-op. */
export async function executeRun(runId: string, opts: { headless?: boolean } = {}) {
  // Claim the run atomically so two workers can never execute the same run
  const claimed = await prisma.testRun.updateMany({
    where: { id: runId, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  if (!claimed.count) {
    logger.warn('Run not claimable (cancelled or already started)', { runId });
    return;
  }

  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    include: { project: true, environment: true },
  });
  const baseUrl = run.environment?.baseUrl || run.project.baseUrl;
  const variables = Object.fromEntries(
    Object.entries((run.environment?.variables as Record<string, unknown>) ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const pending = await prisma.testResult.findMany({
    where: { runId, status: 'PENDING' },
    include: { testCase: true },
    orderBy: { id: 'asc' },
  });

  const pool = new BrowserPool(opts.headless ?? true);
  const limit = pLimit(Math.max(1, run.project.maxParallel));
  const maxAttempts = 1 + Math.max(0, run.project.retries);
  let cancelled = false;
  const started = Date.now();
  logger.info('Run started', { runId, cases: pending.length, parallel: run.project.maxParallel });

  try {
    await Promise.all(
      pending.map((result) =>
        limit(async () => {
          if (cancelled || (cancelled = await isCancelled(runId))) return;
          await executeResult(result, { runId, projectId: run.projectId, baseUrl, variables, pool, maxAttempts });
        }),
      ),
    );
  } catch (err) {
    logger.error('Run crashed', { runId, err: String(err) });
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: 'ERROR', errorMessage: err instanceof Error ? err.message : String(err) },
    });
  } finally {
    await pool.close();
  }

  // Any result still pending (cancellation / crash) is marked skipped
  await prisma.testResult.updateMany({
    where: { runId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'SKIPPED', errorMessage: 'Not executed' },
  });
  const counts = await recountRun(runId);
  const current = await prisma.testRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true } });
  const finalStatus = current.status === 'RUNNING' ? (counts.failed > 0 ? 'FAILED' : 'PASSED') : current.status;
  const finished = await prisma.testRun.update({
    where: { id: runId },
    data: { status: finalStatus, finishedAt: new Date(), durationMs: Date.now() - started },
  });
  logger.info('Run finished', { runId, status: finalStatus, ...counts });

  if (finished.status === 'FAILED' || finished.status === 'ERROR') {
    await notifyRunFinished(runId).catch((e) => logger.error('Notification failed', { runId, err: String(e) }));
  }
  return finished;
}

interface ResultCtx {
  runId: string;
  projectId: string;
  baseUrl: string;
  variables: Record<string, string>;
  pool: BrowserPool;
  maxAttempts: number;
}

async function executeResult(result: TestResult & { testCase: TestCase | null }, ctx: ResultCtx) {
  const tc = result.testCase;
  if (!tc) {
    await prisma.testResult.update({ where: { id: result.id }, data: { status: 'SKIPPED', errorMessage: 'Test case was deleted' } });
    return;
  }
  const startedAt = new Date();
  await prisma.testResult.update({ where: { id: result.id }, data: { status: 'RUNNING', startedAt } });

  const tpl = templateMap.get(tc.template);
  const input: CaseInput = {
    id: tc.id,
    name: tc.name,
    template: tc.template,
    targetUrl: tc.targetUrl,
    config: normaliseConfig(tc.template, (tc.config as Record<string, unknown>) ?? {}),
    steps: (tc.steps as unknown as Step[]) ?? [],
    expectations: (tc.expectations as unknown as Expectation[]) ?? [],
    timeoutMs: tc.timeoutMs,
  };

  const isVisual = tc.template === 'visual-regression';
  const baseline = isVisual
    ? await prisma.visualBaseline.findUnique({ where: { testCaseId_browser: { testCaseId: tc.id, browser: result.browser } } })
    : null;
  const baselineImg = baseline ? await readArtifact(baseline.imagePath) : null;

  let outcome: CaseOutcome | undefined;
  const allLogs: CaseOutcome['logs'] = [];
  let attempt = 0;
  let browserVersion: string | undefined;

  while (attempt < ctx.maxAttempts) {
    attempt++;
    if (attempt > 1) allLogs.push({ t: 0, level: 'warn', message: `Retrying (attempt ${attempt} of ${ctx.maxAttempts})` });
    try {
      if (tpl?.kind === 'api') {
        outcome = await runApiCase(input, { baseUrl: ctx.baseUrl, variables: ctx.variables, artifactKey: result.id });
      } else {
        const browser = await ctx.pool.get(result.browser);
        browserVersion = browser.version();
        outcome = await runBrowserCase(ctx.pool, result.browser, input, {
          baseUrl: ctx.baseUrl,
          variables: ctx.variables,
          artifactKey: result.id,
          baseline: baselineImg,
        });
      }
    } catch (err) {
      // Browser failed to launch, etc.
      const message = err instanceof Error ? err.message : String(err);
      outcome = {
        status: 'ERROR',
        durationMs: 0,
        errorMessage: `Browser execution failed: ${message}`,
        errorStack: err instanceof Error ? err.stack : undefined,
        logs: [{ t: 0, level: 'error', message }],
        consoleErrors: [],
        networkFailures: [],
      };
    }
    allLogs.push(...outcome.logs);
    if (outcome.status === 'PASSED') break;
  }
  if (!outcome) return;

  const dir = `runs/${ctx.runId}`;
  let screenshotPath: string | undefined;
  let diffPath: string | undefined;
  if (outcome.screenshot) screenshotPath = await saveArtifact(`${dir}/${result.id}-failure.png`, outcome.screenshot);
  if (outcome.diffImage) diffPath = await saveArtifact(`${dir}/${result.id}-diff.png`, outcome.diffImage);
  if (outcome.currentImage) {
    const currentPath = await saveArtifact(`${dir}/${result.id}-current.png`, outcome.currentImage);
    if (!screenshotPath) screenshotPath = currentPath;
    if (!baseline) {
      const basePath = await saveArtifact(`baselines/${tc.id}-${result.browser}.png`, outcome.currentImage);
      await prisma.visualBaseline.upsert({
        where: { testCaseId_browser: { testCaseId: tc.id, browser: result.browser } },
        create: { projectId: ctx.projectId, testCaseId: tc.id, browser: result.browser, imagePath: basePath },
        update: { imagePath: basePath },
      });
    }
  }

  const finishedAt = new Date();
  const isFlaky = outcome.status === 'PASSED' && attempt > 1;
  await prisma.testResult.update({
    where: { id: result.id },
    data: {
      status: outcome.status,
      attempts: attempt,
      isFlaky,
      browserVersion: tpl?.kind === 'api' ? 'n/a (API request)' : browserVersion,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage: outcome.errorMessage?.slice(0, 5000),
      errorStack: outcome.errorStack?.slice(0, 10000),
      screenshotPath,
      diffPath,
      diffRatio: outcome.diffRatio,
      logs: json(allLogs.slice(-500)),
      consoleErrors: json(outcome.consoleErrors.slice(0, 100)),
      networkFailures: json(outcome.networkFailures.slice(0, 100)),
      metrics: outcome.metrics ? json(outcome.metrics) : undefined,
    },
  });
  // Live progress counters
  const field = outcome.status === 'PASSED' ? 'passed' : 'failed';
  await prisma.testRun.update({
    where: { id: ctx.runId },
    data: { [field]: { increment: 1 }, ...(isFlaky ? { flaky: { increment: 1 } } : {}) },
  });
}
