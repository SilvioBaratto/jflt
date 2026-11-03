import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Language } from '../../common/language';

/** Aggregates learner progress: weak areas, due reviews, and recent session results. */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the dashboard for one language: weakest topics, review-due counts by type, recent
   * completed sessions and question-bank sizes.
   */
  async dashboard(language: Language): Promise<unknown> {
    const [stats, reviewDue, sessions, bankCounts] = await Promise.all([
      this.prisma.topicStat.findMany({ where: { language, seen: { gt: 0 } } }),
      this.reviewDue(language),
      this.prisma.examSession.findMany({
        where: { language, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 20,
      }),
      this.bankCounts(language),
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
      reviewDue,
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

  /**
   * Counts due review rows per item type, keeping only items that belong to `language`.
   *
   * `ReviewItem` has no language column of its own, so the language is resolved through the
   * item tables it points at. Each due row counts once, so a listening item with two due
   * questions contributes two.
   */
  private async reviewDue(language: Language): Promise<{ itemType: string; count: number }[]> {
    const due = await this.prisma.reviewItem.findMany({
      where: { dueAt: { lte: new Date() } },
      select: { itemType: true, itemId: true },
    });

    const idsInLanguage: Record<string, (ids: string[]) => Promise<{ id: string }[]>> = {
      reading: (ids) =>
        this.prisma.readingItem.findMany({ where: { id: { in: ids }, language }, select: { id: true } }),
      listening: (ids) =>
        this.prisma.listeningItem.findMany({ where: { id: { in: ids }, language }, select: { id: true } }),
      vocab: (ids) =>
        this.prisma.vocabEntry.findMany({ where: { id: { in: ids }, language }, select: { id: true } }),
    };

    const counts = await Promise.all(
      Object.entries(idsInLanguage).map(async ([itemType, lookup]) => {
        const rows = due.filter((d) => d.itemType === itemType);
        if (rows.length === 0) return { itemType, count: 0 };
        const found = new Set((await lookup([...new Set(rows.map((r) => r.itemId))])).map((r) => r.id));
        return { itemType, count: rows.filter((r) => found.has(r.itemId)).length };
      }),
    );
    return counts.filter((c) => c.count > 0);
  }

  private async bankCounts(language: Language): Promise<Record<string, number>> {
    const where = { language };
    const [reading, listening, writing, vocab] = await Promise.all([
      this.prisma.readingItem.count({ where }),
      this.prisma.listeningItem.count({ where }),
      this.prisma.writingTask.count({ where }),
      this.prisma.vocabEntry.count({ where }),
    ]);
    return { reading, listening, writing, vocab };
  }
}
