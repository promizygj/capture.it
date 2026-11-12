import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCompareQuery } from '../store/api';
import { BrowserTag, EmptyState, PageHeader, PageLoader, StatTile, StatusBadge } from '../components/ui';
import { formatDate, formatDuration } from '../lib/format';

const CHANGE_LABEL = { regressed: 'Regressed', fixed: 'Fixed', changed: 'Changed', unchanged: 'Unchanged', added: 'New', removed: 'Removed' } as const;
const CHANGE_CLS = { regressed: 'text-bad-ink', fixed: 'text-good-ink', changed: 'text-warn-ink', unchanged: 'text-ink-3', added: 'text-primary', removed: 'text-ink-3' } as const;

export function ComparePage() {
  const [params] = useSearchParams();
  const base = params.get('base') ?? '';
  const head = params.get('head') ?? '';
  const { data, isLoading, error } = useCompareQuery({ base, head }, { skip: !base || !head });
  const [onlyChanges, setOnlyChanges] = useState(true);

  if (isLoading) return <PageLoader />;
  if (!base || !head || error || !data) return <div className="card"><EmptyState title="Select two runs to compare" action={<Link to="/runs" className="btn-primary">Go to history</Link>} /></div>;

  // Older run is always the baseline
  const [b, h] = new Date(data.base.queuedAt) <= new Date(data.head.queuedAt) ? [data.base, data.head] : [data.head, data.base];
  const swapped = b !== data.base;
  const rows = data.rows
    .map((r) => (swapped ? { ...r, base: r.head, head: r.base, change: ({ fixed: 'regressed', regressed: 'fixed', added: 'removed', removed: 'added' } as const)[r.change as 'fixed'] ?? r.change, durationDeltaMs: r.durationDeltaMs === null ? null : -r.durationDeltaMs } : r))
    .filter((r) => !onlyChanges || r.change !== 'unchanged')
    .sort((x, y) => ['regressed', 'fixed', 'changed', 'added', 'removed', 'unchanged'].indexOf(x.change) - ['regressed', 'fixed', 'changed', 'added', 'removed', 'unchanged'].indexOf(y.change));
  const count = (k: string) => data.rows.filter((r) => (swapped ? ({ fixed: 'regressed', regressed: 'fixed' } as Record<string, string>)[r.change] ?? r.change : r.change) === k).length;

  return (
    <>
      <PageHeader breadcrumb={<Link to="/runs" className="hover:underline">Execution history</Link>} title="Compare test runs" />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {[{ r: b, label: 'Baseline (older)' }, { r: h, label: 'Compared (newer)' }].map(({ r, label }) => (
          <Link key={r.id} to={`/runs/${r.id}`} className="card p-4 hover:shadow-md">
            <div className="text-xs text-ink-3">{label}</div>
            <div className="mt-1 flex items-center gap-2 font-medium">{r.suite?.name ?? 'All suites'} <StatusBadge status={r.status} size="sm" /></div>
            <div className="mt-1 text-xs text-ink-2">{formatDate(r.queuedAt)} · {r.environment?.name ?? 'default'} · {r.passed}/{r.total} passed · {formatDuration(r.durationMs)}</div>
          </Link>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Regressed" value={count('regressed')} tone={count('regressed') ? 'bad' : undefined} />
        <StatTile label="Fixed" value={count('fixed')} tone={count('fixed') ? 'good' : undefined} />
        <StatTile label="Unchanged" value={count('unchanged')} />
        <StatTile label="Added / removed" value={`${count('added')} / ${count('removed')}`} />
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Only show differences</label>
      <div className="card overflow-x-auto">
        {!rows.length ? <EmptyState title="No differences between these runs" /> : (
          <table className="table-base min-w-[720px]">
            <thead><tr><th>Test</th><th>Change</th><th>Baseline</th><th>Compared</th><th>Δ duration</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><div className="font-medium">{r.name}</div><div className="flex items-center gap-1.5 text-xs text-ink-3">{r.suiteName} <BrowserTag browser={r.browser} /></div></td>
                  <td className={`font-medium ${CHANGE_CLS[r.change]}`}>{CHANGE_LABEL[r.change]}</td>
                  <td>{r.base ? <Link to={`/results/${r.base.resultId}`}><StatusBadge status={r.base.status} size="sm" /></Link> : '—'}</td>
                  <td>{r.head ? <Link to={`/results/${r.head.resultId}`}><StatusBadge status={r.head.status} size="sm" /></Link> : '—'}</td>
                  <td className="tabular-nums text-ink-2">{r.durationDeltaMs === null ? '—' : `${r.durationDeltaMs >= 0 ? '+' : '−'}${formatDuration(Math.abs(r.durationDeltaMs))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
