import { Worker, type Job } from 'bullmq';
import { config } from './config.js';
import { createRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { RUN_QUEUE, getRunQueue, syncSchedule, type RunJob, type ScheduledJob } from './queue.js';
import { executeRun } from './services/executeRun.js';
import { createRun } from './services/runService.js';
import { closeAllBrowsers } from './engine/browserPool.js';

async function processJob(job: Job<RunJob | ScheduledJob>) {
  if (job.name === 'scheduled') {
    const { scheduleId } = job.data as ScheduledJob;
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule || !schedule.enabled) {
      await getRunQueue().removeJobScheduler(`schedule-${scheduleId}`);
      return;
    }
    await prisma.schedule.update({ where: { id: scheduleId }, data: { lastRunAt: new Date() } });
    const run = await createRun({
      projectId: schedule.projectId,
      suiteId: schedule.suiteId,
      environmentId: schedule.environmentId,
      browsers: schedule.browsers,
      trigger: 'SCHEDULE',
    });
    logger.info('Scheduled run queued', { scheduleId, runId: run.id });
    return;
  }
  await executeRun((job.data as RunJob).runId);
}

export function startWorker() {
  // Each job is one test run; WORKER_CONCURRENCY runs execute side-by-side, and test cases inside
  // a run execute in parallel up to the project's maxParallel setting.
  const worker = new Worker(RUN_QUEUE, processJob, {
    connection: createRedis(),
    concurrency: config.WORKER_CONCURRENCY,
    lockDuration: 120_000,
  });
  worker.on('failed', async (job, err) => {
    logger.error('Job failed', { id: job?.id, err: err.message });
    const runId = (job?.data as RunJob | undefined)?.runId;
    if (runId) {
      await prisma.testRun
        .updateMany({
          where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
          data: { status: 'ERROR', errorMessage: err.message, finishedAt: new Date() },
        })
        .catch(() => undefined);
    }
  });
  worker.on('ready', () => logger.info('Worker ready', { queue: RUN_QUEUE, concurrency: config.WORKER_CONCURRENCY }));
  return worker;
}

/** Re-register all enabled schedules (idempotent) so Redis state matches the database. */
export async function restoreSchedules() {
  const schedules = await prisma.schedule.findMany({ where: { enabled: true } });
  await Promise.all(schedules.map((s) => syncSchedule(s)));
  logger.info('Schedules restored', { count: schedules.length });
}

/** Runs left RUNNING by a crashed worker can never finish – mark them as errored. */
async function recoverOrphanedRuns() {
  const { count } = await prisma.testRun.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 60 * 60_000) } },
    data: { status: 'ERROR', errorMessage: 'Worker stopped before the run completed', finishedAt: new Date() },
  });
  if (count) logger.warn('Recovered orphaned runs', { count });
}

const isEntry = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js');
/** Retries a startup task so the worker survives Postgres/Redis still booting (or briefly unavailable). */
async function withStartupRetry(name: string, task: () => Promise<void>, attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      return await task();
    } catch (err) {
      if (i >= attempts) throw err;
      logger.warn(`${name} failed, retrying in 2s`, { attempt: i, err: err instanceof Error ? err.message.split('\n')[0] : String(err) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

if (isEntry) {
  await withStartupRetry('Database connection', () => prisma.$queryRaw`SELECT 1`.then(() => undefined));
  const worker = startWorker();
  await withStartupRetry('Restoring schedules', restoreSchedules);
  await withStartupRetry('Recovering orphaned runs', recoverOrphanedRuns);
  const shutdown = async (sig: string) => {
    logger.info('Worker shutting down', { sig });
    await worker.close();
    await closeAllBrowsers();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
