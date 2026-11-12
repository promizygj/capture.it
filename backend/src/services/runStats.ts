import { prisma } from '../lib/prisma.js';

/** Recomputes a run's counters from its results (source of truth). */
export async function recountRun(runId: string) {
  const groups = await prisma.testResult.groupBy({ by: ['status'], where: { runId }, _count: true });
  const n = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const flaky = await prisma.testResult.count({ where: { runId, isFlaky: true } });
  const counts = {
    total: groups.reduce((a, g) => a + g._count, 0),
    passed: n('PASSED'),
    failed: n('FAILED') + n('ERROR'),
    skipped: n('SKIPPED'),
    flaky,
  };
  await prisma.testRun.update({ where: { id: runId }, data: counts });
  return counts;
}
