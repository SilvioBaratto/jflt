import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Aggregates learner progress: weak areas, due reviews, and recent session results. */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** Build the dashboard: weakest topics, review-due counts by type, and recent completed sessions. */
  async dashboard(): Promise<unknown> {
    const [stats, reviewDue, sessions, bankCounts] = await Promise.all([
      this.prisma.topicStat.findMany({ where: { seen: { gt: 0 } } }),
      this.prisma.reviewItem.groupBy({
        by: ['itemType'],
        where: { dueAt: { lte: new Date() } },
        _count: { _all: true },
      }),
      this.prisma.examSession.findMany({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 20,
      }),
      this.bankCounts(),
    ]);

    const weakAreas = stats
      .map((s) => ({
        skill: s.skill,
        level: s.level,
        topic: s.topic,
        seen: s.seen,
        accuracy: s.seen ? Math.round((100 * s.correct) / s.seen) : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 10);

    return {
      weakAreas,
      reviewDue: reviewDue.map((r) => ({ itemType: r.itemType, count: r._count._all })),
      recentSessions: sessions.map((s) => ({
        id: s.id,
        mode: s.mode,
        skill: s.skill,
        completedAt: s.completedAt,
        result: s.result,
      })),
      totalCompleted: sessions.length,
      bank: bankCounts,
    };
  }

  private async bankCounts(): Promise<Record<string, number>> {
    const [reading, listening, writing, vocab] = await Promise.all([
      this.prisma.readingItem.count(),
      this.prisma.listeningItem.count(),
      this.prisma.writingTask.count(),
      this.prisma.vocabEntry.count(),
    ]);
    return { reading, listening, writing, vocab };
  }
}
