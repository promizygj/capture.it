import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { errorMessage, useCreateProjectMutation } from '../store/api';
import { ErrorBox, Field, PageHeader } from '../components/ui';
import { BrowserPicker } from '../components/BrowserPicker';
import type { Browser } from '../types';
import { useToast } from '../lib/useToast';

export function ProjectNewPage() {
  const [create, { isLoading, error }] = useCreateProjectMutation();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', baseUrl: 'https://', defaultBrowsers: ['chromium'] as Browser[], retries: 1, maxParallel: 3 });
  const [envs, setEnvs] = useState<{ name: string; baseUrl: string }[]>([]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const environments = [{ name: 'Production', baseUrl: form.baseUrl }, ...envs.filter((x) => x.name && x.baseUrl)];
    const res = await create({ ...form, environments });
    if ('data' in res && res.data) {
      toast('success', 'Project created');
      navigate(`/projects/${res.data.project.id}`);
    }
  };

  return (
    <>
      <PageHeader title="New testing project" breadcrumb={<Link to="/projects" className="hover:underline">Projects</Link>} />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6">
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <Field label="Project name" htmlFor="name">
          <input id="name" className="input" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marketing website" />
        </Field>
        <Field label="Website URL" htmlFor="baseUrl" hint="The base URL tests run against. Test cases can use paths relative to it, like /login.">
          <input id="baseUrl" className="input" type="url" required value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="description">
          <textarea id="description" className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Default browsers">
          <BrowserPicker value={form.defaultBrowsers} onChange={(v) => setForm({ ...form, defaultBrowsers: v })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retries for failed tests" htmlFor="retries" hint="A test that passes on retry is flagged as flaky.">
            <select id="retries" className="input" value={form.retries} onChange={(e) => setForm({ ...form, retries: Number(e.target.value) })}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Parallel tests" htmlFor="parallel" hint="How many test cases run at the same time.">
            <select id="parallel" className="input" value={form.maxParallel} onChange={(e) => setForm({ ...form, maxParallel: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <div className="label">Environments</div>
          <p className="mb-2 text-xs text-ink-3">A <b>Production</b> environment is created from the website URL. Add development or staging URLs if you have them.</p>
          <div className="space-y-2">
            {envs.map((env, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-36" placeholder="Staging" value={env.name} onChange={(e) => setEnvs(envs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Environment name" />
                <input className="input" type="url" placeholder="https://staging.example.com" value={env.baseUrl} onChange={(e) => setEnvs(envs.map((x, j) => (j === i ? { ...x, baseUrl: e.target.value } : x)))} aria-label="Environment URL" />
                <button type="button" className="btn-ghost" onClick={() => setEnvs(envs.filter((_, j) => j !== i))} aria-label="Remove environment"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEnvs([...envs, { name: '', baseUrl: '' }])}><Plus className="h-3.5 w-3.5" /> Add environment</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-5">
          <Link to="/projects" className="btn-ghost">Cancel</Link>
          <button className="btn-primary" disabled={isLoading}>{isLoading ? 'Creating…' : 'Create project'}</button>
        </div>
      </form>
    </>
  );
}
