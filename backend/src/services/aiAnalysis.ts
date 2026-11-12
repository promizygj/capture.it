import Anthropic from '@anthropic-ai/sdk';
import type { TestResult } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

type ResultForAnalysis = Pick<
  TestResult,
  'testCaseName' | 'suiteName' | 'template' | 'browser' | 'errorMessage' | 'errorStack' | 'logs' | 'consoleErrors' | 'networkFailures' | 'status'
> & { targetUrl?: string; history?: string[] };

const SYSTEM_PROMPT = `You are a senior QA automation engineer helping a teammate triage a failed Playwright browser test.
Given the failure details, write a concise analysis in Markdown with exactly these sections:
## Summary
One or two sentences describing what failed, in plain language.
## Likely causes
A ranked bullet list (most likely first). Distinguish between a genuine application bug, a test/selector problem, environment/network issues, and flakiness (timing). Cite the specific evidence (log line, console error, HTTP status) behind each cause.
## Suggested next steps
Concrete, actionable bullets (e.g. which selector to verify, what to check in the app, whether to add a wait or increase the timeout).
Be specific and brief. Do not invent details that are not supported by the evidence.`;

function buildEvidence(r: ResultForAnalysis): string {
  const logs = (r.logs as { level: string; message: string }[] | null) ?? [];
  const consoleErrors = (r.consoleErrors as { text: string }[] | null) ?? [];
  const network = (r.networkFailures as { method: string; url: string; status?: number; failure?: string }[] | null) ?? [];
  return [
    `Test: ${r.suiteName} › ${r.testCaseName} (template: ${r.template}, browser: ${r.browser}, status: ${r.status})`,
    r.targetUrl ? `Target URL: ${r.targetUrl}` : '',
    `Error message:\n${r.errorMessage ?? 'n/a'}`,
    r.errorStack ? `Stack (truncated):\n${r.errorStack.slice(0, 1500)}` : '',
    `Execution log:\n${logs.map((l) => `[${l.level}] ${l.message}`).slice(-40).join('\n')}`,
    consoleErrors.length ? `Browser console errors:\n${consoleErrors.slice(0, 15).map((c) => `- ${c.text}`).join('\n')}` : 'Browser console errors: none',
    network.length
      ? `Failed network requests:\n${network.slice(0, 15).map((n) => `- ${n.method} ${n.url} → ${n.status ?? n.failure}`).join('\n')}`
      : 'Failed network requests: none',
    r.history?.length ? `Recent history of this test (newest first): ${r.history.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Rule-based analysis used when no Anthropic API key/model is configured (or the API call fails). */
export function heuristicAnalysis(r: ResultForAnalysis): string {
  const msg = `${r.errorMessage ?? ''}`;
  const causes: string[] = [];
  const steps: string[] = [];
  const network = (r.networkFailures as { status?: number; url: string }[] | null) ?? [];
  const consoleErrors = (r.consoleErrors as { text: string }[] | null) ?? [];

  if (/waiting for locator|locator\.|strict mode violation|to be visible|Expected element/i.test(msg)) {
    causes.push('**Selector / element problem** – the element was not found or not visible in time. The selector may be outdated after a UI change, or the element renders later than expected.');
    steps.push('Open the failure screenshot and confirm the element exists; verify the selector in the browser devtools.');
  }
  if (/timeout|Timed out|exceeded/i.test(msg)) {
    causes.push('**Timing** – an action or the whole test exceeded its timeout. Slow page loads or long-running requests are common causes.');
    steps.push('Check the performance metrics and network log; consider raising the test timeout or waiting for a specific element.');
  }
  if (/net::ERR_|NS_ERROR|ECONNREFUSED|ENOTFOUND|Could not connect/i.test(msg)) {
    causes.push('**Environment / connectivity** – the target site could not be reached from the test runner.');
    steps.push('Verify the environment base URL and that the site is up and reachable from the worker.');
  }
  if (/Expected status|status below|HTTP status/i.test(msg) || network.some((n) => (n.status ?? 0) >= 500)) {
    causes.push('**Server error** – the application returned an unexpected HTTP status, which points to a backend issue rather than the test.');
    steps.push(`Inspect the server logs for: ${network.filter((n) => (n.status ?? 0) >= 400).slice(0, 3).map((n) => n.url).join(', ') || 'the failing request'}.`);
  }
  if (/text to contain|to equal|title to contain|URL to contain/i.test(msg)) {
    causes.push('**Content mismatch** – the page rendered but showed different content than expected. Either the application behaviour changed or the expectation is outdated.');
    steps.push('Compare the expected value with the actual value in the error message; update the expectation if the change is intended.');
  }
  if (/Visual difference/i.test(msg)) {
    causes.push('**UI change** – the page differs from the approved visual baseline.');
    steps.push('Review the diff image. If the change is intentional, approve the new baseline.');
  }
  if (consoleErrors.length) {
    causes.push(`**JavaScript errors** – ${consoleErrors.length} console error(s) were recorded, e.g. \`${consoleErrors[0].text.slice(0, 120)}\`.`);
  }
  const flips = r.history?.filter((h, i, a) => i > 0 && h !== a[i - 1]).length ?? 0;
  if (flips >= 2) {
    causes.push('**Flakiness** – this test has alternated between passing and failing recently.');
    steps.push('Enable retries for the project and look for race conditions (animations, async data loading).');
  }
  if (!causes.length) causes.push('No known pattern matched. Review the execution log and screenshot for details.');
  if (!steps.length) steps.push('Re-run the test to check whether the failure is reproducible.');

  return `## Summary\n"${r.testCaseName}" ${r.status === 'ERROR' ? 'could not be executed' : 'failed'} on ${r.browser}: ${msg.split('\n')[0].slice(0, 200)}\n\n## Likely causes\n${causes.map((c) => `- ${c}`).join('\n')}\n\n## Suggested next steps\n${steps.map((s) => `- ${s}`).join('\n')}\n\n_Rule-based analysis. Set ANTHROPIC_API_KEY to enable AI analysis._`;
}

let client: Anthropic | undefined;

export async function analyseFailure(r: ResultForAnalysis): Promise<{ analysis: string; source: 'ai' | 'heuristic' }> {
  if (!config.ANTHROPIC_API_KEY || !config.ANTHROPIC_MODEL) return { analysis: heuristicAnalysis(r), source: 'heuristic' };
  client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      // Re-route policy declines to a fallback model automatically
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildEvidence(r) }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === 'refusal') return { analysis: heuristicAnalysis(r), source: 'heuristic' };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text ? { analysis: text, source: 'ai' } : { analysis: heuristicAnalysis(r), source: 'heuristic' };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) logger.error('Anthropic API key rejected');
    else if (err instanceof Anthropic.RateLimitError) logger.warn('Anthropic rate limit hit, using heuristic analysis');
    else logger.error('AI analysis failed', { err: String(err) });
    return { analysis: heuristicAnalysis(r), source: 'heuristic' };
  }
}
