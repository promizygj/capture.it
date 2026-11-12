import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { CheckCircle2, Maximize2, Sparkles, X } from 'lucide-react';
import { errorMessage, useAnalyzeMutation, useApproveBaselineMutation, useResultQuery } from '../store/api';
import { BrowserTag, EmptyState, ErrorBox, PageHeader, PageLoader, PriorityTag, StatusBadge, StatusIcon, Tabs } from '../components/ui';
import { formatDate, formatDuration } from '../lib/format';
import { useToast } from '../lib/useToast';
import type { LogEntry } from '../types';

const LOG_STYLE: Record<LogEntry['level'], string> = {
  info: 'text-ink-2', step: 'text-ink', pass: 'text-good-ink', fail: 'text-bad-ink', error: 'text-bad-ink', warn: 'text-warn-ink',
};

function Screenshot({ src, alt, label }: { src: string; alt: string; label: string }) {
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 text-xs font-medium text-ink-2">{label}</figcaption>
      <button className="group relative block w-full overflow-hidden rounded-lg border border-line bg-surface-2" onClick={() => setZoom(true)} aria-label={`Enlarge ${label}`}>
        <img src={src} alt={alt} className="max-h-96 w-full object-contain object-top" onError={() => setFailed(true)} data-testid="screenshot" />
        <span className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"><Maximize2 className="h-4 w-4" /></span>
      </button>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/80 p-4" onClick={() => setZoom(false)} role="dialog" aria-label={label}>
          <button className="fixed right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close"><X className="h-5 w-5" /></button>
          <img src={src} alt={alt} className="max-w-full" />
        </div>
      )}
    </figure>
  );
}

const METRICS: Record<string, { label: string; unit: string }> = {
  ttfbMs: { label: 'Time to first byte', unit: 'ms' },
  firstPaintMs: { label: 'First paint', unit: 'ms' },
  firstContentfulPaintMs: { label: 'First contentful paint', unit: 'ms' },
  domContentLoadedMs: { label: 'DOM content loaded', unit: 'ms' },
  loadMs: { label: 'Page load', unit: 'ms' },
  responseTimeMs: { label: 'Response time', unit: 'ms' },
  transferSizeKb: { label: 'Transfer size', unit: 'KB' },
  requestCount: { label: 'Requests', unit: '' },
};

type Tab = 'logs' | 'console' | 'network' | 'steps' | 'performance';

export function ResultPage() {
  const { resultId = '' } = useParams();
  const { data, isLoading, error } = useResultQuery(resultId);
  const [analyze, an] = useAnalyzeMutation();
  const [approve, ap] = useApproveBaselineMutation();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('logs');
  const [bust, setBust] = useState(0);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <div className="card"><EmptyState title="Test result not found" /></div>;
  const { result: r, run, testCase, history } = data;
  const failed = r.status === 'FAILED' || r.status === 'ERROR';
  const img = (kind: string) => `/api/results/${r.id}/images/${kind}${kind === 'baseline' ? `?v=${bust}` : ''}`;
  const isVisual = r.template === 'visual-regression';
  const analysis = an.data?.analysis ?? r.aiAnalysis;

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to={`/runs/${run.id}`} className="hover:underline">Test run</Link> / {r.suiteName}</>}
        title={<span className="flex flex-wrap items-center gap-3">{r.testCaseName} <StatusBadge status={r.status} /></span>}
        subtitle={testCase?.description ?? undefined}
        actions={testCase && <Link className="btn-secondary" to={`/projects/${run.projectId}/suites/${testCase.suiteId}/cases/${testCase.id}`}>Edit test case</Link>}
      />

      <dl className="card mb-6 grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div><dt className="text-xs text-ink-3">Browser</dt><dd className="mt-0.5 flex items-center gap-1.5"><BrowserTag browser={r.browser} /> <span className="text-xs text-ink-2">{r.browserVersion}</span></dd></div>
        <div><dt className="text-xs text-ink-3">Started</dt><dd className="mt-0.5">{formatDate(r.startedAt, true)}</dd></div>
        <div><dt className="text-xs text-ink-3">Completed</dt><dd className="mt-0.5">{formatDate(r.finishedAt, true)}</dd></div>
        <div><dt className="text-xs text-ink-3">Duration</dt><dd className="mt-0.5 tabular-nums">{formatDuration(r.durationMs)}</dd></div>
        <div><dt className="text-xs text-ink-3">Attempts</dt><dd className="mt-0.5">{r.attempts}{r.isFlaky && <span className="ml-1 text-warn-ink">· flaky</span>}</dd></div>
        <div><dt className="text-xs text-ink-3">Priority</dt><dd className="mt-0.5">{testCase ? <PriorityTag priority={testCase.priority} /> : '—'}</dd></div>
      </dl>

      {r.errorMessage && r.status !== 'PASSED' && (
        <section className="card mb-6 border-bad/40">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-bad-ink">Error</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs leading-relaxed" data-testid="error-message">{r.errorMessage}</pre>
          {r.errorStack && (
            <details className="border-t border-line px-5 py-3 text-xs">
              <summary className="cursor-pointer text-ink-2">Stack trace</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-ink-3">{r.errorStack}</pre>
            </details>
          )}
        </section>
      )}

      {failed && (
        <section className="card mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Failure analysis</h2>
            <button className="btn-secondary btn-sm" disabled={an.isLoading} onClick={() => analyze({ id: r.id, refresh: !!analysis })} data-testid="analyze">
              {an.isLoading ? 'Analysing…' : analysis ? 'Re-analyse' : 'Analyse failure'}
            </button>
          </div>
          <div className="px-5 py-4">
            {an.error && <ErrorBox>{errorMessage(an.error)}</ErrorBox>}
            {analysis ? (
              <div className="prose-sm space-y-2 text-sm [&_h2]:mt-3 [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-xs" data-testid="analysis"><Markdown>{analysis}</Markdown></div>
            ) : (
              <p className="text-sm text-ink-3">Summarise the error, console output and network failures, and get likely causes with next steps.</p>
            )}
          </div>
        </section>
      )}

      {(r.screenshotPath || r.diffPath || isVisual) && (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{isVisual ? 'Visual comparison' : 'Screenshot at failure'}</h2>
            {isVisual && r.diffRatio !== null && <span className="text-sm text-ink-2">{(r.diffRatio * 100).toFixed(2)}% of pixels changed</span>}
            {isVisual && run && (
              <button className="btn-secondary btn-sm" disabled={ap.isLoading} onClick={async () => { await approve(r.id); setBust(Date.now()); toast('success', 'Screenshot approved as the new baseline'); }}>
                <CheckCircle2 className="h-4 w-4" /> Approve as baseline
              </button>
            )}
          </div>
          <div className={`grid gap-4 ${isVisual ? 'md:grid-cols-3' : ''}`}>
            {isVisual ? (
              <>
                <Screenshot src={img('baseline')} alt="Baseline screenshot" label="Baseline" />
                <Screenshot src={img('current')} alt="Screenshot from this run" label="This run" />
                {r.diffPath && <Screenshot src={img('diff')} alt="Pixel difference" label="Difference (changed pixels in red)" />}
              </>
            ) : (
              <Screenshot src={img('screenshot')} alt={`Page when ${r.testCaseName} failed`} label={`${r.browser} · ${formatDate(r.finishedAt, true)}`} />
            )}
          </div>
        </section>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'logs', label: `Execution log (${r.logs.length})` },
          { key: 'console', label: `Console errors (${r.consoleErrors.length})` },
          { key: 'network', label: `Failed requests (${r.networkFailures.length})` },
          { key: 'steps', label: 'Steps' },
          { key: 'performance', label: 'Performance' },
        ]}
      />
      <section className="card mb-6 overflow-hidden">
        {tab === 'logs' && (
          <ol className="max-h-[480px] overflow-auto bg-surface-2 p-4 font-mono text-xs leading-relaxed" data-testid="logs">
            {r.logs.map((l, i) => (
              <li key={i} className={`flex gap-3 ${LOG_STYLE[l.level]}`}><span className="w-14 shrink-0 text-right tabular-nums text-ink-3">{l.t}ms</span><span className="break-all">{l.message}</span></li>
            ))}
          </ol>
        )}
        {tab === 'console' && (r.consoleErrors.length ? (
          <ul className="divide-y divide-line font-mono text-xs">{r.consoleErrors.map((c, i) => <li key={i} className="px-4 py-2.5"><span className="mr-2 rounded bg-bad-soft px-1.5 text-bad-ink">{c.type}</span>{c.text}{c.location && <div className="mt-0.5 text-ink-3">{c.location}</div>}</li>)}</ul>
        ) : <EmptyState title="No browser console errors" />)}
        {tab === 'network' && (r.networkFailures.length ? (
          <div className="overflow-x-auto"><table className="table-base font-mono text-xs"><thead><tr><th>Method</th><th>Status</th><th>Type</th><th>URL</th></tr></thead>
            <tbody>{r.networkFailures.map((n, i) => <tr key={i}><td>{n.method}</td><td className="text-bad-ink">{n.status ?? n.failure}</td><td>{n.resourceType}</td><td className="break-all">{n.url}</td></tr>)}</tbody></table></div>
        ) : <EmptyState title="No failed network requests" />)}
        {tab === 'steps' && (
          <div className="space-y-4 p-5 text-sm">
            <div><div className="text-xs text-ink-3">Target URL</div><code className="text-xs">{testCase?.targetUrl ?? '—'}</code></div>
            {testCase && (
              <ol className="space-y-1 font-mono text-xs">
                {testCase.steps.map((s, i) => <li key={i}><span className="text-ink-3">{i + 1}.</span> {s.action} {s.selector && <b>{s.selector}</b>} {s.value && s.action !== 'fill' ? `→ ${s.value}` : ''}</li>)}
                {testCase.expectations.map((e, i) => <li key={`e${i}`} className="text-good-ink">✓ {e.type} {e.selector && <b>{e.selector}</b>} {e.value && `= "${e.value}"`}</li>)}
              </ol>
            )}
            {testCase?.expectedResult && <div><div className="text-xs text-ink-3">Expected result</div><p>{testCase.expectedResult}</p></div>}
          </div>
        )}
        {tab === 'performance' && (r.metrics ? (
          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {Object.entries(METRICS).filter(([k]) => r.metrics![k] !== null && r.metrics![k] !== undefined).map(([k, m]) => (
              <div key={k}><dt className="text-xs text-ink-3">{m.label}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{r.metrics![k]}<span className="ml-0.5 text-xs font-normal text-ink-3">{m.unit}</span></dd></div>
            ))}
          </dl>
        ) : <EmptyState title="No performance metrics recorded" />)}
      </section>

      {history.length > 1 && (
        <section className="card">
          <h2 className="border-b border-line px-5 py-3 font-semibold">History of this test ({r.browser})</h2>
          <div className="flex flex-wrap gap-1.5 p-5">
            {[...history].reverse().map((h) => (
              <Link key={h.id} to={`/results/${h.id}`} title={`${h.status} · ${formatDate(h.startedAt)} · ${formatDuration(h.durationMs)}`} className={`rounded p-1 ${h.id === r.id ? 'ring-2 ring-primary' : 'hover:bg-surface-2'}`}>
                <StatusIcon status={h.status as 'PASSED'} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
