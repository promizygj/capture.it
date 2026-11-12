import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, Shuffle, Timer, Bug } from 'lucide-react';
import { useInsightsQuery } from '../../store/api';
import { EmptyState, PageLoader } from '../../components/ui';
import { formatDuration, timeAgo } from '../../lib/format';

function Sequence({ seq }: { seq: ('P' | 'F')[] }) {
  // Oldest → newest, left to right
  return (
    <div className="flex gap-0.5" role="img" aria-label={`Recent results, newest last: ${[...seq].reverse().map((s) => (s === 'P' ? 'pass' : 'fail')).join(', ')}`}>
      {[...seq].reverse().map((s, i) => <span key={i} className={`h-4 w-1.5 rounded-sm ${s === 'P' ? 'bg-good' : 'bg-bad'}`} />)}
    </div>
  );
}

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{desc}</p>
      </div>
      {children}
    </section>
  );
}

export function InsightsTab({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useInsightsQuery({ projectId, days });
  if (isLoading || !data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={<Shuffle className="h-4 w-4 text-warn-ink" />} title="Flaky tests" desc="Tests whose outcome flips between runs, or that only passed after a retry.">
          {!data.flaky.length ? <EmptyState title="No flaky tests detected" /> : (
            <ul className="divide-y divide-line">
              {data.flaky.map((f) => (
                <li key={f.testCaseId} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="text-xs text-ink-3">{f.suiteName} · {f.flips} flips · {f.retryPasses} retry passes · {f.executions} runs</div>
                  </div>
                  <Sequence seq={f.recent} />
                  <div className="w-12 text-right text-sm font-semibold tabular-nums" title="Flakiness score">{Math.round(f.flakinessScore * 100)}%</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section icon={<Repeat className="h-4 w-4 text-bad-ink" />} title="Recurring failures" desc="Tests failing repeatedly or on consecutive runs.">
          {!data.recurring.length ? <EmptyState title="No recurring failures" /> : (
            <ul className="divide-y divide-line">
              {data.recurring.map((r) => (
                <li key={r.testCaseId} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</div>
                    <span className="text-xs tabular-nums text-ink-2">{r.failureRate}% fail rate{r.currentStreak > 1 ? ` · ${r.currentStreak} in a row` : ''}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-bad-ink" title={r.topError}>{r.topError}</div>
                  <div className="text-xs text-ink-3">{r.suiteName} · last failed {timeAgo(r.lastFailedAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section icon={<Bug className="h-4 w-4 text-ink-2" />} title="Most common errors" desc="Similar error messages grouped together; one error across many tests often has a shared root cause.">
          {!data.commonErrors.length ? <EmptyState title="No errors recorded" /> : (
            <ul className="divide-y divide-line">
              {data.commonErrors.map((e) => (
                <li key={e.signature} className="px-5 py-3">
                  <div className="flex gap-3"><code className="min-w-0 flex-1 break-words text-xs">{e.signature}</code><span className="text-sm font-semibold tabular-nums">{e.count}×</span></div>
                  <div className="mt-1 text-xs text-ink-3">{e.tests.join(', ')}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section icon={<Timer className="h-4 w-4 text-ink-2" />} title="Slowest tests" desc="Average execution time per test case.">
          {!data.slowest.length ? <EmptyState title="No data yet" /> : (
            <ul className="divide-y divide-line">
              {data.slowest.map((s) => (
                <li key={s.testCaseId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{s.name} <span className="text-xs text-ink-3">· {s.suiteName}</span></span>
                  <span className="tabular-nums text-ink-2">{formatDuration(s.avgDurationMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <p className="text-xs text-ink-3">Tip: open a failed result and use <Link to="/runs" className="text-primary hover:underline">AI failure analysis</Link> to get likely causes.</p>
    </div>
  );
}
