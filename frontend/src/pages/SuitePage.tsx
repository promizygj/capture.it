import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, FileText, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useDeleteCaseMutation, useDuplicateCaseMutation, useProjectQuery, useSaveCaseMutation, useSuiteQuery, useTemplatesQuery } from '../store/api';
import { ConfirmButton, EmptyState, PageHeader, PageLoader, PriorityTag, StatusIcon, Toggle } from '../components/ui';
import { RunDialog } from '../components/RunDialog';
import { SuiteFormModal } from './project/SuitesTab';
import { formatDuration, timeAgo } from '../lib/format';
import { useToast } from '../lib/useToast';

export function SuitePage() {
  const { projectId = '', suiteId = '' } = useParams();
  const { data, isLoading } = useSuiteQuery(suiteId);
  const { data: proj } = useProjectQuery(projectId);
  const { data: tpl } = useTemplatesQuery();
  const [save] = useSaveCaseMutation();
  const [dup] = useDuplicateCaseMutation();
  const [del] = useDeleteCaseMutation();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('');
  const [runOpen, setRunOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !data) return <PageLoader />;
  const s = data.suite;
  const canEdit = s.role !== 'VIEWER';
  const tplName = (k: string) => tpl?.templates.find((t) => t.key === k)?.name ?? k;
  const cases = s.cases.filter((c) => (!q || c.name.toLowerCase().includes(q.toLowerCase())) && (!priority || c.priority === priority));
  const enabledCount = s.cases.filter((c) => c.enabled).length;

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/projects" className="hover:underline">Projects</Link> / <Link to={`/projects/${projectId}`} className="hover:underline">{s.project.name}</Link></>}
        title={s.name}
        subtitle={<>{s.category} · {enabledCount} of {s.cases.length} enabled{!s.enabled && ' · suite disabled'}{s.description ? ` · ${s.description}` : ''}</>}
        actions={canEdit && (
          <>
            <button className="btn-ghost" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit suite</button>
            <Link to={`/projects/${projectId}/suites/${suiteId}/cases/new`} className="btn-secondary" data-testid="new-case"><Plus className="h-4 w-4" /> Add test case</Link>
            <button className="btn-primary" onClick={() => setRunOpen(true)} disabled={!s.enabled || !enabledCount || !proj} data-testid="run-suite"><Play className="h-4 w-4" /> Run suite</button>
          </>
        )}
      />
      {s.cases.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input className="input pl-9" placeholder="Search test cases" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search test cases" />
          </div>
          <select className="input w-auto" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="">Any priority</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
          </select>
        </div>
      )}
      {!s.cases.length ? (
        <div className="card">
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No test cases yet" action={canEdit && <Link to={`/projects/${projectId}/suites/${suiteId}/cases/new`} className="btn-primary">Add a test case</Link>}>
            Start from a predefined template — page load, login, form validation, cart, API request, visual snapshot and more.
          </EmptyState>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {cases.map((c) => (
            <div key={c.id} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${c.enabled ? '' : 'opacity-60'}`} data-testid="case-row">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {c.lastResult ? <StatusIcon status={c.lastResult.status} className="mt-0.5" /> : <span className="mt-1.5 h-2 w-4 shrink-0" />}
                <Link to={`/projects/${projectId}/suites/${suiteId}/cases/${c.id}`} className="group min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium group-hover:text-primary">{c.name}</span>
                    <PriorityTag priority={c.priority} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-3">
                    {tplName(c.template)} · {c.targetUrl} · timeout {formatDuration(c.timeoutMs)}
                    {c.lastResult && <> · last run {timeAgo(c.lastResult.startedAt)} ({formatDuration(c.lastResult.durationMs)})</>}
                  </div>
                </Link>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 pl-7 sm:pl-0">
                  <Toggle label={c.enabled ? 'Disable test case' : 'Enable test case'} checked={c.enabled} onChange={(v) => save({ suiteId, id: c.id, enabled: v })} />
                  <button className="btn-ghost btn-sm ml-2" onClick={async () => { await dup({ id: c.id, suiteId }); toast('success', 'Test case duplicated'); }} aria-label="Duplicate"><Copy className="h-4 w-4" /></button>
                  <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Delete?" onConfirm={() => del({ id: c.id, suiteId })}><Trash2 className="h-4 w-4" /></ConfirmButton>
                </div>
              )}
            </div>
          ))}
          {!cases.length && <p className="px-4 py-6 text-sm text-ink-3">No test cases match.</p>}
        </div>
      )}
      {runOpen && proj && <RunDialog open project={proj.project} suiteId={s.id} suiteName={s.name} onClose={() => setRunOpen(false)} />}
      {editOpen && <SuiteFormModal open projectId={projectId} suite={s} onClose={() => setEditOpen(false)} />}
    </>
  );
}
