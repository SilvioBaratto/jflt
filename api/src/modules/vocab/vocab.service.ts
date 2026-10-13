import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VocabReviewDto } from './dto/vocab.dto';

const DAY = 86400000;

/** Vocabulary browsing/search and spaced-repetition flashcard drilling. */
@Injectable()
export class VocabService {
  constructor(private readonly prisma: PrismaService) {}

  /** List/search vocab entries, filtered by part/section and a case-insensitive text query. */
  async list(params: {
    part?: string;
    section?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const where = {
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

  /** Distinct sections with their entry counts, for grouping the vocab browser. */
  async sections(): Promise<unknown> {
    const rows = await this.prisma.vocabEntry.groupBy({
      by: ['section'],
      _count: { _all: true },
      orderBy: { section: 'asc' },
    });
    return rows.map((r) => ({ section: r.section, count: r._count._all }));
  }

  /** Return flashcards: due review items first, topped up with undrilled entries. */
  async flashcards(limit = 20): Promise<unknown> {
    const due = await this.prisma.reviewItem.findMany({
      where: { itemType: 'vocab', dueAt: { lte: new Date() } },
      orderBy: { dueAt: 'asc' },
      take: limit,
    });
    const ids = due.map((d) => d.itemId);
    if (ids.length < limit) {
      const extra = await this.prisma.vocabEntry.findMany({
        where: ids.length ? { id: { notIn: ids } } : {},
        take: limit - ids.length,
      });
      ids.push(...extra.map((e) => e.id));
    }
    const entries = await this.prisma.vocabEntry.findMany({ where: { id: { in: ids } } });
    const byId = new Map(entries.map((e) => [e.id, e]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
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
