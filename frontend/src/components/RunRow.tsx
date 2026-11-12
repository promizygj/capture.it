import { Link } from 'react-router-dom';
import { CalendarClock, GitBranch, User } from 'lucide-react';
import type { Run } from '../types';
import { formatDuration, timeAgo } from '../lib/format';
import { ResultBar, StatusBadge } from './ui';

export function TriggerLabel({ run }: { run: Run }) {
  if (run.trigger === 'SCHEDULE') return <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Scheduled</span>;
  if (run.trigger === 'CI') return <span className="inline-flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> CI{run.ciMetadata?.branch ? ` · ${run.ciMetadata.branch}` : ''}</span>;
  return <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {run.triggeredBy?.name ?? 'Manual'}</span>;
}

/** Compact list item used on the dashboard & project pages */
export function RunListItem({ run, showProject = true }: { run: Run; showProject?: boolean }) {
  return (
    <Link to={`/runs/${run.id}`} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-28 shrink-0"><StatusBadge status={run.status} /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {showProject && run.project ? `${run.project.name} · ` : ''}
          {run.suite?.name ?? 'All suites'}
          {run.environment ? <span className="font-normal text-ink-3"> · {run.environment.name}</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
          <TriggerLabel run={run} />
          <span>{timeAgo(run.queuedAt)}</span>
          <span>{formatDuration(run.durationMs)}</span>
        </div>
      </div>
      <div className="w-full sm:w-44">
        <div className="mb-1 text-right text-xs tabular-nums text-ink-2">
          {run.passed}/{run.total} passed{run.failed ? ` · ${run.failed} failed` : ''}
        </div>
        <ResultBar passed={run.passed} failed={run.failed} skipped={run.skipped} total={run.total} />
      </div>
    </Link>
  );
}
