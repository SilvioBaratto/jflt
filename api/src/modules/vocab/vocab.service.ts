import { Injectable } from '@nestjs/common';
import type { VocabEntry } from '@generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { Language } from '../../common/language';
import { VocabReviewDto } from './dto/vocab.dto';

const DAY = 86400000;

/** Vocabulary browsing/search and spaced-repetition flashcard drilling. */
@Injectable()
export class VocabService {
  constructor(private readonly prisma: PrismaService) {}

  /** List/search vocab entries of one language, filtered by part/section and a case-insensitive text query. */
  async list(params: {
    language: Language;
    part?: string;
    section?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const where = {
      language: params.language,
      ...(params.part ? { part: params.part } : {}),
      ...(params.section ? { section: params.section } : {}),
      ...(params.q
        ? {
            OR: [
              { termEn: { contains: params.q, mode: 'insensitive' as const } },
              { translationIt: { contains: params.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.vocabEntry.count({ where }),
      this.prisma.vocabEntry.findMany({
        where,
        orderBy: [{ section: 'asc' }, { termEn: 'asc' }],
        take: Math.min(params.limit ?? 50, 500),
        skip: params.offset ?? 0,
      }),
    ]);
    return { total, items };
  }

  /** Distinct sections of one language with their entry counts, for grouping the vocab browser. */
  async sections(language: Language): Promise<unknown> {
    const rows = await this.prisma.vocabEntry.groupBy({
      by: ['section'],
      where: { language },
      _count: { _all: true },
      orderBy: { section: 'asc' },
    });
    return rows.map((r) => ({ section: r.section, count: r._count._all }));
  }

  /** Return flashcards of one language: due review items first, topped up with undrilled entries. */
  async flashcards(language: Language, limit = 20): Promise<unknown> {
    // ReviewItem has no language column, so the due queue cannot be narrowed in SQL. A `take` here
    // would let older due cards of the other language crowd this one out; the queue is bounded by
    // the vocab bank (one row per entry), so reading it whole is cheap.
    const due = await this.prisma.reviewItem.findMany({
      where: { itemType: 'vocab', dueAt: { lte: new Date() } },
      orderBy: { dueAt: 'asc' },
      select: { itemId: true },
    });
    const dueEntries = due.length
      ? await this.prisma.vocabEntry.findMany({
          where: { id: { in: due.map((d) => d.itemId) }, language },
        })
      : [];
    const byId = new Map(dueEntries.map((e) => [e.id, e]));
    const cards = due
      .map((d) => byId.get(d.itemId))
      .filter((e): e is VocabEntry => e !== undefined)
      .slice(0, limit);
    if (cards.length < limit) {
      const extra = await this.prisma.vocabEntry.findMany({
        where: { language, ...(cards.length ? { id: { notIn: cards.map((c) => c.id) } } : {}) },
        take: limit - cards.length,
      });
      cards.push(...extra);
    }
    return cards;
  }

  /** Record a flashcard outcome and schedule its next review (SM-2-lite). */
  async review(dto: VocabReviewDto): Promise<{ ok: true }> {
    const where = {
      itemType_itemId_questionIndex: { itemType: 'vocab', itemId: dto.vocabId, questionIndex: 0 },
    };
    const existing = await this.prisma.reviewItem.findUnique({ where });
    if (dto.remembered) {
      const ease = existing?.ease ?? 2.5;
      const interval = existing ? Math.max(1, Math.round((existing.intervalDays || 1) * ease)) : 1;
      await this.prisma.reviewItem.upsert({
        where,
        create: {
          itemType: 'vocab',
          itemId: dto.vocabId,
          intervalDays: interval,
          reps: 1,
          lastResult: true,
          dueAt: new Date(Date.now() + interval * DAY),
        },
        update: {
          intervalDays: interval,
          reps: { increment: 1 },
          lastResult: true,
          dueAt: new Date(Date.now() + interval * DAY),
        },
      });
    } else {
      await this.prisma.reviewItem.upsert({
        where,
        create: {
          itemType: 'vocab',
          itemId: dto.vocabId,
          intervalDays: 1,
          ease: 2.3,
          lapses: 1,
          lastResult: false,
          dueAt: new Date(Date.now() + DAY),
        },
        update: {
          intervalDays: 1,
          lapses: { increment: 1 },
          lastResult: false,
          dueAt: new Date(Date.now() + DAY),
        },
      });
    }
    return { ok: true };
  }
}
