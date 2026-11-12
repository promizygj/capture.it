import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

/** Applies migrations to the dedicated test database and empties its tables. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://qa:qa@localhost:5440/qa_platform_test';
  if (!/_test\b/.test(url)) throw new Error(`Refusing to run tests against non-test database: ${url}`);
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.$disconnect();
  return () => fs.rmSync('./storage-test', { recursive: true, force: true });
}
