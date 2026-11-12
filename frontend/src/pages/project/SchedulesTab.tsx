import { useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { errorMessage, useDeleteScheduleMutation, useSaveScheduleMutation, useSchedulesQuery } from '../../store/api';
import type { Browser, ProjectDetail } from '../../types';
import { ConfirmButton, EmptyState, ErrorBox, Field, Modal, PageLoader, Toggle } from '../../components/ui';
import { BrowserPicker } from '../../components/BrowserPicker';
import { formatDate, timeAgo } from '../../lib/format';

const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at 02:00', cron: '0 2 * * *' },
  { label: 'Weekdays at 09:00', cron: '0 9 * * 1-5' },
  { label: 'Weekly (Mon 06:00)', cron: '0 6 * * 1' },
];

function ScheduleModal({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const [save, { isLoading, error }] = useSaveScheduleMutation();
  const [form, setForm] = useState({
    name: 'Nightly regression', cron: '0 2 * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    suiteId: '', environmentId: project.environments.find((e) => e.isDefault)?.id ?? '', browsers: ['chromium'] as Browser[],
  });
  const submit = async () => {
    const res = await save({ projectId: project.id, ...form, suiteId: form.suiteId || null, environmentId: form.environmentId || null });
    if ('data' in res) onClose();
  };
  return (
    <Modal open wide onClose={onClose} title="New schedule" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={isLoading}>Create schedule</button></>}>
      <div className="space-y-4">
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <Field label="Name" htmlFor="s-name"><input id="s-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div>
          <div className="label">Frequency</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.cron} type="button" onClick={() => setForm({ ...form, cron: p.cron })} className={`rounded-full border px-2.5 py-1 text-xs ${form.cron === p.cron ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-2'}`}>{p.label}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cron expression" htmlFor="s-cron" hint="minute hour day month weekday"><input id="s-cron" className="input font-mono" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} /></Field>
            <Field label="Time zone" htmlFor="s-tz"><input id="s-tz" className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Suite" htmlFor="s-suite">
            <select id="s-suite" className="input" value={form.suiteId} onChange={(e) => setForm({ ...form, suiteId: e.target.value })}>
              <option value="">All enabled suites</option>
              {project.suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Environment" htmlFor="s-env">
            <select id="s-env" className="input" value={form.environmentId} onChange={(e) => setForm({ ...form, environmentId: e.target.value })}>
              {project.environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Browsers"><BrowserPicker value={form.browsers} onChange={(v) => setForm({ ...form, browsers: v })} /></Field>
      </div>
    </Modal>
  );
}

export function SchedulesTab({ project }: { project: ProjectDetail }) {
  const canEdit = project.role !== 'VIEWER';
  const { data, isLoading } = useSchedulesQuery(project.id, { pollingInterval: 30000 });
  const [save] = useSaveScheduleMutation();
  const [del] = useDeleteScheduleMutation();
  const [open, setOpen] = useState(false);
  if (isLoading) return <PageLoader />;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Run tests automatically on a schedule. Failures trigger notifications.</p>
        {canEdit && <button className="btn-secondary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New schedule</button>}
      </div>
      {!data?.schedules.length ? (
        <div className="card"><EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No schedules">Set up nightly regression runs or hourly smoke tests.</EmptyState></div>
      ) : (
        <div className="card divide-y divide-line">
          {data.schedules.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="mt-0.5 text-xs text-ink-3">
                  <code className="rounded bg-surface-2 px-1">{s.cron}</code> ({s.timezone}) · {s.suite?.name ?? 'All suites'} · {s.environment?.name ?? 'default env'} · {s.browsers.join(', ')}
                </div>
                <div className="mt-0.5 text-xs text-ink-3">Last run {timeAgo(s.lastRunAt)}{s.nextRunAt ? ` · next ${formatDate(s.nextRunAt)}` : ''}</div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Toggle label={s.enabled ? 'Pause schedule' : 'Resume schedule'} checked={s.enabled} onChange={(v) => save({ projectId: project.id, id: s.id, enabled: v })} />
                  <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Delete?" onConfirm={() => del({ projectId: project.id, id: s.id })}><Trash2 className="h-4 w-4" /></ConfirmButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {open && <ScheduleModal project={project} onClose={() => setOpen(false)} />}
    </>
  );
}
