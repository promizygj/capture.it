import { useState } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { errorMessage, useDeleteEnvironmentMutation, useSaveEnvironmentMutation } from '../../store/api';
import type { Environment, ProjectDetail } from '../../types';
import { ConfirmButton, ErrorBox, Field, Modal } from '../../components/ui';
import { useToast } from '../../lib/useToast';

function EnvModal({ projectId, env, onClose }: { projectId: string; env?: Environment; onClose: () => void }) {
  const [save, { isLoading, error }] = useSaveEnvironmentMutation();
  const toast = useToast();
  const [name, setName] = useState(env?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(env?.baseUrl ?? 'https://');
  const [vars, setVars] = useState(Object.entries(env?.variables ?? {}).map(([k, v]) => ({ k, v })));
  const submit = async () => {
    const variables = Object.fromEntries(vars.filter((x) => x.k.trim()).map((x) => [x.k.trim(), x.v]));
    const res = await save({ projectId, id: env?.id, name, baseUrl, variables });
    if ('data' in res) { toast('success', 'Environment saved'); onClose(); }
  };
  return (
    <Modal open wide onClose={onClose} title={env ? `Edit ${env.name}` : 'New environment'}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={isLoading}>Save</button></>}>
      <div className="space-y-4">
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="Name" htmlFor="env-name"><input id="env-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Staging" /></Field>
          <Field label="Base URL" htmlFor="env-url"><input id="env-url" className="input" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
        </div>
        <div>
          <div className="label">Variables</div>
          <p className="mb-2 text-xs text-ink-3">Reference in tests as <code className="rounded bg-surface-2 px-1">{'{{NAME}}'}</code> — e.g. credentials that differ per environment.</p>
          <div className="space-y-2">
            {vars.map((x, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-40 font-mono" placeholder="USERNAME" value={x.k} onChange={(e) => setVars(vars.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)))} aria-label="Variable name" />
                <input className="input font-mono" placeholder="value" value={x.v} onChange={(e) => setVars(vars.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)))} aria-label="Variable value" />
                <button className="btn-ghost" onClick={() => setVars(vars.filter((_, j) => j !== i))} aria-label="Remove variable"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button className="btn-secondary btn-sm" onClick={() => setVars([...vars, { k: '', v: '' }])}><Plus className="h-3.5 w-3.5" /> Add variable</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function EnvironmentsTab({ project }: { project: ProjectDetail }) {
  const canEdit = project.role !== 'VIEWER';
  const [editing, setEditing] = useState<Environment | 'new' | null>(null);
  const [save] = useSaveEnvironmentMutation();
  const [del] = useDeleteEnvironmentMutation();
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Run the same tests against development, staging and production.</p>
        {canEdit && <button className="btn-secondary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New environment</button>}
      </div>
      <div className="card divide-y divide-line">
        {project.environments.map((e) => (
          <div key={e.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">{e.name}{e.isDefault && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">default</span>}</div>
              <div className="truncate text-xs text-ink-3">{e.baseUrl} · {Object.keys(e.variables ?? {}).length} variable(s)</div>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                {!e.isDefault && <button className="btn-ghost btn-sm" onClick={() => save({ projectId: project.id, id: e.id, isDefault: true })}><Star className="h-4 w-4" /> Make default</button>}
                <button className="btn-ghost btn-sm" onClick={() => setEditing(e)} aria-label="Edit environment"><Pencil className="h-4 w-4" /></button>
                {project.environments.length > 1 && <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Delete?" onConfirm={() => del({ projectId: project.id, id: e.id })}><Trash2 className="h-4 w-4" /></ConfirmButton>}
              </div>
            )}
          </div>
        ))}
      </div>
      {editing && <EnvModal projectId={project.id} env={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
