import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, KeyRound, Trash2, UserPlus } from 'lucide-react';
import {
  errorMessage, useAddMemberMutation, useApiKeysQuery, useCreateApiKeyMutation, useDeleteApiKeyMutation, useDeleteProjectMutation,
  useMembersQuery, useRemoveMemberMutation, useUpdateMemberMutation, useUpdateProjectMutation,
} from '../../store/api';
import type { ProjectDetail, Role } from '../../types';
import { ConfirmButton, ErrorBox, Field, Toggle } from '../../components/ui';
import { BrowserPicker } from '../../components/BrowserPicker';
import { useAppSelector } from '../../store';
import { useToast } from '../../lib/useToast';
import { timeAgo } from '../../lib/format';

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-ink-3">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function General({ project }: { project: ProjectDetail }) {
  const [update, { isLoading, error }] = useUpdateProjectMutation();
  const toast = useToast();
  const [f, setF] = useState({
    name: project.name, description: project.description ?? '', baseUrl: project.baseUrl, defaultBrowsers: project.defaultBrowsers,
    retries: project.retries, maxParallel: project.maxParallel, notifyEmail: project.notifyEmail, slackWebhookUrl: project.slackWebhookUrl ?? '',
  });
  const disabled = project.role === 'VIEWER';
  const save = async () => {
    const res = await update({ id: project.id, ...f, slackWebhookUrl: f.slackWebhookUrl || null });
    if ('data' in res) toast('success', 'Project settings saved');
  };
  return (
    <>
      <Card title="Project details">
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="sm:col-span-2"><ErrorBox>{errorMessage(error)}</ErrorBox></div>}
          <Field label="Name" htmlFor="p-name"><input id="p-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Website URL" htmlFor="p-url"><input id="p-url" className="input" type="url" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Description" htmlFor="p-desc"><textarea id="p-desc" className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Default browsers"><BrowserPicker value={f.defaultBrowsers} onChange={(v) => setF({ ...f, defaultBrowsers: v })} /></Field></div>
          <Field label="Retries on failure" htmlFor="p-retries" hint="Tests passing on a retry are marked flaky.">
            <select id="p-retries" className="input" value={f.retries} onChange={(e) => setF({ ...f, retries: Number(e.target.value) })}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select>
          </Field>
          <Field label="Parallel tests" htmlFor="p-par">
            <select id="p-par" className="input" value={f.maxParallel} onChange={(e) => setF({ ...f, maxParallel: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n}>{n}</option>)}</select>
          </Field>
        </fieldset>
      </Card>
      <Card title="Notifications" desc="Get told when a run fails.">
        <fieldset disabled={disabled} className="space-y-4">
          <label className="flex items-center gap-3 text-sm"><Toggle label="Email notifications" checked={f.notifyEmail} onChange={(v) => setF({ ...f, notifyEmail: v })} disabled={disabled} /> Email all project members when a run fails</label>
          <Field label="Slack incoming webhook URL" htmlFor="p-slack" hint="Create one at api.slack.com → Incoming Webhooks.">
            <input id="p-slack" className="input" type="url" placeholder="https://hooks.slack.com/services/…" value={f.slackWebhookUrl} onChange={(e) => setF({ ...f, slackWebhookUrl: e.target.value })} />
          </Field>
        </fieldset>
      </Card>
      {!disabled && <div className="flex justify-end"><button className="btn-primary" onClick={save} disabled={isLoading}>{isLoading ? 'Saving…' : 'Save settings'}</button></div>}
    </>
  );
}

function Team({ project }: { project: ProjectDetail }) {
  const me = useAppSelector((s) => s.auth.user);
  const { data } = useMembersQuery(project.id);
  const [add, a] = useAddMemberMutation();
  const [updateRole] = useUpdateMemberMutation();
  const [remove, r] = useRemoveMemberMutation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EDITOR');
  const isOwner = project.role === 'OWNER';
  return (
    <Card title="Team" desc="Owners manage members and settings · Editors create and run tests · Viewers can see reports.">
      {(a.error || r.error) && <div className="mb-3"><ErrorBox>{errorMessage(a.error ?? r.error)}</ErrorBox></div>}
      {isOwner && (
        <form className="mb-4 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const res = await add({ projectId: project.id, email, role }); if ('data' in res) setEmail(''); }}>
          <input className="input min-w-0 flex-1" type="email" required placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Member email" />
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role"><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option><option value="OWNER">Owner</option></select>
          <button className="btn-secondary"><UserPlus className="h-4 w-4" /> Add</button>
        </form>
      )}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {data?.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.user.name}{m.user.id === me?.id && <span className="text-ink-3"> (you)</span>}</div>
              <div className="truncate text-xs text-ink-3">{m.user.email}</div>
            </div>
            {isOwner ? (
              <select className="input w-auto py-1 text-xs" value={m.role} onChange={(e) => updateRole({ projectId: project.id, id: m.id, role: e.target.value })} aria-label={`Role for ${m.user.name}`}>
                <option value="OWNER">Owner</option><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option>
              </select>
            ) : <span className="text-xs text-ink-2">{m.role.toLowerCase()}</span>}
            {(isOwner || m.user.id === me?.id) && (
              <ConfirmButton className="btn-ghost btn-sm" confirmLabel={m.user.id === me?.id ? 'Leave?' : 'Remove?'} onConfirm={() => remove({ projectId: project.id, id: m.id })}><Trash2 className="h-4 w-4" /></ConfirmButton>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CiCd({ project }: { project: ProjectDetail }) {
  const { data } = useApiKeysQuery(project.id);
  const [create, { data: created, reset }] = useCreateApiKeyMutation();
  const [del] = useDeleteApiKeyMutation();
  const toast = useToast();
  const [name, setName] = useState('GitHub Actions');
  const origin = window.location.origin;
  const firstSuite = project.suites[0]?.name ?? 'Smoke';
  const yaml = `# .github/workflows/e2e.yml
name: E2E tests
on: [push]
jobs:
  qa-platform:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger test run
        run: |
          RUN=$(curl -sf -X POST ${origin}/api/ci/runs \\
            -H "X-API-Key: \${{ secrets.QA_PLATFORM_KEY }}" -H "content-type: application/json" \\
            -d '{"suite":"${firstSuite}","metadata":{"commit":"\${{ github.sha }}","branch":"\${{ github.ref_name }}"}}' | jq -r .runId)
          echo "Report: ${origin}/runs/$RUN"
          for i in $(seq 1 120); do
            S=$(curl -sf ${origin}/api/ci/runs/$RUN -H "X-API-Key: \${{ secrets.QA_PLATFORM_KEY }}")
            [ "$(echo $S | jq -r .done)" = "true" ] && break; sleep 5
          done
          echo $S | jq .
          [ "$(echo $S | jq -r .success)" = "true" ]`;
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('success', 'Copied to clipboard'));
  return (
    <Card title="CI/CD integration" desc="Trigger runs from GitHub Actions, Jenkins or any CI system with a project API key.">
      {created && (
        <div className="mb-4 rounded-lg border border-good/40 bg-good-soft p-3 text-sm">
          <div className="font-medium text-good-ink">Copy this key now — it won’t be shown again.</div>
          <div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-1 font-mono text-xs" data-testid="new-api-key">{created.key}</code><button className="btn-secondary btn-sm" onClick={() => copy(created.key)}><Copy className="h-3.5 w-3.5" /></button></div>
          <button className="mt-2 text-xs text-ink-2 hover:underline" onClick={reset}>Done</button>
        </div>
      )}
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); create({ projectId: project.id, name }); }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" />
        <button className="btn-secondary"><KeyRound className="h-4 w-4" /> Create key</button>
      </form>
      {!!data?.apiKeys.length && (
        <ul className="mb-4 divide-y divide-line rounded-lg border border-line">
          {data.apiKeys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1"><div className="font-medium">{k.name}</div><div className="text-xs text-ink-3"><code>{k.prefix}…</code> · by {k.createdBy.name} · last used {timeAgo(k.lastUsedAt)}</div></div>
              <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Revoke?" onConfirm={() => del({ projectId: project.id, id: k.id })}><Trash2 className="h-4 w-4" /></ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">GitHub Actions example</summary>
        <div className="relative border-t border-line">
          <button className="btn-secondary btn-sm absolute right-2 top-2" onClick={() => copy(yaml)}><Copy className="h-3.5 w-3.5" /> Copy</button>
          <pre className="overflow-x-auto p-4 text-xs leading-relaxed">{yaml}</pre>
        </div>
      </details>
    </Card>
  );
}

function Danger({ project }: { project: ProjectDetail }) {
  const [del, { isLoading }] = useDeleteProjectMutation();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  return (
    <section className="card border-bad/40 p-5">
      <h2 className="font-semibold text-bad-ink">Delete project</h2>
      <p className="mt-1 text-sm text-ink-2">Permanently deletes the project with all its suites, test cases, run history and screenshots. Type the project name to confirm.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={project.name} aria-label="Confirm project name" />
        <button className="btn-danger" disabled={confirm !== project.name || isLoading} onClick={async () => { await del(project.id); navigate('/projects'); }}>Delete project</button>
      </div>
    </section>
  );
}

export function SettingsTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="max-w-3xl space-y-6">
      <General project={project} />
      <Team project={project} />
      {project.role !== 'VIEWER' && <CiCd project={project} />}
      {project.role === 'OWNER' && <Danger project={project} />}
    </div>
  );
}
