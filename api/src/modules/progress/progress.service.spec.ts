import { Test, TestingModule } from '@nestjs/testing';
import { ProgressService } from './progress.service';
import { PrismaService } from '../../prisma/prisma.service';

type Row = { id: string; language: string };
type Where = { language?: string; id?: { in?: string[] } };

const bank = {
  reading: [
    { id: 'r-en', language: 'en' },
    { id: 'r-es', language: 'es' },
  ],
  listening: [
    { id: 'l-en', language: 'en' },
    { id: 'l-es', language: 'es' },
  ],
  vocab: [
    { id: 'v-en-1', language: 'en' },
    { id: 'v-en-2', language: 'en' },
    { id: 'v-es', language: 'es' },
  ],
} satisfies Record<string, Row[]>;

/** Mimics `findMany({ where: { id: { in }, language }, select: { id: true } })` over an in-memory table. */
const fakeFindMany =
  (table: Row[]) =>
  ({ where = {} }: { where?: Where }): Promise<{ id: string }[]> =>
    Promise.resolve(
      table
        .filter(
          (r) =>
            (where.language === undefined || r.language === where.language) &&
            (where.id?.in === undefined || where.id.in.includes(r.id)),
        )
        .map((r) => ({ id: r.id })),
    );

const mockPrisma = {
  topicStat: { findMany: jest.fn() },
  examSession: { findMany: jest.fn() },
  reviewItem: { findMany: jest.fn() },
  readingItem: { findMany: jest.fn(), count: jest.fn() },
  listeningItem: { findMany: jest.fn(), count: jest.fn() },
  writingTask: { count: jest.fn() },
  vocabEntry: { findMany: jest.fn(), count: jest.fn() },
};

interface Dashboard {
  weakAreas: unknown[];
  reviewDue: { itemType: string; count: number }[];
  recentSessions: unknown[];
  totalCompleted: number;
  bank: Record<string, number>;
}

describe('ProgressService', () => {
  let service: ProgressService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.topicStat.findMany.mockResolvedValue([]);
    mockPrisma.examSession.findMany.mockResolvedValue([]);
    mockPrisma.reviewItem.findMany.mockResolvedValue([]);
    mockPrisma.readingItem.findMany.mockImplementation(fakeFindMany(bank.reading));
    mockPrisma.listeningItem.findMany.mockImplementation(fakeFindMany(bank.listening));
    mockPrisma.vocabEntry.findMany.mockImplementation(fakeFindMany(bank.vocab));
    mockPrisma.readingItem.count.mockResolvedValue(0);
    mockPrisma.listeningItem.count.mockResolvedValue(0);
    mockPrisma.writingTask.count.mockResolvedValue(0);
    mockPrisma.vocabEntry.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProgressService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ProgressService);
  });

  const dashboard = async (language: 'en' | 'es') => (await service.dashboard(language)) as Dashboard;

  it('when called for a language, reads weak-area stats for that language only', async () => {
    await service.dashboard('es');

    expect(mockPrisma.topicStat.findMany).toHaveBeenCalledWith({ where: { language: 'es', seen: { gt: 0 } } });
  });

  it('when called for a language, lists completed sessions of that language only', async () => {
    await service.dashboard('es');

    expect(mockPrisma.examSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { language: 'es', status: 'completed' }, take: 20 }),
    );
  });

  it('when called for a language, counts each question bank in that language', async () => {
    mockPrisma.readingItem.count.mockResolvedValue(3);
    mockPrisma.listeningItem.count.mockResolvedValue(4);
    mockPrisma.writingTask.count.mockResolvedValue(5);
    mockPrisma.vocabEntry.count.mockResolvedValue(6);

    const result = await dashboard('es');

    for (const model of ['readingItem', 'listeningItem', 'writingTask', 'vocabEntry'] as const) {
      expect(mockPrisma[model].count).toHaveBeenCalledWith({ where: { language: 'es' } });
    }
    expect(result.bank).toEqual({ reading: 3, listening: 4, writing: 5, vocab: 6 });
  });

  it('when stats exist, ranks the weakest topics first with a rounded accuracy', async () => {
    mockPrisma.topicStat.findMany.mockResolvedValue([
      { skill: 'reading', level: 2, topic: 'logistics', seen: 4, correct: 4 },
      { skill: 'listening', level: 3, topic: 'medical', seen: 3, correct: 1 },
    ]);

    const result = await dashboard('en');

    expect(result.weakAreas).toEqual([
      { skill: 'listening', level: 3, topic: 'medical', seen: 3, accuracy: 33 },
      { skill: 'reading', level: 2, topic: 'logistics', seen: 4, accuracy: 100 },
    ]);
  });

  describe('reviewDue', () => {
    const due = [
      { itemType: 'reading', itemId: 'r-en' },
      { itemType: 'reading', itemId: 'r-es' },
      { itemType: 'listening', itemId: 'l-en' },
      { itemType: 'vocab', itemId: 'v-en-1' },
      { itemType: 'vocab', itemId: 'v-en-2' },
      { itemType: 'vocab', itemId: 'v-es' },
    ];

    beforeEach(() => {
      mockPrisma.reviewItem.findMany.mockResolvedValue(due);
    });

    it('when due reviews span both languages, counts only the requested language', async () => {
      const es = await dashboard('es');
      const en = await dashboard('en');

      expect(es.reviewDue).toEqual([
        { itemType: 'reading', count: 1 },
        { itemType: 'vocab', count: 1 },
      ]);
      expect(en.reviewDue).toEqual([
        { itemType: 'reading', count: 1 },
        { itemType: 'listening', count: 1 },
        { itemType: 'vocab', count: 2 },
      ]);
    });

    it('when due reviews are read, asks for the due rows and resolves their ids per language', async () => {
      await service.dashboard('es');

      expect(mockPrisma.reviewItem.findMany).toHaveBeenCalledWith({
        where: { dueAt: { lte: expect.any(Date) } },
        select: { itemType: true, itemId: true },
      });
      expect(mockPrisma.readingItem.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['r-en', 'r-es'] }, language: 'es' },
        select: { id: true },
      });
      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['v-en-1', 'v-en-2', 'v-es'] }, language: 'es' },
        select: { id: true },
      });
    });

    it('when several questions of one item are due, counts each review row', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue([
        { itemType: 'listening', itemId: 'l-es' },
        { itemType: 'listening', itemId: 'l-es' },
      ]);

      const result = await dashboard('es');

      expect(result.reviewDue).toEqual([{ itemType: 'listening', count: 2 }]);
    });

    it('when nothing is due, skips the per-table lookups and reports no reviews', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue([]);

      const result = await dashboard('es');

      expect(result.reviewDue).toEqual([]);
      expect(mockPrisma.readingItem.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.listeningItem.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.vocabEntry.findMany).not.toHaveBeenCalled();
    });

    it('when a due review has an unknown item type, leaves it out instead of guessing its language', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue([{ itemType: 'writing', itemId: 'w-1' }]);

      const result = await dashboard('es');

      expect(result.reviewDue).toEqual([]);
    });
  });
});
