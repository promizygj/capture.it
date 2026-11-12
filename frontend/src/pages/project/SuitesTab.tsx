import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { errorMessage, useCreateSuiteMutation, useDeleteSuiteMutation, useTemplatesQuery, useUpdateSuiteMutation } from '../../store/api';
import type { ProjectDetail, Suite } from '../../types';
import { ConfirmButton, EmptyState, ErrorBox, Field, Modal, Toggle } from '../../components/ui';
import { RunDialog } from '../../components/RunDialog';
import { useToast } from '../../lib/useToast';

export function SuiteFormModal({ projectId, suite, open, onClose }: { projectId: string; suite?: Suite; open: boolean; onClose: () => void }) {
  const { data: tpl } = useTemplatesQuery();
  const [create, c] = useCreateSuiteMutation();
  const [update, u] = useUpdateSuiteMutation();
  const toast = useToast();
  const [form, setForm] = useState({ name: suite?.name ?? '', description: suite?.description ?? '', category: suite?.category ?? 'General' });
  const error = c.error ?? u.error;
  const save = async () => {
    const res = suite ? await update({ id: suite.id, projectId, ...form }) : await create({ projectId, ...form });
    if ('data' in res) {
      toast('success', suite ? 'Suite updated' : 'Suite created');
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={suite ? 'Edit test suite' : 'New test suite'}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={!form.name.trim() || c.isLoading || u.isLoading}>Save</button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <Field label="Name" htmlFor="suite-name"><input id="suite-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Checkout flow" /></Field>
        <Field label="Category" htmlFor="suite-cat">
          <input id="suite-cat" className="input" list="suite-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="suite-categories">{tpl?.categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Description" htmlFor="suite-desc"><textarea id="suite-desc" className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export function SuitesTab({ project }: { project: ProjectDetail }) {
  const canEdit = project.role !== 'VIEWER';
  const [editing, setEditing] = useState<Suite | 'new' | null>(null);
  const [running, setRunning] = useState<Suite | null>(null);
  const [category, setCategory] = useState('All');
  const [update] = useUpdateSuiteMutation();
  const [del] = useDeleteSuiteMutation();
  const toast = useToast();

  const categories = ['All', ...new Set(project.suites.map((s) => s.category))];
  const suites = project.suites.filter((s) => category === 'All' || s.category === category);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1 text-xs font-medium ${category === c ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-2 hover:text-ink'}`}>{c}</button>
          ))}
        </div>
        {canEdit && <button className="btn-secondary" onClick={() => setEditing('new')} data-testid="new-suite"><Plus className="h-4 w-4" /> New suite</button>}
      </div>

      {!project.suites.length ? (
        <div className="card">
          <EmptyState icon={<Layers className="h-8 w-8" />} title="No test suites yet" action={canEdit && <button className="btn-primary" onClick={() => setEditing('new')}>Create a suite</button>}>
            Suites group related test cases — for example Authentication, Navigation or Checkout.
          </EmptyState>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {suites.map((s) => (
            <div key={s.id} className={`flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center ${s.enabled ? '' : 'opacity-60'}`}>
              <Link to={`/projects/${project.id}/suites/${s.id}`} className="min-w-0 flex-1 group">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium group-hover:text-primary">{s.name}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">{s.category}</span>
                  {!s.enabled && <span className="text-xs text-ink-3">disabled</span>}
                </div>
                <div className="mt-0.5 text-xs text-ink-3">{s.enabledCases ?? 0} of {s._count?.cases ?? 0} test cases enabled{s.description ? ` · ${s.description}` : ''}</div>
              </Link>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Toggle label={s.enabled ? 'Disable suite' : 'Enable suite'} checked={s.enabled} onChange={(v) => update({ id: s.id, projectId: project.id, enabled: v })} />
                  <button className="btn-ghost btn-sm ml-2" onClick={() => setRunning(s)} disabled={!s.enabled || !s.enabledCases} title="Run this suite"><Play className="h-4 w-4" /> Run</button>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(s)} aria-label="Edit suite"><Pencil className="h-4 w-4" /></button>
                  <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Delete suite?" onConfirm={async () => { await del({ id: s.id, projectId: project.id }); toast('success', 'Suite deleted'); }}><Trash2 className="h-4 w-4" /></ConfirmButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <SuiteFormModal open projectId={project.id} suite={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {running && <RunDialog open project={project} suiteId={running.id} suiteName={running.name} onClose={() => setRunning(null)} />}
    </>
  );
}
