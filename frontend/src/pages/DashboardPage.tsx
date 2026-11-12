import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, FolderPlus } from 'lucide-react';
import { useDashboardQuery, useProjectsQuery } from '../store/api';
import { EmptyState, PageHeader, PageLoader, StatTile } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { RunListItem } from '../components/RunRow';
import { formatDuration, pct } from '../lib/format';

const RANGES = [7, 30, 90];

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const [projectId, setProjectId] = useState('');
  const { data: projects } = useProjectsQuery();
  const { data, isLoading } = useDashboardQuery({ days, projectId: projectId || undefined }, { pollingInterval: 15000 });

  if (isLoading || !data) return <PageLoader />;
  const noProjects = projects && projects.projects.length === 0;
  const t = data.totals;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Test health across your projects"
        actions={
          <>
            <select className="input w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project filter">
              <option value="">All projects</option>
              {projects?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex rounded-lg border border-line-strong bg-surface p-0.5" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r} onClick={() => setDays(r)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${days === r ? 'bg-primary-soft text-primary' : 'text-ink-2 hover:text-ink'}`}>
                  {r}d
                </button>
              ))}
            </div>
          </>
        }
      />

      {noProjects ? (
        <div className="card">
          <EmptyState icon={<FolderPlus className="h-8 w-8" />} title="Create your first testing project" action={<Link to="/projects/new" className="btn-primary">New project</Link>}>
            Add a website URL, pick test templates, and run Playwright browser tests in a few clicks.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Tests executed" value={t.executed} hint={`last ${days} days`} />
            <StatTile label="Passed" value={t.passed} />
            <StatTile label="Failed" value={t.failed} tone={t.failed ? 'bad' : undefined} />
            <StatTile label="Skipped" value={t.skipped} />
            <StatTile label="Success rate" value={pct(t.successRate)} hint="passed ÷ executed" />
            <StatTile label="Avg. duration" value={formatDuration(t.avgDurationMs)} hint="per test" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <section className="card p-5 xl:col-span-2">
              <h2 className="mb-4 font-semibold">Results per day</h2>
              <TrendChart data={data.trend} days={days} />
            </section>
            <section className="card">
              <h2 className="border-b border-line px-5 py-4 font-semibold">Results by project</h2>
              {data.byProject.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-3">No projects yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.byProject.map((p) => (
                    <li key={p.projectId}>
                      <Link to={`/projects/${p.projectId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-ink-3">{p.runs} runs · {p.passed} passed · {p.failed} failed</div>
                        </div>
                        <div className="text-right text-sm font-semibold tabular-nums">{pct(p.successRate)}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card mt-6">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">Recent test runs</h2>
              <Link to="/runs" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            {data.recentRuns.length === 0 ? (
              <EmptyState icon={<Activity className="h-7 w-7" />} title="No runs yet">Open a project and press “Run all suites”.</EmptyState>
            ) : (
              <div className="divide-y divide-line">{data.recentRuns.map((r) => <RunListItem key={r.id} run={r} />)}</div>
            )}
          </section>
        </>
      )}
    </>
  );
}
