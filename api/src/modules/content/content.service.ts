import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Read-only listings of the question bank for the home/browse view (answer keys stripped). */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /** List reading items (passage + question, no options/key). */
  async reading(limit = 200, offset = 0): Promise<unknown> {
    const [total, items] = await Promise.all([
      this.prisma.readingItem.count(),
      this.prisma.readingItem.findMany({
        orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
        take: Math.min(limit, 500),
        skip: offset,
        select: { id: true, level: true, topic: true, passage: true, question: true, source: true },
      }),
    ]);
    return { total, items };
  }

  /** List listening items (topic/type/audio + question count, no transcript keys). */
  async listening(limit = 200, offset = 0): Promise<unknown> {
    const [total, rows] = await Promise.all([
      this.prisma.listeningItem.count(),
      this.prisma.listeningItem.findMany({
        orderBy: [{ createdAt: 'asc' }],
        take: Math.min(limit, 500),
        skip: offset,
        select: {
          id: true,
          level: true,
          topic: true,
          conversationType: true,
          setting: true,
          audioPath: true,
          questions: true,
          source: true,
        },
      }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      level: r.level,
      topic: r.topic,
      conversationType: r.conversationType,
      setting: r.setting,
      audioPath: r.audioPath,
      questionCount: Array.isArray(r.questions) ? r.questions.length : 0,
      source: r.source,
    }));
    return { total, items };
  }

  /** List writing tasks (title/instructions/band, no model answers). */
  async writing(limit = 50, offset = 0): Promise<unknown> {
    const [total, items] = await Promise.all([
      this.prisma.writingTask.count(),
      this.prisma.writingTask.findMany({
        orderBy: [{ stanagLevel: 'asc' }],
        take: Math.min(limit, 500),
        skip: offset,
        select: {
          id: true,
          taskType: true,
          stanagLevel: true,
          title: true,
          instructions: true,
          wordCountMin: true,
          wordCountMax: true,
          source: true,
        },
      }),
    ]);
    return { total, items };
  }
}
