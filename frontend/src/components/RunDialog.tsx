import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { errorMessage, useStartRunMutation } from '../store/api';
import type { Browser, ProjectDetail } from '../types';
import { ErrorBox, Field, Modal } from './ui';
import { BrowserPicker } from './BrowserPicker';

/** Asks for environment + browsers, then queues a run and opens the live progress page. */
export function RunDialog({ project, suiteId, suiteName, open, onClose }: { project: ProjectDetail; suiteId?: string | null; suiteName?: string; open: boolean; onClose: () => void }) {
  const [start, { isLoading, error, reset }] = useStartRunMutation();
  const navigate = useNavigate();
  const def = project.environments.find((e) => e.isDefault) ?? project.environments[0];
  const [envId, setEnvId] = useState(def?.id ?? '');
  const [browsers, setBrowsers] = useState<Browser[]>(project.defaultBrowsers.length ? project.defaultBrowsers : ['chromium']);

  const go = async () => {
    const res = await start({ projectId: project.id, suiteId: suiteId ?? null, environmentId: envId || null, browsers });
    if ('data' in res && res.data) navigate(`/runs/${res.data.run.id}`);
  };
  const close = () => { reset(); onClose(); };
  const target = suiteId ? project.suites.filter((s) => s.id === suiteId) : project.suites.filter((s) => s.enabled);
  const runnable = target.reduce((n, s) => n + (s.enabledCases ?? 0), 0);
  const firstSuite = target[0] ?? project.suites[0];

  return (
    <Modal
      open={open}
      onClose={close}
      title={suiteName ? `Run “${suiteName}”` : 'Run all enabled suites'}
      footer={<><button className="btn-ghost" onClick={close}>Cancel</button><button className="btn-primary" onClick={go} disabled={isLoading || runnable === 0} data-testid="confirm-run"><Play className="h-4 w-4" />{isLoading ? 'Starting…' : 'Start run'}</button></>}
    >
      <div className="space-y-4">
        {runnable === 0 ? (
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink-2">
            {suiteId ? 'This suite' : 'None of the enabled suites'} {suiteId ? 'has' : 'have'} any enabled test cases yet, so there is nothing to run.{' '}
            {firstSuite && <Link className="font-medium text-primary hover:underline" to={`/projects/${project.id}/suites/${firstSuite.id}/cases/new`} onClick={close}>Add a test case to “{firstSuite.name}” →</Link>}
          </div>
        ) : error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <Field label="Environment" htmlFor="run-env">
          <select id="run-env" className="input" value={envId} onChange={(e) => setEnvId(e.target.value)}>
            {project.environments.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.baseUrl}</option>)}
          </select>
        </Field>
        <Field label="Browsers" hint="Each browser test runs once per selected browser. API tests run once.">
          <BrowserPicker value={browsers} onChange={setBrowsers} />
        </Field>
        <p className="text-xs text-ink-3">Up to {project.maxParallel} tests run in parallel · {project.retries} retr{project.retries === 1 ? 'y' : 'ies'} on failure.</p>
      </div>
    </Modal>
  );
}
