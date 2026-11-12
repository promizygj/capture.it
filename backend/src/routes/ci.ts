import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sha256 } from '../lib/crypto.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { createRun } from '../services/runService.js';
import { config } from '../config.js';

/**
 * CI/CD integration. Authenticate with a project API key:
 *   curl -X POST $API/api/ci/runs -H "X-API-Key: qa_..." -H "content-type: application/json" -d '{"suite":"Smoke"}'
 */
export const ciRouter = Router();

async function keyAuth(req: Request) {
  const key = req.header('x-api-key') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) throw unauthorized('Missing X-API-Key header');
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: sha256(key) } });
  if (!apiKey) throw unauthorized('Invalid API key');
  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
  return apiKey;
}

ciRouter.post('/runs', async (req, res) => {
  const key = await keyAuth(req);
  const body = z
    .object({
      suiteId: z.string().optional(),
      suite: z.string().optional().describe('Suite name (alternative to suiteId)'),
      environment: z.string().optional().describe('Environment name'),
      browsers: z.array(z.enum(['chromium', 'firefox', 'webkit'])).optional(),
      metadata: z.record(z.string()).optional().describe('e.g. commit sha, branch, build URL'),
    })
    .parse(req.body ?? {});

  let suiteId = body.suiteId;
  if (!suiteId && body.suite) {
    const s = await prisma.testSuite.findFirst({ where: { projectId: key.projectId, name: { equals: body.suite, mode: 'insensitive' } } });
    if (!s) throw notFound(`Suite "${body.suite}"`);
    suiteId = s.id;
  }
  let environmentId: string | undefined;
  if (body.environment) {
    const e = await prisma.environment.findFirst({ where: { projectId: key.projectId, name: { equals: body.environment, mode: 'insensitive' } } });
    if (!e) throw badRequest(`Unknown environment "${body.environment}"`);
    environmentId = e.id;
  }
  const run = await createRun({
    projectId: key.projectId,
    suiteId,
    environmentId,
    browsers: body.browsers,
    trigger: 'CI',
    ciMetadata: body.metadata,
  });
  res.status(201).json({ runId: run.id, status: run.status, statusUrl: `/api/ci/runs/${run.id}`, reportUrl: `${config.APP_URL}/runs/${run.id}` });
});

ciRouter.get('/runs/:runId', async (req, res) => {
  const key = await keyAuth(req);
  const run = await prisma.testRun.findFirst({
    where: { id: req.params.runId, projectId: key.projectId },
    include: { results: { where: { status: { in: ['FAILED', 'ERROR'] } }, select: { testCaseName: true, suiteName: true, browser: true, errorMessage: true } } },
  });
  if (!run) throw notFound('Test run');
  const done = !['QUEUED', 'RUNNING'].includes(run.status);
  res.json({
    runId: run.id,
    status: run.status,
    done,
    success: run.status === 'PASSED',
    total: run.total,
    passed: run.passed,
    failed: run.failed,
    skipped: run.skipped,
    flaky: run.flaky,
    durationMs: run.durationMs,
    failures: run.results,
    reportUrl: `${config.APP_URL}/runs/${run.id}`,
  });
});
