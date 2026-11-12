import type { ResultStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const FINAL: ResultStatus[] = ['PASSED', 'FAILED', 'ERROR'];
const isFail = (s: ResultStatus) => s === 'FAILED' || s === 'ERROR';

/** Normalises an error message so the "same" error across runs groups together (strips numbers, ids, quoted values). */
export function errorSignature(msg: string | null): string {
  if (!msg) return 'Unknown error';
  return msg
    .split('\n')[0]
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\d+(\.\d+)?(ms|s|%)?/g, '<n>')
    .slice(0, 180);
}

interface CaseHistory {
  testCaseId: string;
  name: string;
  suiteName: string;
  template: string;
  history: { status: ResultStatus; runId: string; at: Date; isFlaky: boolean; error: string | null; durationMs: number | null }[];
}

async function loadHistories(projectId: string, days: number, perCase = 20) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.testResult.findMany({
    where: { run: { projectId }, status: { in: FINAL }, testCaseId: { not: null }, finishedAt: { gte: since } },
    select: {
      testCaseId: true,
      testCaseName: true,
      suiteName: true,
      template: true,
      status: true,
      runId: true,
      finishedAt: true,
      isFlaky: true,
      errorMessage: true,
      durationMs: true,
    },
    orderBy: { finishedAt: 'desc' },
    take: 10000,
  });
  const map = new Map<string, CaseHistory>();
  for (const r of rows) {
    const key = r.testCaseId!;
    let h = map.get(key);
    if (!h) {
      h = { testCaseId: key, name: r.testCaseName, suiteName: r.suiteName, template: r.template, history: [] };
      map.set(key, h);
    }
    if (h.history.length < perCase)
      h.history.push({ status: r.status, runId: r.runId, at: r.finishedAt!, isFlaky: r.isFlaky, error: r.errorMessage, durationMs: r.durationMs });
  }
  return [...map.values()];
}

/**
 * A test is flaky when its outcome changes between runs without a consistent trend, or when it only
 * passed after a retry. Score = status flips / (executions - 1), boosted by retry-passes.
 */
export async function getProjectInsights(projectId: string, days = 30) {
  const histories = await loadHistories(projectId, days);

  const flaky = histories
    .map((h) => {
      const seq = h.history.map((x) => (isFail(x.status) ? 'F' : 'P'));
      let flips = 0;
      for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) flips++;
      const retryPasses = h.history.filter((x) => x.isFlaky).length;
      const failures = seq.filter((s) => s === 'F').length;
      const score = seq.length > 1 ? Math.min(1, (flips + retryPasses) / (seq.length - 1)) : 0;
      return {
        testCaseId: h.testCaseId,
        name: h.name,
        suiteName: h.suiteName,
        executions: seq.length,
        failures,
        flips,
        retryPasses,
        flakinessScore: Math.round(score * 100) / 100,
        recent: seq.slice(0, 10),
      };
    })
    .filter((f) => f.executions >= 3 && (f.flips >= 2 || f.retryPasses > 0) && f.failures < f.executions)
    .sort((a, b) => b.flakinessScore - a.flakinessScore)
    .slice(0, 20);

  const recurring = histories
    .map((h) => {
      const failures = h.history.filter((x) => isFail(x.status));
      let streak = 0;
      for (const x of h.history) {
        if (isFail(x.status)) streak++;
        else break;
      }
      const sigs = new Map<string, number>();
      failures.forEach((f) => sigs.set(errorSignature(f.error), (sigs.get(errorSignature(f.error)) ?? 0) + 1));
      const [topError, topCount] = [...sigs.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
      return {
        testCaseId: h.testCaseId,
        name: h.name,
        suiteName: h.suiteName,
        executions: h.history.length,
        failures: failures.length,
        failureRate: h.history.length ? Math.round((failures.length / h.history.length) * 100) : 0,
        currentStreak: streak,
        topError,
        topErrorCount: topCount,
        lastFailedAt: failures[0]?.at ?? null,
      };
    })
    .filter((r) => r.failures >= 2 && (r.currentStreak >= 2 || r.failureRate >= 30))
    .sort((a, b) => b.currentStreak - a.currentStreak || b.failureRate - a.failureRate)
    .slice(0, 20);

  // Error signatures that occur across multiple tests usually point to a shared root cause
  const errorGroups = new Map<string, { signature: string; count: number; tests: Set<string> }>();
  for (const h of histories)
    for (const x of h.history)
      if (isFail(x.status)) {
        const sig = errorSignature(x.error);
        const g = errorGroups.get(sig) ?? { signature: sig, count: 0, tests: new Set<string>() };
        g.count++;
        g.tests.add(h.name);
        errorGroups.set(sig, g);
      }
  const commonErrors = [...errorGroups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((g) => ({ signature: g.signature, count: g.count, tests: [...g.tests].slice(0, 5) }));

  const slowest = histories
    .map((h) => {
      const d = h.history.map((x) => x.durationMs ?? 0).filter(Boolean);
      return { testCaseId: h.testCaseId, name: h.name, suiteName: h.suiteName, avgDurationMs: d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : 0 };
    })
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 10);

  return { days, flaky, recurring, commonErrors, slowest };
}

/** Side-by-side comparison of two runs, keyed by test case + browser. */
export async function compareRuns(baseId: string, headId: string) {
  const [base, head] = await Promise.all(
    [baseId, headId].map((id) =>
      prisma.testRun.findUnique({
        where: { id },
        include: { results: { orderBy: [{ suiteName: 'asc' }, { testCaseName: 'asc' }] }, environment: true, suite: true },
      }),
    ),
  );
  if (!base || !head) return null;
  const key = (r: { testCaseId: string | null; testCaseName: string; browser: string }) => `${r.testCaseId ?? r.testCaseName}:${r.browser}`;
  const baseMap = new Map(base.results.map((r) => [key(r), r]));
  const headMap = new Map(head.results.map((r) => [key(r), r]));
  const keys = [...new Set([...baseMap.keys(), ...headMap.keys()])];

  const rows = keys.map((k) => {
    const b = baseMap.get(k);
    const h = headMap.get(k);
    const bs = b?.status ?? null;
    const hs = h?.status ?? null;
    let change: 'fixed' | 'regressed' | 'unchanged' | 'added' | 'removed' | 'changed';
    if (!b) change = 'added';
    else if (!h) change = 'removed';
    else if (bs === hs) change = 'unchanged';
    else if (isFail(bs!) && hs === 'PASSED') change = 'fixed';
    else if (bs === 'PASSED' && isFail(hs!)) change = 'regressed';
    else change = 'changed';
    return {
      key: k,
      name: (h ?? b)!.testCaseName,
      suiteName: (h ?? b)!.suiteName,
      browser: (h ?? b)!.browser,
      base: b ? { resultId: b.id, status: b.status, durationMs: b.durationMs, error: b.errorMessage } : null,
      head: h ? { resultId: h.id, status: h.status, durationMs: h.durationMs, error: h.errorMessage } : null,
      durationDeltaMs: b?.durationMs != null && h?.durationMs != null ? h.durationMs - b.durationMs : null,
      change,
    };
  });
  const summary = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.change] = (acc[r.change] ?? 0) + 1), acc), {});
  const strip = ({ results: _r, ...run }: typeof base) => run;
  return { base: strip(base), head: strip(head), summary, rows };
}

export async function getDashboard(projectIds: string[], days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const where = { run: { projectId: { in: projectIds } }, finishedAt: { gte: since } };
  const [byStatus, avg, recentRuns, runsByDay, projects] = await Promise.all([
    prisma.testResult.groupBy({ by: ['status'], where, _count: true }),
    prisma.testResult.aggregate({ where: { ...where, status: { in: FINAL } }, _avg: { durationMs: true } }),
    prisma.testRun.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { queuedAt: 'desc' },
      take: 8,
      include: { project: { select: { id: true, name: true } }, suite: { select: { name: true } }, environment: { select: { name: true } } },
    }),
    prisma.$queryRaw<{ day: Date; passed: bigint; failed: bigint; skipped: bigint }[]>`
      SELECT date_trunc('day', r."finishedAt") AS day,
             COUNT(*) FILTER (WHERE r.status = 'PASSED') AS passed,
             COUNT(*) FILTER (WHERE r.status IN ('FAILED','ERROR')) AS failed,
             COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped
      FROM "TestResult" r JOIN "TestRun" t ON t.id = r."runId"
      WHERE t."projectId" = ANY(${projectIds}) AND r."finishedAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
  ]);

  const perProject = await prisma.$queryRaw<{ projectId: string; passed: bigint; failed: bigint; skipped: bigint; runs: bigint }[]>`
    SELECT t."projectId",
           COUNT(r.id) FILTER (WHERE r.status = 'PASSED') AS passed,
           COUNT(r.id) FILTER (WHERE r.status IN ('FAILED','ERROR')) AS failed,
           COUNT(r.id) FILTER (WHERE r.status = 'SKIPPED') AS skipped,
           COUNT(DISTINCT t.id) AS runs
    FROM "TestRun" t LEFT JOIN "TestResult" r ON r."runId" = t.id AND r."finishedAt" >= ${since}
    WHERE t."projectId" = ANY(${projectIds}) AND t."queuedAt" >= ${since}
    GROUP BY 1`;

  const n = (s: string) => byStatus.find((g) => g.status === s)?._count ?? 0;
  const passed = n('PASSED');
  const failed = n('FAILED') + n('ERROR');
  const skipped = n('SKIPPED');
  const executed = passed + failed;
  return {
    days,
    totals: {
      executed: executed + skipped,
      passed,
      failed,
      skipped,
      successRate: executed ? Math.round((passed / executed) * 1000) / 10 : null,
      avgDurationMs: avg._avg.durationMs ? Math.round(avg._avg.durationMs) : null,
    },
    trend: runsByDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), passed: Number(d.passed), failed: Number(d.failed), skipped: Number(d.skipped) })),
    byProject: projects.map((p) => {
      const row = perProject.find((r) => r.projectId === p.id);
      const pp = Number(row?.passed ?? 0);
      const pf = Number(row?.failed ?? 0);
      return {
        projectId: p.id,
        name: p.name,
        runs: Number(row?.runs ?? 0),
        passed: pp,
        failed: pf,
        skipped: Number(row?.skipped ?? 0),
        successRate: pp + pf ? Math.round((pp / (pp + pf)) * 1000) / 10 : null,
      };
    }),
    recentRuns,
  };
}
