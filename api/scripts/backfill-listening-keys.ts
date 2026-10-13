/** Backfill answer keys for seed listening items by blind-solving them with Claude. */
import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: ['../.env', '.env'] });
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClaudeAgentService } from '../src/claude/claude-agent.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const claude = new ClaudeAgentService();

type Line = { speaker: string; text: string };
type Question = { question: string; options: Record<string, string>; correctLabel: string | null; rationale: string | null };

/** Solve every keyless listening item and persist the recovered keys. */
async function run(): Promise<void> {
  const items = await prisma.listeningItem.findMany({ where: { hasKey: false } });
  console.log('to backfill:', items.length);
  let done = 0;
  for (const item of items) {
    const lines = item.lines as unknown as Line[];
    const questions = item.questions as unknown as Question[];
    try {
      const answers = await claude.solveListeningKeys(
        lines,
        questions.map((q) => ({ question: q.question, options: q.options })),
      );
      const merged = questions.map((q, i) => ({
        ...q,
        correctLabel: answers[i]?.correctLabel ?? null,
        rationale: answers[i]?.rationale ?? null,
      }));
      await prisma.listeningItem.update({
        where: { id: item.id },
        data: { questions: merged as object, hasKey: merged.every((m) => m.correctLabel) },
      });
      done++;
      console.log(`  ${item.topic.slice(0, 40)} -> ${merged.map((m) => m.correctLabel).join(',')}`);
    } catch (e) {
      console.error('  FAILED', item.id, (e as Error).message);
    }
  }
  console.log(`backfilled ${done}/${items.length}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
