import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Globe, Plus, Search } from 'lucide-react';
import { useProjectsQuery } from '../store/api';
import { EmptyState, PageHeader, PageLoader, StatusBadge } from '../components/ui';
import { timeAgo } from '../lib/format';

export function ProjectsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, isFetching } = useProjectsQuery(q ? { q } : undefined);

  return (
    <>
      <PageHeader title="Projects" subtitle="Each project targets one website and groups its test suites." actions={<Link to="/projects/new" className="btn-primary"><Plus className="h-4 w-4" /> New project</Link>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input className="input pl-9" placeholder="Search by name or URL" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : !data?.projects.length ? (
        <div className="card">
          <EmptyState icon={<FolderKanban className="h-8 w-8" />} title={q ? 'No matching projects' : 'No projects yet'} action={!q && <Link to="/projects/new" className="btn-primary">Create project</Link>}>
            {q ? 'Try a different search.' : 'Create a project for the website you want to test.'}
          </EmptyState>
        </div>
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${isFetching ? 'opacity-70' : ''}`}>
          {data.projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card flex flex-col p-5 transition-shadow hover:shadow-md" data-testid="project-card">
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 truncate font-semibold">{p.name}</h2>
                {p.lastRun && <StatusBadge status={p.lastRun.status} size="sm" />}
              </div>
              <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-3"><Globe className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{p.baseUrl}</span></div>
              {p.description && <p className="mt-3 line-clamp-2 text-sm text-ink-2">{p.description}</p>}
              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs text-ink-2">
                <span><b className="tabular-nums text-ink">{p._count.suites}</b> suites</span>
                <span><b className="tabular-nums text-ink">{p.caseCount}</b> tests</span>
                <span><b className="tabular-nums text-ink">{p._count.runs}</b> runs</span>
                <span className="ml-auto text-ink-3">{p.lastRun ? `ran ${timeAgo(p.lastRun.queuedAt)}` : 'never run'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
