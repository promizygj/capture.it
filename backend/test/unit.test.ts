import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { interpolate, resolveUrl } from '../src/engine/interpolate.js';
import { normaliseConfig, parsePairs, templateMap, templates } from '../src/engine/templates.js';
import { compareScreenshots } from '../src/engine/visual.js';
import { errorSignature } from '../src/services/insights.js';
import { heuristicAnalysis } from '../src/services/aiAnalysis.js';
import cron from '../src/lib/cron.js';

describe('interpolation', () => {
  it('replaces known variables and keeps unknown ones', () => {
    expect(interpolate('{{USER}} / {{ PASS }} / {{MISSING}}', { USER: 'a', PASS: 'b' })).toBe('a / b / {{MISSING}}');
  });
  it('resolves relative URLs against the base URL', () => {
    expect(resolveUrl('/login', 'https://x.test/app')).toBe('https://x.test/login');
    expect(resolveUrl('login', 'https://x.test/app')).toBe('https://x.test/app/login');
    expect(resolveUrl('', 'https://x.test')).toBe('https://x.test');
    expect(resolveUrl('https://other.test/a', 'https://x.test')).toBe('https://other.test/a');
  });
});

describe('templates', () => {
  it('every template has a unique key and a build function', () => {
    expect(new Set(templates.map((t) => t.key)).size).toBe(templates.length);
  });
  it('login template builds fill/fill/click steps with assertions', () => {
    const { steps, expectations } = templateMap.get('login')!.build({
      usernameSelector: '#u', passwordSelector: '#p', submitSelector: 'button', username: 'me', password: 'pw', successUrl: '/home',
    });
    expect(steps.map((s) => s.action)).toEqual(['fill', 'fill', 'click']);
    expect(expectations).toEqual([{ type: 'urlContains', value: '/home' }]);
  });
  it('page-load template adds optional checks only when configured', () => {
    const tpl = templateMap.get('page-load')!;
    expect(tpl.build({}).expectations).toEqual([{ type: 'statusBelow', value: '400' }]);
    expect(tpl.build({ expectedTitle: 'Shop', failOnConsoleErrors: true }).expectations.map((e) => e.type)).toEqual(['statusBelow', 'titleContains', 'noConsoleErrors']);
  });
  it('parses "selector => value" pairs', () => {
    expect(parsePairs('#a => 1\n\n#b => x => y\nbad')).toEqual([{ selector: '#a', value: '1' }, { selector: '#b', value: 'x => y' }]);
  });
  it('normalises API config strings into structures', () => {
    const cfg = normaliseConfig('api-request', { headers: 'Accept => application/json', jsonAssertions: 'a.b => 1', expectedStatus: '201' });
    expect(cfg).toMatchObject({ headers: { Accept: 'application/json' }, jsonAssertions: [{ path: 'a.b', equals: '1' }], expectedStatus: 201 });
  });
});

function solidPng(w: number, h: number, rgb: [number, number, number]) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...rgb, 255], i);
  return PNG.sync.write(png);
}

describe('visual comparison', () => {
  it('reports zero difference for identical images', () => {
    const img = solidPng(20, 20, [10, 20, 30]);
    expect(compareScreenshots(img, img).diffRatio).toBe(0);
  });
  it('detects changed pixels and size changes', () => {
    const a = solidPng(20, 20, [0, 0, 0]);
    const b = solidPng(20, 20, [255, 255, 255]);
    expect(compareScreenshots(a, b).diffRatio).toBe(1);
    const c = compareScreenshots(a, solidPng(20, 40, [0, 0, 0]));
    expect(c.sizeMismatch).toBe(true);
    expect(c.diffRatio).toBeGreaterThan(0.4);
  });
});

describe('insights helpers', () => {
  it('groups error messages that differ only in numbers/urls', () => {
    expect(errorSignature('Timeout 5000ms exceeded at https://a.test/x')).toBe(errorSignature('Timeout 3000ms exceeded at https://b.test/y'));
  });
  it('heuristic analysis recognises selector and timeout problems', () => {
    const out = heuristicAnalysis({
      testCaseName: 'Login', suiteName: 'Auth', template: 'login', browser: 'chromium', status: 'FAILED',
      errorMessage: 'locator.click: Timeout 10000ms exceeded. waiting for locator(\'#submit\')', errorStack: null,
      logs: [], consoleErrors: [], networkFailures: [], history: ['FAILED', 'PASSED', 'FAILED', 'PASSED'],
    });
    expect(out).toContain('Selector');
    expect(out).toContain('Timing');
    expect(out).toContain('Flakiness');
  });
});

describe('cron', () => {
  it('validates 5-field expressions', () => {
    expect(cron.isValid('*/5 * * * *')).toBe(true);
    expect(cron.isValid('* * * *')).toBe(false);
    expect(cron.isValid('nope')).toBe(false);
    expect(cron.next('0 2 * * *', 'UTC')!.getUTCHours()).toBe(2);
  });
});
