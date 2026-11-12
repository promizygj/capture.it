import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { closeQueue } from './queue.js';

const app = createApp();
const server = app.listen(config.PORT, () => logger.info(`API listening on http://localhost:${config.PORT}`));

let worker: { close: () => Promise<void> } | undefined;
if (config.EMBEDDED_WORKER) {
  const mod = await import('./worker.js');
  worker = mod.startWorker();
  await mod.restoreSchedules();
}

const shutdown = async () => {
  server.close();
  await worker?.close();
  await closeQueue();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
