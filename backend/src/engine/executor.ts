import { request as pwRequest, type BrowserContext, type Page } from 'playwright';
import type { BrowserPool, BrowserKind } from './browserPool.js';
import { runExpectation, runStep, type StepRuntime } from './steps.js';
import { compareScreenshots } from './visual.js';
import { interpolate, resolveUrl } from './interpolate.js';
import {
  AssertionFailure,
  type CaseInput,
  type CaseOutcome,
  type ConsoleError,
  type ExecutionContext,
  type LogEntry,
  type NetworkFailure,
  type PerfMetrics,
} from './types.js';

class CaseTimeout extends Error {
  constructor(ms: number) {
    super(`Test exceeded its execution timeout of ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new CaseTimeout(ms));
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Converts a Playwright/JS error into a FAILED (assertion / element problem) or ERROR (infrastructure) status */
function classify(err: unknown): { status: 'FAILED' | 'ERROR'; message: string; stack?: string } {
  const e = err instanceof Error ? err : new Error(String(err));
  // Strip ANSI colour codes Playwright adds to messages
  const message = e.message.replace(/\u001b\[[0-9;]*m/g, '');
  const infra =
    /Target page, context or browser has been closed|Browser has been closed|browser has disconnected|crash|net::ERR_|NS_ERROR_|Could not connect|ECONNREFUSED|ENOTFOUND/i.test(
      message,
    );
  if (e instanceof AssertionFailure) return { status: 'FAILED', message, stack: e.stack };
  if (e instanceof CaseTimeout) return { status: 'FAILED', message, stack: e.stack };
  return { status: infra ? 'ERROR' : 'FAILED', message, stack: e.stack };
}

/* In-page script kept as a plain string: transpilers (tsx/esbuild keepNames) inject helpers into
 * functions, which would be undefined inside the browser when passed to page.evaluate. */
const PERF_SCRIPT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint');
  const resources = performance.getEntriesByType('resource');
  const fp = paints.find((p) => p.name === 'first-paint');
  const fcp = paints.find((p) => p.name === 'first-contentful-paint');
  const round = (v) => (v === undefined || v === null || Number.isNaN(v) ? undefined : Math.round(v));
  const transfer = resources.reduce((s, r) => s + (r.transferSize || 0), nav ? nav.transferSize || 0 : 0);
  return {
    ttfbMs: round(nav ? nav.responseStart - nav.requestStart : undefined),
    domContentLoadedMs: round(nav ? nav.domContentLoadedEventEnd : undefined),
    loadMs: round(nav ? nav.loadEventEnd : undefined),
    firstPaintMs: round(fp ? fp.startTime : undefined),
    firstContentfulPaintMs: round(fcp ? fcp.startTime : undefined),
    transferSizeKb: Math.round(transfer / 1024),
    requestCount: resources.length + 1,
  };
})()`;

async function collectPerf(page: Page): Promise<PerfMetrics | undefined> {
  try {
    return (await page.evaluate(PERF_SCRIPT)) as PerfMetrics;
  } catch {
    return undefined;
  }
}

export async function runBrowserCase(
  pool: BrowserPool,
  kind: BrowserKind,
  input: CaseInput,
  ctx: ExecutionContext,
): Promise<CaseOutcome> {
  const started = Date.now();
  const logs: LogEntry[] = [];
  const consoleErrors: ConsoleError[] = [];
  const networkFailures: NetworkFailure[] = [];
  const log = (level: LogEntry['level'], message: string) => logs.push({ t: Date.now() - started, level, message });
  const vars = { ...ctx.variables, baseUrl: ctx.baseUrl };

  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const outcome: CaseOutcome = { status: 'PASSED', durationMs: 0, logs, consoleErrors, networkFailures };

  try {
    const acquired = await pool.newContext(kind, { viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    context = acquired.context;
    log('info', `Opened ${kind} ${acquired.browser.version()} context`);
    page = await context.newPage();
    page.setDefaultTimeout(Math.min(input.timeoutMs, 10_000));
    page.setDefaultNavigationTimeout(input.timeoutMs);

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const loc = msg.location();
        consoleErrors.push({ type: 'console', text: msg.text(), location: loc.url ? `${loc.url}:${loc.lineNumber}` : undefined });
      }
    });
    page.on('pageerror', (err) => consoleErrors.push({ type: 'pageerror', text: err.message }));
    page.on('requestfailed', (req) =>
      networkFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText, resourceType: req.resourceType() }),
    );
    page.on('response', (res) => {
      if (res.status() >= 400)
        networkFailures.push({ url: res.url(), method: res.request().method(), status: res.status(), resourceType: res.request().resourceType() });
    });

    const rt: StepRuntime = { page, baseUrl: ctx.baseUrl, vars, log, consoleErrors, lastResponse: null, lastLoadMs: null };
    const p = page;

    const work = async () => {
      // Every browser test starts on its target URL unless the first step is an explicit goto
      if (input.steps[0]?.action !== 'goto') {
        await runStep(rt, { action: 'goto', value: interpolate(input.targetUrl, vars), description: `Open ${input.targetUrl}` }, -1);
      }
      for (const [i, step] of input.steps.entries()) await runStep(rt, step, i);
      for (const exp of input.expectations) await runExpectation(rt, exp);

      outcome.metrics = await collectPerf(p);

      if (input.template === 'visual-regression') {
        const cfg = input.config as { fullPage?: boolean; maskSelectors?: string[]; maxDiffRatio?: number; threshold?: number };
        await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
        const shot = await p.screenshot({
          fullPage: cfg.fullPage ?? true,
          animations: 'disabled',
          mask: (cfg.maskSelectors ?? []).filter(Boolean).map((s) => p.locator(s)),
        });
        outcome.currentImage = shot;
        if (!ctx.baseline) {
          log('info', 'No visual baseline found – this screenshot was stored as the new baseline');
        } else {
          const cmp = compareScreenshots(ctx.baseline, shot, cfg.threshold ?? 0.1);
          outcome.diffRatio = cmp.diffRatio;
          outcome.diffImage = cmp.diffImage;
          const max = cfg.maxDiffRatio ?? 0.01;
          const pct = (cmp.diffRatio * 100).toFixed(2);
          if (cmp.diffRatio > max) {
            throw new AssertionFailure(
              `Visual difference of ${pct}% exceeds the allowed ${(max * 100).toFixed(2)}%${cmp.sizeMismatch ? ' (page size changed)' : ''}`,
            );
          }
          log('pass', `✓ Visual difference ${pct}% within tolerance`);
        }
      }
    };

    await withTimeout(work(), input.timeoutMs, () => log('error', `Timed out after ${input.timeoutMs}ms`));
    log('pass', 'Test passed');
  } catch (err) {
    const c = classify(err);
    outcome.status = c.status;
    outcome.errorMessage = c.message;
    outcome.errorStack = c.stack;
    // Assertion failures are already logged by the assertion itself
    if (!(err instanceof AssertionFailure)) log('error', c.message.split('\n')[0]);
    if (page && !page.isClosed()) {
      outcome.screenshot = await page
        .screenshot({ fullPage: true, timeout: 5000 })
        .catch(() => page!.screenshot({ timeout: 3000 }).catch(() => undefined));
      if (outcome.screenshot) log('info', 'Captured failure screenshot');
      outcome.metrics ??= await collectPerf(page);
    }
  } finally {
    // Always release the context so pages/processes never leak, even after timeouts
    await context?.close().catch(() => undefined);
    outcome.durationMs = Date.now() - started;
  }
  return outcome;
}

interface ApiConfig {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number;
  bodyContains?: string;
  jsonAssertions?: { path: string; equals: string }[];
  maxResponseTimeMs?: number;
}

function readJsonPath(obj: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

/** API tests use Playwright's APIRequestContext – no browser needed */
export async function runApiCase(input: CaseInput, ctx: ExecutionContext): Promise<CaseOutcome> {
  const started = Date.now();
  const logs: LogEntry[] = [];
  const log = (level: LogEntry['level'], message: string) => logs.push({ t: Date.now() - started, level, message });
  const outcome: CaseOutcome = { status: 'PASSED', durationMs: 0, logs, consoleErrors: [], networkFailures: [] };
  const vars = { ...ctx.variables, baseUrl: ctx.baseUrl };
  const cfg = input.config as ApiConfig;
  const api = await pwRequest.newContext({ ignoreHTTPSErrors: true, timeout: input.timeoutMs });
  try {
    const method = (cfg.method ?? 'GET').toUpperCase();
    const url = resolveUrl(interpolate(input.targetUrl, vars), ctx.baseUrl);
    const headers = Object.fromEntries(Object.entries(cfg.headers ?? {}).map(([k, v]) => [k, interpolate(v, vars) ?? '']));
    const body = interpolate(cfg.body, vars);
    log('step', `${method} ${url}`);
    const reqStart = Date.now();
    const res = await api.fetch(url, { method, headers, data: body || undefined, failOnStatusCode: false });
    const elapsed = Date.now() - reqStart;
    const text = await res.text();
    outcome.metrics = { responseTimeMs: elapsed, transferSizeKb: Math.round(Buffer.byteLength(text) / 1024) };
    log('info', `Response ${res.status()} in ${elapsed}ms (${text.length} bytes)`);
    log('info', `Body: ${text.slice(0, 500)}${text.length > 500 ? '…' : ''}`);

    const expected = cfg.expectedStatus ?? 200;
    if (res.status() !== expected) throw new AssertionFailure(`Expected status ${expected} but got ${res.status()}`);
    log('pass', `✓ status ${expected}`);

    if (cfg.maxResponseTimeMs && elapsed > cfg.maxResponseTimeMs)
      throw new AssertionFailure(`Response took ${elapsed}ms, exceeding ${cfg.maxResponseTimeMs}ms`);

    const contains = interpolate(cfg.bodyContains, vars);
    if (contains) {
      if (!text.includes(contains)) throw new AssertionFailure(`Expected response body to contain "${contains}"`);
      log('pass', `✓ body contains "${contains}"`);
    }
    if (cfg.jsonAssertions?.length) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AssertionFailure('Response body is not valid JSON');
      }
      for (const a of cfg.jsonAssertions) {
        const actual = readJsonPath(json, a.path);
        const want = interpolate(a.equals, vars);
        if (String(actual) !== want) throw new AssertionFailure(`Expected ${a.path} to equal "${want}" but got "${JSON.stringify(actual)}"`);
        log('pass', `✓ ${a.path} = ${want}`);
      }
    }
    log('pass', 'Test passed');
  } catch (err) {
    const c = classify(err);
    outcome.status = c.status;
    outcome.errorMessage = c.message;
    outcome.errorStack = c.stack;
    log('error', c.message.split('\n')[0]);
  } finally {
    await api.dispose().catch(() => undefined);
    outcome.durationMs = Date.now() - started;
  }
  return outcome;
}
