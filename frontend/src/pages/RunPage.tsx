import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, Image as ImageIcon, RotateCw, Shuffle, Trash2 } from 'lucide-react';
import { useCancelRunMutation, useDeleteRunMutation, useRerunMutation, useRunQuery } from '../store/api';
import { BrowserTag, ConfirmButton, EmptyState, PageHeader, PageLoader, StatTile, StatusBadge, StatusIcon } from '../components/ui';
import { TriggerLabel } from '../components/RunRow';
import { formatDate, formatDuration } from '../lib/format';
import type { ResultStatus } from '../types';

const FILTERS: { key: string; label: string; match: (s: ResultStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'failed', label: 'Failed', match: (s) => s === 'FAILED' || s === 'ERROR' },
  { key: 'passed', label: 'Passed', match: (s) => s === 'PASSED' },
  { key: 'skipped', label: 'Skipped', match: (s) => s === 'SKIPPED' },
];

export function RunPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [poll, setPoll] = useState(1500);
  const { data, isLoading, error } = useRunQuery(runId, { pollingInterval: poll });
  const [cancel] = useCancelRunMutation();
  const [rerun, { isLoading: rerunning }] = useRerunMutation();
  const [del] = useDeleteRunMutation();
  const [filter, setFilter] = useState('all');

  const run = data?.run;
  const active = run && (run.status === 'QUEUED' || run.status === 'RUNNING');
  // Poll quickly while the run executes, stop once it has finished
  useEffect(() => {
    if (run) setPoll(active ? 1500 : 0);
  }, [run, active]);

  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof run>['results']>();
    const f = FILTERS.find((x) => x.key === filter)!;
    run?.results.filter((r) => f.match(r.status)).forEach((r) => m.set(r.suiteName, [...(m.get(r.suiteName) ?? []), r]));
    return [...m.entries()];
  }, [run, filter]);

  if (isLoading) return <PageLoader />;
  if (error || !run) return <div className="card"><EmptyState title="Run not found" /></div>;

  const done = run.results.filter((r) => !['PENDING', 'RUNNING'].includes(r.status)).length;
  const runningNow = run.results.filter((r) => r.status === 'RUNNING');
  const progress = run.total ? Math.round((done / run.total) * 100) : 0;
  const rate = run.passed + run.failed ? Math.round((run.passed / (run.passed + run.failed)) * 1000) / 10 : null;

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/runs" className="hover:underline">Execution history</Link>{run.project && <> / <Link to={`/projects/${run.project.id}`} className="hover:underline">{run.project.name}</Link></>}</>}
        title={<span className="flex flex-wrap items-center gap-3">{run.suite?.name ?? 'All suites'} <StatusBadge status={run.status} /></span>}
        subtitle={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <TriggerLabel run={run} />
            <span>{run.environment?.name ?? 'default'} ({run.environment?.baseUrl ?? run.project?.baseUrl})</span>
            <span>{run.browsers.join(', ')}</span>
            <span>queued {formatDate(run.queuedAt, true)}</span>
            {run.ciMetadata && Object.entries(run.ciMetadata).map(([k, v]) => <span key={k} className="font-mono text-xs">{k}={v}</span>)}
          </span>
        }
        actions={
          <>
            {active ? (
              <ConfirmButton className="btn-secondary" confirmLabel="Cancel run?" onConfirm={() => cancel(run.id)}><Ban className="h-4 w-4" /> Cancel</ConfirmButton>
            ) : (
              <>
                <button className="btn-secondary" disabled={rerunning} onClick={async () => { const r = await rerun(run.id); if ('data' in r && r.data) navigate(`/runs/${r.data.run.id}`); }}><RotateCw className="h-4 w-4" /> Re-run</button>
                <ConfirmButton className="btn-ghost" confirmLabel="Delete run?" onConfirm={async () => { await del(run.id); navigate('/runs'); }}><Trash2 className="h-4 w-4" /></ConfirmButton>
              </>
            )}
          </>
        }
      />

      {active && (
        <div className="card mb-6 p-5" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">{run.status === 'QUEUED' ? 'Waiting for a worker…' : `Executing tests — ${done} of ${run.total} complete`}</span>
            <span className="tabular-nums text-ink-2">{progress}%</span>
          </div>
          <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} data-testid="run-progress">
            <div className="bg-good transition-all" style={{ width: `${(run.passed / Math.max(run.total, 1)) * 100}%` }} />
            <div className="bg-bad transition-all" style={{ width: `${(run.failed / Math.max(run.total, 1)) * 100}%` }} />
            <div className="bg-skip transition-all" style={{ width: `${(run.skipped / Math.max(run.total, 1)) * 100}%` }} />
          </div>
          {runningNow.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-2">
              {runningNow.map((r) => <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-primary"><StatusIcon status="RUNNING" className="h-3 w-3" /> {r.testCaseName} · {r.browser}</span>)}
            </div>
          )}
        </div>
      )}

      {run.errorMessage && <div className="card mb-6 border-bad/40 p-4 text-sm text-bad-ink">{run.errorMessage}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total" value={run.total} />
        <StatTile label="Passed" value={run.passed} tone={run.passed ? 'good' : undefined} />
        <StatTile label="Failed" value={run.failed} tone={run.failed ? 'bad' : undefined} />
        <StatTile label="Skipped" value={run.skipped} />
        <StatTile label="Success rate" value={rate === null ? '—' : `${rate}%`} hint={run.flaky ? `${run.flaky} flaky` : undefined} />
        <StatTile label="Duration" value={formatDuration(run.durationMs)} hint={run.startedAt ? `started ${formatDate(run.startedAt, true)}` : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter results">
        {FILTERS.map((f) => {
          const n = run.results.filter((r) => f.match(r.status)).length;
          return <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.key ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-2'}`}>{f.label} ({n})</button>;
        })}
      </div>

      <div className="space-y-4">
        {groups.map(([suite, results]) => (
          <section key={suite} className="card overflow-hidden">
            <h2 className="border-b border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold">{suite}</h2>
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={r.id}>
                  <Link to={`/results/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3" data-testid="result-row">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <StatusIcon status={r.status} className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {r.testCaseName}
                          <BrowserTag browser={r.browser} />
                          {r.isFlaky && <span className="inline-flex items-center gap-1 text-[11px] text-warn-ink"><Shuffle className="h-3 w-3" /> flaky (passed on attempt {r.attempts})</span>}
                          {r.screenshotPath && <ImageIcon className="h-3.5 w-3.5 text-ink-3" aria-label="Has screenshot" />}
                        </div>
                        {r.errorMessage && r.status !== 'PASSED' && <div className="mt-0.5 line-clamp-2 font-mono text-xs text-bad-ink">{r.errorMessage.split('\n')[0]}</div>}
                      </div>
                    </div>
                    <div className="pl-6 text-xs tabular-nums text-ink-3 sm:pl-0 sm:text-right">{r.status === 'RUNNING' ? 'running…' : formatDuration(r.durationMs)}{r.attempts > 1 && !r.isFlaky ? ` · ${r.attempts} attempts` : ''}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <div className="card"><EmptyState title="No results match this filter" /></div>}
      </div>
    </>
  );
}
