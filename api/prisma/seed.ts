/**
 * Seed the database from prisma/seed-data.json (built by scripts/build-seed-data.py).
 *
 * The data holds one or more content languages, and each is loaded on its own: its seed-sourced
 * rows are cleared (generated items and other languages stay) and recreated in one transaction,
 * so an interrupted run never leaves a language half-seeded. The seed records carry no ids, though,
 * so a plain run gives every seed row of the languages in the file a new UUID: sessions, answers and
 * review items that referenced the old ids dangle. Use it on an empty or disposable database only.
 * With SEED_IF_EMPTY=1 only languages that have no seed rows yet are loaded, so container restarts
 * never wipe seeded rows that exam answers reference, while a database seeded before a language
 * existed still receives it.
 * Run with `npm run seed` from api/ (DATABASE_URL comes from the root .env).
 */
import { config } from 'dotenv';
config({ path: ['../.env', '.env'] });

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LANGUAGES, type Language } from '../src/common/language';
import { languagesToSeed } from '../src/common/seed-plan';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface SeedData {
  readingItems: Prisma.ReadingItemCreateManyInput[];
  writingTasks: Prisma.WritingTaskCreateManyInput[];
  listeningItems: Prisma.ListeningItemCreateManyInput[];
  vocabEntries: Prisma.VocabEntryCreateManyInput[];
}

function groupsOf(data: SeedData): { language?: string }[][] {
  return [data.readingItems, data.writingTasks, data.listeningItems, data.vocabEntries];
}

function recordsOf(data: SeedData, language: Language): SeedData {
  const only = <T extends { language?: string }>(rows: T[]): T[] =>
    rows.filter((row) => row.language === language);
  return {
    readingItems: only(data.readingItems),
    writingTasks: only(data.writingTasks),
    listeningItems: only(data.listeningItems),
    vocabEntries: only(data.vocabEntries),
  };
}

async function countSeedRows(language: Language): Promise<number> {
  const counts = await Promise.all([
    prisma.readingItem.count({ where: { language, source: 'seed' } }),
    prisma.writingTask.count({ where: { language, source: 'seed' } }),
    prisma.listeningItem.count({ where: { language, source: 'seed' } }),
    // Vocabulary has no source column: every entry comes from the seed.
    prisma.vocabEntry.count({ where: { language } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function seedLanguage(records: SeedData, language: Language): Promise<void> {
  await prisma.$transaction([
    prisma.readingItem.deleteMany({ where: { language, source: 'seed' } }),
    prisma.writingTask.deleteMany({ where: { language, source: 'seed' } }),
    prisma.listeningItem.deleteMany({ where: { language, source: 'seed' } }),
    prisma.vocabEntry.deleteMany({ where: { language } }),
    prisma.readingItem.createMany({ data: records.readingItems }),
    prisma.writingTask.createMany({ data: records.writingTasks }),
    prisma.listeningItem.createMany({ data: records.listeningItems }),
    prisma.vocabEntry.createMany({ data: records.vocabEntries }),
  ]);
}

async function main(): Promise<void> {
  const file = join(process.cwd(), 'prisma', 'seed-data.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as SeedData;

  const unlabelled = groupsOf(data)
    .flat()
    .filter((row) => !LANGUAGES.some((language) => language === row.language)).length;
  if (unlabelled > 0) {
    // Such records would be silently skipped, leaving the bank short with no error.
    throw new Error(
      `${unlabelled} records in ${file} lack a supported language; rebuild it with scripts/build-seed-data.py`,
    );
  }

  const present = LANGUAGES.filter((language) =>
    groupsOf(data).some((rows) => rows.some((row) => row.language === language)),
  );
  const existing = Object.fromEntries(
    await Promise.all(LANGUAGES.map(async (language) => [language, await countSeedRows(language)])),
  ) as Record<Language, number>;
  const toSeed = languagesToSeed(existing, present, process.env.SEED_IF_EMPTY === '1');

  const skipped = present.filter((language) => !toSeed.includes(language));
  if (skipped.length > 0) console.log(`Already seeded, skipping: ${skipped.join(', ')}`);

  for (const language of toSeed) {
    const records = recordsOf(data, language);
    await seedLanguage(records, language);
    console.log(
      `Seeded ${language}: reading=${records.readingItems.length} writing=${records.writingTasks.length} ` +
        `listening=${records.listeningItems.length} vocab=${records.vocabEntries.length}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
