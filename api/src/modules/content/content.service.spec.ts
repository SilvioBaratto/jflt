import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  readingItem: { findMany: jest.fn(), count: jest.fn() },
  listeningItem: { findMany: jest.fn(), count: jest.fn() },
  writingTask: { findMany: jest.fn(), count: jest.fn() },
};

describe('ContentService', () => {
  let service: ContentService;

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const model of Object.values(mockPrisma)) {
      model.count.mockResolvedValue(0);
      model.findMany.mockResolvedValue([]);
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ContentService);
  });

  const listings = [
    ['reading', 'readingItem'],
    ['listening', 'listeningItem'],
    ['writing', 'writingTask'],
  ] as const;

  describe.each(listings)('%s()', (method, model) => {
    it.each(['en', 'es'] as const)('when called for %s, counts and lists only that language', async (language) => {
      await service[method](language);

      expect(mockPrisma[model].count).toHaveBeenCalledWith({ where: { language } });
      expect(mockPrisma[model].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { language } }),
      );
    });

    it('when called, selects the language column so clients can tell the rows apart', async () => {
      await service[method]('es');

      const args = mockPrisma[model].findMany.mock.calls[0][0];
      expect(args.select.language).toBe(true);
    });

    it('when called with a limit above 500, caps the page size at 500 and applies the offset', async () => {
      await service[method]('es', 10_000, 40);

      expect(mockPrisma[model].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500, skip: 40 }),
      );
    });

    it('when called with a smaller limit, honours it', async () => {
      await service[method]('es', 25);

      expect(mockPrisma[model].findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 0 }));
    });
  });

  it('when listing reading items, returns the count next to the rows from the same language', async () => {
    mockPrisma.readingItem.count.mockResolvedValue(2);
    mockPrisma.readingItem.findMany.mockResolvedValue([{ id: 'r1', language: 'es' }]);

    await expect(service.reading('es')).resolves.toEqual({ total: 2, items: [{ id: 'r1', language: 'es' }] });
  });

  it('when listing listening items, reports the language and the number of questions per item', async () => {
    mockPrisma.listeningItem.count.mockResolvedValue(2);
    mockPrisma.listeningItem.findMany.mockResolvedValue([
      {
        id: 'l1',
        language: 'es',
        level: 2,
        topic: 'viajes',
        conversationType: 'dialogue',
        setting: 'estación',
        audioPath: '/static/listening/es/listening-01.mp3',
        questions: [{ q: 1 }, { q: 2 }, { q: 3 }],
        source: 'seed',
      },
      { id: 'l2', language: 'es', questions: null },
    ]);

    const result = (await service.listening('es')) as { total: number; items: Record<string, unknown>[] };

    expect(result.total).toBe(2);
    expect(result.items[0]).toEqual({
      id: 'l1',
      language: 'es',
      level: 2,
      topic: 'viajes',
      conversationType: 'dialogue',
      setting: 'estación',
      audioPath: '/static/listening/es/listening-01.mp3',
      questionCount: 3,
      source: 'seed',
    });
    expect(result.items[1].questionCount).toBe(0);
  });
});
