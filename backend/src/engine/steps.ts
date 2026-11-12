import type { Page, Response } from 'playwright';
import { AssertionFailure, type ConsoleError, type Expectation, type Step } from './types.js';
import { interpolate, resolveUrl } from './interpolate.js';

export interface StepRuntime {
  page: Page;
  baseUrl: string;
  vars: Record<string, string>;
  log: (level: 'info' | 'step' | 'pass' | 'fail' | 'warn', msg: string) => void;
  consoleErrors: ConsoleError[];
  /** Last main-frame navigation response (used by statusBelow) */
  lastResponse: Response | null;
  /** Duration of the last goto, ms (used by loadTimeBelow) */
  lastLoadMs: number | null;
}

const describeStep = (s: Step) =>
  s.description || [s.action, s.selector && `"${s.selector}"`, s.value && s.action !== 'fill' ? `→ ${s.value}` : '']
    .filter(Boolean)
    .join(' ');

function requireSelector(s: { selector?: string }, what: string): string {
  if (!s.selector) throw new Error(`${what} requires a selector`);
  return s.selector;
}

export async function runStep(rt: StepRuntime, raw: Step, index: number) {
  const step: Step = {
    ...raw,
    selector: interpolate(raw.selector, rt.vars),
    value: interpolate(raw.value, rt.vars),
  };
  const { page } = rt;
  rt.log('step', index < 0 ? describeStep(raw) : `Step ${index + 1}: ${describeStep(raw)}`);

  switch (step.action) {
    case 'goto': {
      const url = resolveUrl(step.value, rt.baseUrl);
      const started = Date.now();
      rt.lastResponse = await page.goto(url, { waitUntil: 'load' });
      rt.lastLoadMs = Date.now() - started;
      rt.log('info', `Navigated to ${page.url()} (${rt.lastResponse?.status() ?? 'no response'}) in ${rt.lastLoadMs}ms`);
      break;
    }
    case 'click':
      await page.locator(requireSelector(step, 'click')).first().click();
      break;
    case 'fill':
      await page.locator(requireSelector(step, 'fill')).first().fill(step.value ?? '');
      break;
    case 'select':
      await page.locator(requireSelector(step, 'select')).first().selectOption(step.value ?? '');
      break;
    case 'check':
      await page.locator(requireSelector(step, 'check')).first().check();
      break;
    case 'uncheck':
      await page.locator(requireSelector(step, 'uncheck')).first().uncheck();
      break;
    case 'hover':
      await page.locator(requireSelector(step, 'hover')).first().hover();
      break;
    case 'press':
      if (step.selector) await page.locator(step.selector).first().press(step.value ?? 'Enter');
      else await page.keyboard.press(step.value ?? 'Enter');
      break;
    case 'waitForSelector':
      await page.locator(requireSelector(step, 'waitForSelector')).first().waitFor({ state: 'visible' });
      break;
    case 'waitForUrl': {
      const fragment = step.value ?? '';
      await page.waitForURL((u) => u.toString().includes(fragment));
      break;
    }
    case 'waitForTimeout':
      await page.waitForTimeout(Math.min(Number(step.value) || 500, 30_000));
      break;
    case 'scrollIntoView':
      await page.locator(requireSelector(step, 'scrollIntoView')).first().scrollIntoViewIfNeeded();
      break;
    default:
      throw new Error(`Unknown step action "${(step as Step).action}"`);
  }
}

/** Polls until predicate holds or the timeout elapses (auto-waiting assertions, like Playwright's expect). */
async function eventually(fn: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await fn()) return true;
    } catch {
      /* element may not exist yet */
    }
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function runExpectation(rt: StepRuntime, raw: Expectation, assertTimeoutMs = 5000) {
  const exp: Expectation = {
    ...raw,
    selector: interpolate(raw.selector, rt.vars),
    value: interpolate(raw.value, rt.vars),
  };
  const { page } = rt;
  const loc = () => page.locator(requireSelector(exp, exp.type)).first();
  const value = exp.value ?? '';
  let ok = false;
  let detail = '';

  switch (exp.type) {
    case 'visible':
      ok = await eventually(() => loc().isVisible(), assertTimeoutMs);
      detail = `Expected element "${exp.selector}" to be visible`;
      break;
    case 'hidden':
      ok = await eventually(async () => !(await page.locator(requireSelector(exp, 'hidden')).first().isVisible()), assertTimeoutMs);
      detail = `Expected element "${exp.selector}" to be hidden`;
      break;
    case 'textContains': {
      let actual = '';
      ok = await eventually(async () => {
        actual = exp.selector ? await loc().innerText() : await page.locator('body').innerText();
        return actual.toLowerCase().includes(value.toLowerCase());
      }, assertTimeoutMs);
      detail = `Expected ${exp.selector ? `"${exp.selector}"` : 'page'} text to contain "${value}" but got "${actual.slice(0, 200)}"`;
      break;
    }
    case 'textEquals': {
      let actual = '';
      ok = await eventually(async () => {
        actual = (await loc().innerText()).trim();
        return actual === value.trim();
      }, assertTimeoutMs);
      detail = `Expected "${exp.selector}" text to equal "${value}" but got "${actual.slice(0, 200)}"`;
      break;
    }
    case 'valueEquals': {
      let actual = '';
      ok = await eventually(async () => {
        actual = await loc().inputValue();
        return actual === value;
      }, assertTimeoutMs);
      detail = `Expected "${exp.selector}" value to equal "${value}" but got "${actual}"`;
      break;
    }
    case 'count': {
      let actual = -1;
      const expected = Number(value);
      ok = await eventually(async () => {
        actual = await page.locator(requireSelector(exp, 'count')).count();
        return actual === expected;
      }, assertTimeoutMs);
      detail = `Expected ${expected} element(s) matching "${exp.selector}" but found ${actual}`;
      break;
    }
    case 'urlContains':
      ok = await eventually(async () => page.url().includes(value), assertTimeoutMs);
      detail = `Expected URL to contain "${value}" but was "${page.url()}"`;
      break;
    case 'titleContains': {
      let title = '';
      ok = await eventually(async () => {
        title = await page.title();
        return title.toLowerCase().includes(value.toLowerCase());
      }, assertTimeoutMs);
      detail = `Expected page title to contain "${value}" but was "${title}"`;
      break;
    }
    case 'statusBelow': {
      const limit = Number(value) || 400;
      const status = rt.lastResponse?.status();
      ok = status !== undefined && status < limit;
      detail = `Expected HTTP status below ${limit} but got ${status ?? 'no response'}`;
      break;
    }
    case 'noConsoleErrors':
      ok = rt.consoleErrors.length === 0;
      detail = `Expected no console errors but found ${rt.consoleErrors.length}: ${rt.consoleErrors
        .slice(0, 3)
        .map((e) => e.text)
        .join(' | ')}`;
      break;
    case 'loadTimeBelow': {
      const limit = Number(value) || 3000;
      ok = rt.lastLoadMs !== null && rt.lastLoadMs < limit;
      detail = `Expected page load below ${limit}ms but took ${rt.lastLoadMs ?? 'n/a'}ms`;
      break;
    }
    default:
      throw new Error(`Unknown assertion type "${(exp as Expectation).type}"`);
  }

  if (!ok) {
    rt.log('fail', `✗ ${detail}`);
    throw new AssertionFailure(detail);
  }
  rt.log('pass', `✓ ${exp.type}${exp.selector ? ` "${exp.selector}"` : ''}${exp.value ? ` = "${exp.value}"` : ''}`);
}
