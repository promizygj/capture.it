import { Queue } from 'bullmq';
import { createRedis } from './lib/redis.js';

export const RUN_QUEUE = 'test-runs';

export interface RunJob {
  runId: string;
}
export interface ScheduledJob {
  scheduleId: string;
}

let queue: Queue | undefined;

export function getRunQueue(): Queue {
  if (!queue) {
    queue = new Queue(RUN_QUEUE, {
      connection: createRedis(),
      defaultJobOptions: { removeOnComplete: 500, removeOnFail: 1000, attempts: 1 },
    });
  }
  return queue;
}

export async function enqueueRun(runId: string) {
  await getRunQueue().add('run', { runId } satisfies RunJob, { jobId: `run-${runId}` });
}

export async function syncSchedule(s: { id: string; cron: string; timezone: string; enabled: boolean }) {
  const q = getRunQueue();
  if (!s.enabled) {
    await q.removeJobScheduler(`schedule-${s.id}`);
    return;
  }
  await q.upsertJobScheduler(
    `schedule-${s.id}`,
    { pattern: s.cron, tz: s.timezone },
    { name: 'scheduled', data: { scheduleId: s.id } satisfies ScheduledJob },
  );
}

export async function removeSchedule(id: string) {
  await getRunQueue().removeJobScheduler(`schedule-${id}`);
}

export async function closeQueue() {
  await queue?.close();
  queue = undefined;
}
