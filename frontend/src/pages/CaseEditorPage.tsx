import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { errorMessage, useSaveCaseMutation, useSuiteQuery, useTemplatesQuery, useTestCaseQuery } from '../store/api';
import type { Expectation, Priority, Step, Template, TemplateField } from '../types';
import { BrowserTag, ErrorBox, Field, PageHeader, PageLoader, StatusIcon } from '../components/ui';
import { formatDate, formatDuration } from '../lib/format';
import { useToast } from '../lib/useToast';

const NEEDS_SELECTOR_STEP = ['click', 'fill', 'select', 'check', 'uncheck', 'hover', 'waitForSelector', 'scrollIntoView'];
const NEEDS_VALUE_STEP = ['goto', 'fill', 'select', 'press', 'waitForUrl', 'waitForTimeout'];
const NEEDS_SELECTOR_ASSERT = ['visible', 'hidden', 'textEquals', 'valueEquals', 'count'];
const OPTIONAL_SELECTOR_ASSERT = ['textContains'];
const NEEDS_VALUE_ASSERT = ['textContains', 'textEquals', 'valueEquals', 'count', 'urlContains', 'titleContains', 'statusBelow', 'loadTimeBelow'];

function TemplatePicker({ templates, onPick }: { templates: Template[]; onPick: (t: Template) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Template[]>();
    templates.forEach((t) => m.set(t.category, [...(m.get(t.category) ?? []), t]));
    return [...m.entries()];
  }, [templates]);
  return (
    <div className="space-y-6">
      {groups.map(([cat, list]) => (
        <section key={cat}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => (
              <button key={t.key} onClick={() => onPick(t)} className="card p-4 text-left transition-shadow hover:border-primary hover:shadow-md" data-testid={`template-${t.key}`}>
                <div className="font-medium">{t.name}</div>
                <p className="mt-1 text-sm text-ink-2">{t.description}</p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TemplateFieldInput({ field, value, onChange }: { field: TemplateField; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${field.name}`;
  const v = value === undefined || value === null ? '' : value;
  let input;
  switch (field.type) {
    case 'boolean':
      input = (
        <label className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" checked={v === true || v === 'true'} onChange={(e) => onChange(e.target.checked)} /> Enabled</label>
      );
      break;
    case 'select':
      input = <select id={id} className="input" value={String(v)} onChange={(e) => onChange(e.target.value)}>{field.options?.map((o) => <option key={o}>{o}</option>)}</select>;
      break;
    case 'textarea':
    case 'pairs':
    case 'keyvalue':
      input = <textarea id={id} className="input font-mono text-xs" rows={4} placeholder={field.placeholder} value={String(v)} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      input = <input id={id} className="input" type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'} step="any" placeholder={field.placeholder} required={field.required} value={String(v)} onChange={(e) => onChange(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />;
  }
  return <Field label={field.label + (field.required ? ' *' : '')} htmlFor={id} hint={field.help}>{input}</Field>;
}

function ListEditor<T extends Step | Expectation>({ items, onChange, kind, options }: { items: T[]; onChange: (v: T[]) => void; kind: 'step' | 'assert'; options: string[] }) {
  const typeKey = (kind === 'step' ? 'action' : 'type') as keyof T;
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const t = String(it[typeKey]);
        const needsSel = kind === 'step' ? NEEDS_SELECTOR_STEP.includes(t) || t === 'press' : NEEDS_SELECTOR_ASSERT.includes(t) || OPTIONAL_SELECTOR_ASSERT.includes(t);
        const needsVal = kind === 'step' ? NEEDS_VALUE_STEP.includes(t) : NEEDS_VALUE_ASSERT.includes(t);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
            <span className="w-5 text-center text-xs tabular-nums text-ink-3">{i + 1}</span>
            <select className="input w-40" value={t} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [typeKey]: e.target.value } : x)))} aria-label="Type">
              {options.map((o) => <option key={o}>{o}</option>)}
            </select>
            {needsSel && <input className="input min-w-0 flex-1 font-mono text-xs" placeholder="CSS / text= selector" value={it.selector ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, selector: e.target.value } : x)))} aria-label="Selector" />}
            {needsVal && <input className="input min-w-0 flex-1 font-mono text-xs" placeholder="value" value={it.value ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label="Value" />}
            <div className="ml-auto flex">
              <button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="btn-ghost btn-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...items, { [typeKey]: options[kind === 'step' ? 1 : 0] } as unknown as T])}>
        <Plus className="h-3.5 w-3.5" /> Add {kind === 'step' ? 'step' : 'assertion'}
      </button>
    </div>
  );
}

function StepsPreview({ steps, expectations }: { steps: Step[]; expectations: Expectation[] }) {
  return (
    <ol className="space-y-1 text-xs">
      {steps.map((s, i) => <li key={`s${i}`} className="font-mono text-ink-2"><span className="text-ink-3">{i + 1}.</span> {s.action} {s.selector && <b className="text-ink">{s.selector}</b>} {s.value && s.action !== 'fill' ? `→ ${s.value}` : s.value ? '→ ••••' : ''}</li>)}
      {expectations.map((e, i) => <li key={`e${i}`} className="font-mono text-good-ink">✓ {e.type} {e.selector && <b>{e.selector}</b>} {e.value && `= "${e.value}"`}</li>)}
    </ol>
  );
}

export function CaseEditorPage() {
  const { projectId = '', suiteId = '', caseId } = useParams();
  const isNew = !caseId;
  const navigate = useNavigate();
  const toast = useToast();
  const { data: tpl } = useTemplatesQuery();
  const { data: suiteData } = useSuiteQuery(suiteId);
  const { data: existing, isLoading } = useTestCaseQuery(caseId ?? '', { skip: isNew });
  const [save, { isLoading: saving, error }] = useSaveCaseMutation();

  const [template, setTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', targetUrl: '/', expectedResult: '', priority: 'MEDIUM' as Priority, timeoutMs: 30000, enabled: true,
    config: {} as Record<string, unknown>, steps: [] as Step[], expectations: [] as Expectation[],
  });

  useEffect(() => {
    if (existing && tpl) {
      const c = existing.testCase;
      setTemplate(tpl.templates.find((t) => t.key === c.template) ?? null);
      setForm({
        name: c.name, description: c.description ?? '', targetUrl: c.targetUrl, expectedResult: c.expectedResult ?? '', priority: c.priority,
        timeoutMs: c.timeoutMs, enabled: c.enabled, config: c.config ?? {}, steps: c.steps ?? [], expectations: c.expectations ?? [],
      });
    }
  }, [existing, tpl]);

  const pick = (t: Template) => {
    setTemplate(t);
    const config = Object.fromEntries(t.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
    setForm((f) => ({
      ...f, name: f.name || t.name, targetUrl: t.defaults.targetUrl, expectedResult: t.defaults.expectedResult, config,
      steps: t.editableSteps ? [{ action: 'click', selector: '' }] : [], expectations: t.editableSteps ? [{ type: 'visible', selector: '' }] : [],
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!template) return;
    const body = { ...form, template: template.key, ...(template.editableSteps ? {} : { steps: undefined, expectations: undefined }) };
    const res = await save({ suiteId, id: caseId, ...body });
    if ('data' in res && res.data) {
      toast('success', isNew ? 'Test case created' : 'Test case saved');
      navigate(`/projects/${projectId}/suites/${suiteId}`);
    }
  };

  if (!tpl || (!isNew && isLoading)) return <PageLoader />;
  const crumbs = <><Link to={`/projects/${projectId}`} className="hover:underline">{suiteData?.suite.project.name ?? 'Project'}</Link> / <Link to={`/projects/${projectId}/suites/${suiteId}`} className="hover:underline">{suiteData?.suite.name ?? 'Suite'}</Link></>;

  if (!template) {
    return (
      <>
        <PageHeader breadcrumb={crumbs} title="New test case" subtitle="Choose a predefined template to start from." />
        <TemplatePicker templates={tpl.templates} onPick={pick} />
      </>
    );
  }

  const baseUrl = suiteData?.suite.project.baseUrl;
  return (
    <>
      <PageHeader breadcrumb={crumbs} title={isNew ? 'New test case' : form.name || 'Edit test case'} subtitle={<>Template: <b>{template.name}</b>{isNew && <> · <button className="text-primary hover:underline" onClick={() => setTemplate(null)}>change</button></>}</>} />
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">Details</h2>
            <Field label="Test case name *" htmlFor="c-name"><input id="c-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Description" htmlFor="c-desc"><textarea id="c-desc" className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label={template.kind === 'api' ? 'Request URL *' : 'Target URL *'} htmlFor="c-url" hint={<>Absolute, or relative to the environment base URL{baseUrl ? ` (${baseUrl})` : ''}. Variables like <code>{'{{baseUrl}}'}</code> work too.</>}>
              <input id="c-url" className="input font-mono text-sm" required value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
            </Field>
          </section>

          {template.fields.length > 0 && (
            <section className="card space-y-4 p-5">
              <h2 className="font-semibold">Test configuration</h2>
              <p className="-mt-2 text-sm text-ink-3">{template.description}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {template.fields.map((f) => (
                  <div key={f.name} className={clsx(['textarea', 'pairs', 'keyvalue'].includes(f.type) && 'sm:col-span-2')}>
                    <TemplateFieldInput field={f} value={form.config[f.name]} onChange={(v) => setForm({ ...form, config: { ...form.config, [f.name]: v } })} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {template.editableSteps && (
            <>
              <section className="card space-y-3 p-5">
                <h2 className="font-semibold">Test steps</h2>
                <p className="-mt-1 text-sm text-ink-3">The browser opens the target URL first, then runs these actions in order.</p>
                <ListEditor kind="step" items={form.steps} options={tpl.stepActions} onChange={(steps) => setForm({ ...form, steps })} />
              </section>
              <section className="card space-y-3 p-5">
                <h2 className="font-semibold">Assertions</h2>
                <ListEditor kind="assert" items={form.expectations} options={tpl.assertionTypes} onChange={(expectations) => setForm({ ...form, expectations })} />
              </section>
            </>
          )}

          <section className="card p-5">
            <Field label="Expected result" htmlFor="c-expected"><textarea id="c-expected" className="input" rows={2} value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} /></Field>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">Execution</h2>
            <Field label="Priority" htmlFor="c-prio">
              <select id="c-prio" className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                <option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </select>
            </Field>
            <Field label="Timeout (seconds)" htmlFor="c-timeout" hint="The test fails if it runs longer than this.">
              <input id="c-timeout" className="input" type="number" min={1} max={300} value={form.timeoutMs / 1000} onChange={(e) => setForm({ ...form, timeoutMs: Math.round(Number(e.target.value) * 1000) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
            <div className="flex gap-2 border-t border-line pt-4">
              <Link to={`/projects/${projectId}/suites/${suiteId}`} className="btn-ghost flex-1">Cancel</Link>
              <button className="btn-primary flex-1" disabled={saving} data-testid="save-case">{saving ? 'Saving…' : 'Save test case'}</button>
            </div>
          </section>

          {existing && !template.editableSteps && existing.testCase.steps.length + existing.testCase.expectations.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">Generated steps</h2>
              <StepsPreview steps={existing.testCase.steps} expectations={existing.testCase.expectations} />
            </section>
          )}

          {existing && existing.history.length > 0 && (
            <section className="card">
              <h2 className="border-b border-line px-5 py-3 font-semibold">Recent executions</h2>
              <ul className="divide-y divide-line">
                {existing.history.map((h) => (
                  <li key={h.id}>
                    <Link to={`/results/${h.id}`} className="flex items-center gap-2 px-5 py-2 text-sm hover:bg-surface-2">
                      <StatusIcon status={h.status as 'PASSED'} />
                      <BrowserTag browser={h.browser} />
                      {h.isFlaky && <span className="text-[11px] text-warn-ink">flaky</span>}
                      <span className="ml-auto text-xs tabular-nums text-ink-3">{formatDuration(h.durationMs)} · {formatDate(h.startedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </form>
    </>
  );
}
