import { Test, TestingModule } from '@nestjs/testing';
import { VocabService } from './vocab.service';
import { PrismaService } from '../../prisma/prisma.service';

type Entry = { id: string; language: string; termEn: string };
type VocabWhere = { language?: string; id?: { in?: string[]; notIn?: string[] } };

const entries: Entry[] = [
  { id: 'en-1', language: 'en', termEn: 'ally' },
  { id: 'en-2', language: 'en', termEn: 'border' },
  { id: 'es-1', language: 'es', termEn: 'aliado' },
  { id: 'es-2', language: 'es', termEn: 'frontera' },
  { id: 'es-3', language: 'es', termEn: 'refuerzo' },
];

/** Applies the subset of Prisma's `where` that the vocab service uses to the in-memory bank. */
function fakeVocabFindMany({ where = {}, take }: { where?: VocabWhere; take?: number }): Promise<Entry[]> {
  const rows = entries.filter(
    (e) =>
      (where.language === undefined || e.language === where.language) &&
      (where.id?.in === undefined || where.id.in.includes(e.id)) &&
      (where.id?.notIn === undefined || !where.id.notIn.includes(e.id)),
  );
  return Promise.resolve(take === undefined ? rows : rows.slice(0, take));
}

const mockPrisma = {
  vocabEntry: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  reviewItem: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
};

describe('VocabService', () => {
  let service: VocabService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.vocabEntry.count.mockResolvedValue(0);
    mockPrisma.vocabEntry.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [VocabService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(VocabService);
  });

  describe('list()', () => {
    it('when only the language is given, filters count and rows by that language', async () => {
      await service.list({ language: 'es' });

      expect(mockPrisma.vocabEntry.count).toHaveBeenCalledWith({ where: { language: 'es' } });
      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { language: 'es' } }),
      );
    });

    it('when part, section and q are given, combines them with the language in one where clause', async () => {
      await service.list({ language: 'es', part: 'A', section: 'Military', q: 'ali' });

      const expected = {
        language: 'es',
        part: 'A',
        section: 'Military',
        OR: [
          { termEn: { contains: 'ali', mode: 'insensitive' } },
          { translationIt: { contains: 'ali', mode: 'insensitive' } },
        ],
      };
      expect(mockPrisma.vocabEntry.count).toHaveBeenCalledWith({ where: expected });
      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expected }));
    });

    it('when no limit is given, pages 50 rows from offset zero', async () => {
      await service.list({ language: 'en' });

      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }));
    });

    it('when the limit exceeds 500, caps the page size and applies the offset', async () => {
      await service.list({ language: 'en', limit: 9_999, offset: 20 });

      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500, skip: 20 }));
    });

    it('when rows exist, returns the total next to the items', async () => {
      mockPrisma.vocabEntry.count.mockResolvedValue(7);
      mockPrisma.vocabEntry.findMany.mockResolvedValue([entries[2]]);

      await expect(service.list({ language: 'es' })).resolves.toEqual({ total: 7, items: [entries[2]] });
    });
  });

  describe('sections()', () => {
    it('when called, groups only the requested language by section', async () => {
      mockPrisma.vocabEntry.groupBy.mockResolvedValue([]);

      await service.sections('es');

      expect(mockPrisma.vocabEntry.groupBy).toHaveBeenCalledWith({
        by: ['section'],
        where: { language: 'es' },
        _count: { _all: true },
        orderBy: { section: 'asc' },
      });
    });

    it('when sections exist, maps each to its entry count', async () => {
      mockPrisma.vocabEntry.groupBy.mockResolvedValue([
        { section: 'Air', _count: { _all: 4 } },
        { section: 'Land', _count: { _all: 9 } },
      ]);

      await expect(service.sections('en')).resolves.toEqual([
        { section: 'Air', count: 4 },
        { section: 'Land', count: 9 },
      ]);
    });
  });

  describe('flashcards()', () => {
    const dueRows = (...itemIds: string[]) => itemIds.map((itemId) => ({ itemId }));

    beforeEach(() => {
      mockPrisma.vocabEntry.findMany.mockImplementation(fakeVocabFindMany);
    });

    it('when due cards exist in both languages, resolves them through the requested language only', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue(dueRows('en-1', 'es-2'));

      await service.flashcards('es', 2);

      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['en-1', 'es-2'] }, language: 'es' },
      });
    });

    it('when due cards exist in both languages, returns only entries of the requested language', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue(dueRows('en-1', 'es-2'));

      const cards = (await service.flashcards('es', 2)) as Entry[];

      expect(cards.map((c) => c.id)).toEqual(['es-2', 'es-1']);
      expect(cards.every((c) => c.language === 'es')).toBe(true);
    });

    it('when an older English card is due, still serves the due Spanish card first', async () => {
      mockPrisma.reviewItem.findMany.mockImplementation(({ take }: { take?: number }) => {
        const queue = dueRows('en-1', 'en-2', 'es-3');
        return Promise.resolve(take === undefined ? queue : queue.slice(0, take));
      });

      const cards = (await service.flashcards('es', 2)) as Entry[];

      expect(cards.map((c) => c.id)).toEqual(['es-3', 'es-1']);
    });

    it('when more cards are due than the limit, keeps the most overdue ones', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue(dueRows('es-3', 'es-1', 'es-2'));

      const cards = (await service.flashcards('es', 2)) as Entry[];

      expect(cards.map((c) => c.id)).toEqual(['es-3', 'es-1']);
    });

    it('when fewer cards are due than the limit, tops up with undrilled entries of the same language', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue(dueRows('es-2'));

      const cards = (await service.flashcards('es', 3)) as Entry[];

      expect(mockPrisma.vocabEntry.findMany).toHaveBeenLastCalledWith({
        where: { language: 'es', id: { notIn: ['es-2'] } },
        take: 2,
      });
      expect(cards.map((c) => c.id)).toEqual(['es-2', 'es-1', 'es-3']);
    });

    it('when nothing is due, serves entries of the requested language without querying by id', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue([]);

      const cards = (await service.flashcards('es', 2)) as Entry[];

      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith({ where: { language: 'es' }, take: 2 });
      expect(cards.map((c) => c.id)).toEqual(['es-1', 'es-2']);
    });

    it('when no limit is given, serves 20 cards', async () => {
      mockPrisma.reviewItem.findMany.mockResolvedValue([]);

      await service.flashcards('en');

      expect(mockPrisma.vocabEntry.findMany).toHaveBeenCalledWith({ where: { language: 'en' }, take: 20 });
    });
  });
});
