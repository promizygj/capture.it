import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4100),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  APP_URL: z.string().default('http://localhost:5173'),
  STORAGE_DIR: z.string().default('./storage'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  SMTP_URL: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Capture.It <no-reply@qa.local>'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().optional().default(''),
  /** Send the auth cookie only over HTTPS (default: on in production) */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Run the queue worker inside the API process (handy for single-container deploys) */
  EMBEDDED_WORKER: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  STORAGE_DIR: path.resolve(parsed.data.STORAGE_DIR),
  isProd: parsed.data.NODE_ENV === 'production',
  cookieSecure: parsed.data.COOKIE_SECURE ? parsed.data.COOKIE_SECURE === 'true' : parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
