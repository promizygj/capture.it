import { Redis } from 'ioredis';
import { config } from '../config.js';

export function createRedis() {
  // BullMQ requires maxRetriesPerRequest: null for blocking connections
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}
