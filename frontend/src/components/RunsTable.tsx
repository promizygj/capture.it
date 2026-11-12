import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GitCompare, History } from 'lucide-react';
import { useRunsQuery, type RunFilters } from '../store/api';
import { EmptyState, ResultBar, Spinner, StatusBadge } from './ui';
import { TriggerLabel } from './RunRow';
import { formatDate, formatDuration } from '../lib/format';
import type { ProjectListItem } from '../types';

const STATUS_OPTIONS = [
  { v: '', l: 'All statuses' },
  { v: 'PASSED', l: 'Passed' },
  { v: 'FAILED,ERROR', l: 'Failed' },
  { v: 'RUNNING,QUEUED', l: 'In progress' },
  { v: 'CANCELLED', l: 'Cancelled' },
];

/** Filterable, paginated execution history with "compare two runs" selection */
export function RunsTable({ projectId, projects }: { projectId?: string; projects?: ProjectListItem[] }) {
  const navigate = useNavigate();
  const [f, setF] = useState<RunFilters>({ page: 1, pageSize: 20, projectId });
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isLoading, isFetching } = useRunsQuery(
    Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined)) as RunFilters,
    { pollingInterval: 10000 },
  );
  const set = (patch: Partial<RunFilters>) => setF({ ...f, ...patch, page: patch.page ?? 1 });
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));
  const pages = data ? Math.max(1, Math.ceil(data.total / (f.pageSize ?? 20))) : 1;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {projects && (
          <select className="input w-auto" value={f.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })} aria-label="Project">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select className="input w-auto" value={f.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })} aria-label="Status" data-testid="status-filter">
          {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select className="input w-auto" value={f.trigger ?? ''} onChange={(e) => set({ trigger: e.target.value || undefined })} aria-label="Trigger">
          <option value="">Any trigger</option><option value="MANUAL">Manual</option><option value="SCHEDULE">Scheduled</option><option value="CI">CI/CD</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">From <input type="date" className="input w-auto" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">To <input type="date" className="input w-auto" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
        {isFetching && <Spinner className="h-4 w-4" />}
        <div className="ml-auto">
          <button
            className="btn-secondary"
            disabled={selected.length !== 2}
            onClick={() => navigate(`/runs/compare?base=${selected[0]}&head=${selected[1]}`)}
            title="Select two runs to compare"
          >
            <GitCompare className="h-4 w-4" /> Compare{selected.length ? ` (${selected.length}/2)` : ''}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !data?.runs.length ? (
          <EmptyState icon={<History className="h-7 w-7" />} title="No test runs match these filters" />
        ) : (
          <table className="table-base min-w-[760px]">
            <thead>
              <tr>
                <th className="w-8"><span className="sr-only">Select</span></th>
                <th>Status</th><th>Run</th><th>Started</th><th>Duration</th><th className="w-48">Results</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td><input type="checkbox" aria-label="Select for comparison" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td><StatusBadge status={r.status} size="sm" /></td>
                  <td>
                    <Link to={`/runs/${r.id}`} className="font-medium hover:text-primary">
                      {!projectId && r.project ? `${r.project.name} · ` : ''}{r.suite?.name ?? 'All suites'}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-3">
                      <TriggerLabel run={r} />
                      {r.environment && <span>· {r.environment.name}</span>}
                      <span>· {r.browsers.join(', ')}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{formatDate(r.startedAt ?? r.queuedAt)}</td>
                  <td className="tabular-nums text-ink-2">{formatDuration(r.durationMs)}</td>
                  <td>
                    <div className="mb-1 text-xs tabular-nums text-ink-2">{r.passed} passed · {r.failed} failed · {r.skipped} skipped</div>
                    <ResultBar passed={r.passed} failed={r.failed} skipped={r.skipped} total={r.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > (f.pageSize ?? 20) && (
        <div className="mt-3 flex items-center justify-between text-sm text-ink-2">
          <span>{data.total} runs</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn-sm" disabled={(f.page ?? 1) <= 1} onClick={() => set({ page: (f.page ?? 1) - 1 })}>Previous</button>
            <span>Page {f.page} of {pages}</span>
            <button className="btn-secondary btn-sm" disabled={(f.page ?? 1) >= pages} onClick={() => set({ page: (f.page ?? 1) + 1 })}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
