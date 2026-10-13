/**
 * Seed the database from prisma/seed-data.json (built by scripts/build-seed-data.py).
 *
 * Idempotent: clears existing seed-sourced content first, so it is safe to re-run.
 * Run with `npm run seed` from api/ (DATABASE_URL comes from the root .env).
 */
import { config } from 'dotenv';
config({ path: ['../.env', '.env'] });

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const file = join(process.cwd(), 'prisma', 'seed-data.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));

  // Wipe prior seed content so re-running does not duplicate rows.
  await prisma.readingItem.deleteMany({ where: { source: 'seed' } });
  await prisma.writingTask.deleteMany({ where: { source: 'seed' } });
  await prisma.listeningItem.deleteMany({ where: { source: 'seed' } });
  await prisma.vocabEntry.deleteMany({});

  await prisma.readingItem.createMany({ data: data.readingItems });
  await prisma.writingTask.createMany({ data: data.writingTasks });
  await prisma.listeningItem.createMany({ data: data.listeningItems });
  await prisma.vocabEntry.createMany({ data: data.vocabEntries });

  const [reading, writing, listening, vocab] = await Promise.all([
    prisma.readingItem.count(),
    prisma.writingTask.count(),
    prisma.listeningItem.count(),
    prisma.vocabEntry.count(),
  ]);
  console.log(
    `Seeded: reading=${reading} writing=${writing} listening=${listening} vocab=${vocab}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
