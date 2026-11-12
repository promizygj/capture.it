import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { BrowserPool, closeAllBrowsers, liveBrowserCount } from '../src/engine/browserPool.js';
import { runApiCase, runBrowserCase } from '../src/engine/executor.js';
import { templateMap } from '../src/engine/templates.js';
import type { CaseInput } from '../src/engine/types.js';
import { startFixtureServer } from './fixtureServer.js';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
let pool: BrowserPool;
const ctx = () => ({ baseUrl: server.url, variables: { USERNAME: 'demo@example.com', PASSWORD: 'Password123' }, artifactKey: 'test' });

function fromTemplate(key: string, targetUrl: string, config: Record<string, unknown>, timeoutMs = 15000): CaseInput {
  const { steps, expectations } = templateMap.get(key)!.build(config);
  return { id: key, name: key, template: key, targetUrl, config, steps, expectations, timeoutMs };
}

beforeAll(async () => {
  server = await startFixtureServer();
  pool = new BrowserPool();
});
afterAll(async () => {
  await pool.close();
  await closeAllBrowsers();
  await server.close();
});

describe('browser execution engine', () => {
  it('passes a navigation test and records performance metrics', async () => {
    const out = await runBrowserCase(pool, 'chromium', fromTemplate('page-load', '/demo/', { expectedTitle: 'Demo Shop', requiredSelector: 'header' }), ctx());
    expect(out.status).toBe('PASSED');
    expect(out.screenshot).toBeUndefined();
    expect(out.metrics?.loadMs).toBeGreaterThan(0);
    expect(out.logs.some((l) => l.message.includes('Navigated to'))).toBe(true);
  });

  it('runs a login test with environment variables', async () => {
    const out = await runBrowserCase(
      pool, 'chromium',
      fromTemplate('login', '/demo/login', { usernameSelector: '#email', passwordSelector: '#password', submitSelector: 'button[type=submit]', username: '{{USERNAME}}', password: '{{PASSWORD}}', successUrl: '/demo/account', successSelector: '.user-menu' }),
      ctx(),
    );
    expect(out.status, out.errorMessage).toBe('PASSED');
    // Secrets typed into fields are never written to the log
    expect(JSON.stringify(out.logs)).not.toContain('Password123');
  });

  it('validates forms (negative and positive paths)', async () => {
    const neg = await runBrowserCase(pool, 'chromium', fromTemplate('form-validation', '/demo/contact', { fields: '', submitSelector: 'button[type=submit]', resultSelector: '#alert', resultText: 'Name is required' }), ctx());
    expect(neg.status, neg.errorMessage).toBe('PASSED');
    const pos = await runBrowserCase(pool, 'chromium', fromTemplate('form-validation', '/demo/contact', { fields: '#name => Jane\n#email => jane@example.com\n#message => Hello there friends', submitSelector: 'button[type=submit]', resultSelector: '#alert', resultText: 'Thank you' }), ctx());
    expect(pos.status, pos.errorMessage).toBe('PASSED');
  });

  it('captures a PNG screenshot, the error and the console errors on failure', async () => {
    const out = await runBrowserCase(pool, 'chromium', fromTemplate('page-load', '/demo/broken', { failOnConsoleErrors: true }), ctx());
    expect(out.status).toBe('FAILED');
    expect(out.errorMessage).toMatch(/console errors/);
    expect(out.screenshot).toBeInstanceOf(Buffer);
    expect(PNG.sync.read(out.screenshot!).width).toBe(1280);
    expect(out.consoleErrors.some((e) => e.text.includes('undefinedFunctionCall'))).toBe(true);
    expect(out.networkFailures.map((n) => n.status)).toEqual(expect.arrayContaining([404, 500]));
  });

  it('fails an assertion when an element is missing', async () => {
    const out = await runBrowserCase(pool, 'chromium', fromTemplate('element-interaction', '/demo/', { action: 'click', selector: '#does-not-exist' }, 4000), ctx());
    expect(out.status).toBe('FAILED');
    expect(out.errorMessage).toMatch(/does-not-exist|Timeout|exceeded/);
  });

  it('enforces the per-test timeout and still cleans up', async () => {
    const started = Date.now();
    const out = await runBrowserCase(pool, 'chromium', fromTemplate('page-load', '/slow', {}, 2000), ctx());
    expect(out.status).toBe('FAILED');
    expect(out.errorMessage).toMatch(/timeout|exceeded/i);
    expect(Date.now() - started).toBeLessThan(12_000);
  });

  it('reports an ERROR when the site is unreachable', async () => {
    const out = await runBrowserCase(pool, 'chromium', fromTemplate('page-load', 'http://127.0.0.1:1/', {}, 5000), { ...ctx() });
    expect(out.status).toBe('ERROR');
  });

  it('recovers from a browser crash: the running test errors and the next test gets a fresh browser', async () => {
    const crashPool = new BrowserPool();
    const browser = await crashPool.get('chromium');
    const pending = runBrowserCase(crashPool, 'chromium', { ...fromTemplate('custom-steps', '/demo/', {}), steps: [{ action: 'waitForTimeout', value: '5000' }], expectations: [] }, ctx());
    setTimeout(() => void browser.close(), 1200);
    const crashed = await pending;
    expect(crashed.status).toBe('ERROR');
    const next = await runBrowserCase(crashPool, 'chromium', fromTemplate('page-load', '/demo/', {}), ctx());
    expect(next.status).toBe('PASSED');
    await crashPool.close();
  });

  it('runs on Firefox and WebKit too', async () => {
    for (const kind of ['firefox', 'webkit'] as const) {
      const out = await runBrowserCase(pool, kind, fromTemplate('add-to-cart', '/demo/products', { addButtonSelector: '[data-testid=add-to-cart]', cartCountSelector: '#cart-count', expectedCount: '1' }), ctx());
      expect(out.status, `${kind}: ${out.errorMessage}`).toBe('PASSED');
    }
  });

  it('compares screenshots against a visual baseline', async () => {
    const input = fromTemplate('visual-regression', '/demo/', {});
    input.config = { fullPage: true, maxDiffRatio: 0.01 };
    const first = await runBrowserCase(pool, 'chromium', input, ctx());
    expect(first.status).toBe('PASSED');
    expect(first.currentImage).toBeInstanceOf(Buffer);
    const same = await runBrowserCase(pool, 'chromium', input, { ...ctx(), baseline: first.currentImage });
    expect(same.diffRatio).toBe(0);
    const changed = await runBrowserCase(pool, 'chromium', { ...input, targetUrl: '/demo/contact' }, { ...ctx(), baseline: first.currentImage });
    expect(changed.status).toBe('FAILED');
    expect(changed.diffImage).toBeInstanceOf(Buffer);
  });
});

describe('API tests', () => {
  it('validates status, timing and JSON fields', async () => {
    const out = await runApiCase(
      { id: 'a', name: 'a', template: 'api-request', targetUrl: '/api/items', steps: [], expectations: [], timeoutMs: 5000,
        config: { method: 'GET', expectedStatus: 200, maxResponseTimeMs: 3000, jsonAssertions: [{ path: 'items[0].name', equals: 'Widget' }] } },
      ctx(),
    );
    expect(out.status, out.errorMessage).toBe('PASSED');
    expect(out.metrics?.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
  it('sends bodies and interpolated headers, and fails on wrong status', async () => {
    const ok = await runApiCase(
      { id: 'b', name: 'b', template: 'api-request', targetUrl: '/api/echo', steps: [], expectations: [], timeoutMs: 5000,
        config: { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer {{USERNAME}}' }, body: '{"x":1}', expectedStatus: 201, jsonAssertions: [{ path: 'auth', equals: 'Bearer demo@example.com' }, { path: 'received.x', equals: '1' }] } },
      ctx(),
    );
    expect(ok.status, ok.errorMessage).toBe('PASSED');
    const bad = await runApiCase(
      { id: 'c', name: 'c', template: 'api-request', targetUrl: '/api/items', steps: [], expectations: [], timeoutMs: 5000, config: { expectedStatus: 404 } },
      ctx(),
    );
    expect(bad.status).toBe('FAILED');
    expect(bad.errorMessage).toContain('Expected status 404 but got 200');
  });
});

describe('cleanup', () => {
  it('leaves no browser processes behind once pools are closed', async () => {
    await pool.close();
    expect(liveBrowserCount()).toBe(0);
  });
});
