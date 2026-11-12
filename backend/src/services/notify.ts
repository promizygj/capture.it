import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { sendMail } from './mail.js';

/** Sends failure notifications (email to project members + Slack incoming webhook) for a finished run. */
export async function notifyRunFinished(runId: string) {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    include: {
      project: { include: { members: { include: { user: true } } } },
      suite: true,
      environment: true,
      results: { where: { status: { in: ['FAILED', 'ERROR'] } }, take: 10, orderBy: { finishedAt: 'asc' } },
    },
  });
  if (!run) return;
  const url = `${config.APP_URL}/runs/${run.id}`;
  const scope = run.suite ? `suite "${run.suite.name}"` : 'all suites';
  const headline = `❌ ${run.project.name}: ${run.failed} of ${run.total} tests failed (${scope}${run.environment ? `, ${run.environment.name}` : ''})`;
  const lines = run.results.map((r) => `• ${r.suiteName} › ${r.testCaseName} [${r.browser}] – ${(r.errorMessage ?? '').split('\n')[0].slice(0, 160)}`);

  const tasks: Promise<unknown>[] = [];
  if (run.project.notifyEmail) {
    const recipients = run.project.members.map((m) => m.user.email);
    if (recipients.length) {
      tasks.push(
        sendMail(
          recipients,
          `[QA] ${run.project.name} – test run failed`,
          `${headline}\n\n${lines.join('\n')}\n\nView report: ${url}`,
          `<h2 style="font-family:sans-serif">${escapeHtml(headline)}</h2><ul style="font-family:sans-serif">${run.results
            .map((r) => `<li><b>${escapeHtml(r.suiteName)} › ${escapeHtml(r.testCaseName)}</b> [${r.browser}]<br><code>${escapeHtml((r.errorMessage ?? '').slice(0, 300))}</code></li>`)
            .join('')}</ul><p><a href="${url}">Open the full report</a></p>`,
        ),
      );
    }
  }
  if (run.project.slackWebhookUrl) {
    tasks.push(
      fetch(run.project.slackWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: headline,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `*${headline}*` } },
            { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') || '_No details_' } },
            { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View report' }, url }] },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      }).then((r) => {
        if (!r.ok) throw new Error(`Slack webhook responded ${r.status}`);
      }),
    );
  }
  const results = await Promise.allSettled(tasks);
  results.forEach((r) => r.status === 'rejected' && logger.warn('Notification channel failed', { runId, err: String(r.reason) }));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
