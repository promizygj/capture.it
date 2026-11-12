import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

// Runs are executed directly in-process; nothing is pushed to Redis
vi.mock('../src/queue.js', () => ({ enqueueRun: vi.fn(async () => undefined), syncSchedule: vi.fn(), removeSchedule: vi.fn() }));

const { prisma } = await import('../src/lib/prisma.js');
const { createRun, cancelRun } = await import('../src/services/runService.js');
const { executeRun } = await import('../src/services/executeRun.js');
const { getProjectInsights, compareRuns } = await import('../src/services/insights.js');
const { templateMap } = await import('../src/engine/templates.js');
const { liveBrowserCount, closeAllBrowsers } = await import('../src/engine/browserPool.js');
const { resolveArtifact } = await import('../src/lib/storage.js');
const { startFixtureServer } = await import('./fixtureServer.js');

let server: Awaited<ReturnType<typeof startFixtureServer>>;
let userId: string;

function caseData(name: string, template: string, targetUrl: string, config: Record<string, unknown>, extra: Partial<Prisma.TestCaseCreateWithoutSuiteInput> = {}) {
  const { steps, expectations } = templateMap.get(template)!.build(config);
  return { name, template, targetUrl, config: config as Prisma.InputJsonValue, steps: steps as unknown as Prisma.InputJsonValue, expectations: expectations as unknown as Prisma.InputJsonValue, ...extra };
}

async function makeProject(opts: { maxParallel?: number; retries?: number; cases: ReturnType<typeof caseData>[]; suiteEnabled?: boolean }) {
  return prisma.project.create({
    data: {
      name: `P ${Math.random()}`,
      baseUrl: server.url,
      maxParallel: opts.maxParallel ?? 3,
      retries: opts.retries ?? 0,
      notifyEmail: false,
      members: { create: { userId, role: 'OWNER' } },
      environments: { create: { name: 'Test', baseUrl: server.url, isDefault: true } },
      suites: { create: { name: 'Suite', enabled: opts.suiteEnabled ?? true, cases: { create: opts.cases } } },
    },
    include: { suites: true },
  });
}

beforeAll(async () => {
  server = await startFixtureServer();
  userId = (await prisma.user.create({ data: { email: `exec-${Date.now()}@t.test`, name: 'Exec', passwordHash: 'x' } })).id;
});
afterAll(async () => {
  await closeAllBrowsers();
  await server.close();
  await prisma.$disconnect();
});

describe('run execution', () => {
  it('records accurate results, durations, screenshots and logs', async () => {
    const p = await makeProject({
      cases: [
        caseData('home', 'page-load', '/demo/', { expectedTitle: 'Demo Shop' }),
        caseData('broken', 'page-load', '/demo/broken', { failOnConsoleErrors: true }),
        caseData('api', 'api-request', '/api/items', { expectedStatus: 200 }),
        caseData('disabled', 'page-load', '/demo/', {}, { enabled: false }),
      ],
    });
    const run = await createRun({ projectId: p.id, trigger: 'MANUAL', userId, browsers: ['chromium'] });
    expect(run).toMatchObject({ status: 'QUEUED', total: 4, skipped: 1 });

    const finished = await executeRun(run.id);
    expect(finished).toMatchObject({ status: 'FAILED', total: 4, passed: 2, failed: 1, skipped: 1 });
    expect(finished!.durationMs).toBeGreaterThan(0);

    const results = await prisma.testResult.findMany({ where: { runId: run.id } });
    const by = (n: string) => results.find((r) => r.testCaseName === n)!;
    expect(by('home')).toMatchObject({ status: 'PASSED', screenshotPath: null, attempts: 1 });
    expect(by('home').browserVersion).toBeTruthy();
    expect(by('home').durationMs).toBeGreaterThan(0);
    expect(by('home').finishedAt!.getTime()).toBeGreaterThanOrEqual(by('home').startedAt!.getTime());
    expect(by('broken').status).toBe('FAILED');
    expect(by('broken').errorMessage).toMatch(/console errors/);
    expect(fs.existsSync(resolveArtifact(by('broken').screenshotPath!))).toBe(true);
    expect((by('broken').logs as unknown[]).length).toBeGreaterThan(2);
    expect(by('api').browserVersion).toContain('API');
    expect(by('disabled').status).toBe('SKIPPED');
    expect(liveBrowserCount()).toBe(0);
  });

  it('executes test cases in parallel up to maxParallel', async () => {
    const cases = Array.from({ length: 6 }, (_, i) => caseData(`wait ${i}`, 'page-load', '/wait?ms=1500', {}));
    const serial = await makeProject({ maxParallel: 1, cases });
    const parallel = await makeProject({ maxParallel: 6, cases });
    const t0 = Date.now();
    await executeRun((await createRun({ projectId: serial.id, trigger: 'MANUAL' })).id);
    const serialMs = Date.now() - t0;
    const t1 = Date.now();
    const r = await executeRun((await createRun({ projectId: parallel.id, trigger: 'MANUAL' })).id);
    const parallelMs = Date.now() - t1;
    expect(r!.passed).toBe(6);
    expect(serialMs).toBeGreaterThan(6 * 1500);
    expect(parallelMs).toBeLessThan(serialMs / 2);
  });

  it('handles concurrent runs and multiple browsers without mixing results', async () => {
    const a = await makeProject({ cases: [caseData('a1', 'page-load', '/demo/', {}), caseData('a2', 'search', '/demo/', { inputSelector: 'input[type=search]', query: 'gadget', resultSelector: '.result', expectedText: 'Gadget Pro' })] });
    const b = await makeProject({ cases: [caseData('b1', 'page-load', '/demo/contact', { expectedTitle: 'Contact' })] });
    const [ra, rb] = await Promise.all([
      createRun({ projectId: a.id, trigger: 'MANUAL', browsers: ['chromium', 'firefox'] }),
      createRun({ projectId: b.id, trigger: 'CI' }),
    ]);
    const [fa, fb] = await Promise.all([executeRun(ra.id), executeRun(rb.id)]);
    expect(fa).toMatchObject({ status: 'PASSED', total: 4, passed: 4 });
    expect(fb).toMatchObject({ status: 'PASSED', total: 1, passed: 1 });
    const browsers = (await prisma.testResult.findMany({ where: { runId: ra.id } })).map((r) => r.browser).sort();
    expect(browsers).toEqual(['chromium', 'chromium', 'firefox', 'firefox']);
    expect(liveBrowserCount()).toBe(0);
  });

  it('retries failures and flags tests that pass on retry as flaky', async () => {
    server.resetFlaky();
    const p = await makeProject({ retries: 1, cases: [caseData('flaky', 'page-load', '/flaky', { requiredSelector: '#ok' }, { timeoutMs: 8000 })] });
    const run = await executeRun((await createRun({ projectId: p.id, trigger: 'MANUAL' })).id);
    expect(run).toMatchObject({ status: 'PASSED', flaky: 1 });
    const r = await prisma.testResult.findFirstOrThrow({ where: { runId: run!.id } });
    expect(r).toMatchObject({ attempts: 2, isFlaky: true });

    // Run it a few more times without retries so it alternates, then check flaky detection
    await prisma.project.update({ where: { id: p.id }, data: { retries: 0 } });
    for (let i = 0; i < 4; i++) await executeRun((await createRun({ projectId: p.id, trigger: 'MANUAL' })).id);
    const insights = await getProjectInsights(p.id, 1);
    expect(insights.flaky[0]?.name).toBe('flaky');
    expect(insights.flaky[0].flips).toBeGreaterThanOrEqual(2);
  });

  it('identifies recurring failures and compares runs', async () => {
    const p = await makeProject({ cases: [caseData('always fails', 'page-load', '/demo/', { expectedText: 'not on the page' }), caseData('ok', 'page-load', '/demo/', {})] });
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await executeRun((await createRun({ projectId: p.id, trigger: 'MANUAL' })).id));
    const insights = await getProjectInsights(p.id, 1);
    expect(insights.recurring[0]).toMatchObject({ name: 'always fails', currentStreak: 3, failureRate: 100 });
    expect(insights.commonErrors[0].signature).toMatch(/text to contain/);

    const cmp = await compareRuns(runs[0]!.id, runs[2]!.id);
    expect(cmp!.summary).toEqual({ unchanged: 2 });
  });

  it('rejects runs with nothing to execute and supports cancellation', async () => {
    const empty = await makeProject({ cases: [caseData('off', 'page-load', '/', {}, { enabled: false })] });
    await expect(createRun({ projectId: empty.id, trigger: 'MANUAL' })).rejects.toThrow(/no enabled test cases/);
    const disabledSuite = await makeProject({ suiteEnabled: false, cases: [caseData('x', 'page-load', '/', {})] });
    await expect(createRun({ projectId: disabledSuite.id, suiteId: disabledSuite.suites[0].id, trigger: 'MANUAL' })).rejects.toThrow(/disabled/);

    const p = await makeProject({ cases: [caseData('c', 'page-load', '/demo/', {})] });
    const run = await createRun({ projectId: p.id, trigger: 'MANUAL' });
    await cancelRun(run.id);
    expect(await executeRun(run.id)).toBeUndefined(); // worker skips cancelled runs
    const after = await prisma.testRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(after).toMatchObject({ status: 'CANCELLED', skipped: 1 });
  });
});
