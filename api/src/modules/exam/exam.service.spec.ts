import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExamService } from './exam.service';
import { CreateSessionSchema } from './dto/exam.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeAgentService } from '../../claude/claude-agent.service';
import { type Language } from '../../common/language';

type Row = { id: string; language: string; level?: number };
type Where = { language?: string; level?: { in: number[] }; id?: { in: string[] } };
type SessionRow = Record<string, unknown> & { id: string };

const readingRow = (id: string, language: Language, topic: string) => ({
  id,
  language,
  level: 3,
  topic,
  passage: 'passage',
  question: 'question',
  options: [
    { label: 'A', text: 'a', rationale: 'key' },
    { label: 'B', text: 'b', rationale: 'distractor' },
  ],
  correctLabel: 'A',
});

const listeningRow = (id: string, language: Language, topic: string) => ({
  id,
  language,
  level: 3,
  topic,
  conversationType: 'dialogue',
  setting: 'office',
  voices: null,
  speakers: null,
  lines: [],
  audioPath: `/static/listening/${id}.mp3`,
  questions: [{ question: 'q', options: { A: 'a', B: 'b' }, correctLabel: 'A', rationale: 'key' }],
});

const writingRow = (id: string, language: Language) => ({
  id,
  language,
  taskType: 'essay',
  stanagLevel: 3,
  title: 'title',
  instructions: 'instructions',
  wordCountMin: 200,
  wordCountMax: 300,
  rubric: [{ dimension: 'task', descriptor: 'descriptor' }],
  options: [{ key: 'main', label: 'Main', prompt: `prompt ${id}`, modelAnswer: 'model answer' }],
});

const fullBank = {
  reading: [readingRow('r-en', 'en', 'logistics'), readingRow('r-es', 'es', 'logística')],
  listening: [listeningRow('l-en', 'en', 'briefing'), listeningRow('l-es', 'es', 'informe')],
  writing: [writingRow('w-en', 'en'), writingRow('w-es', 'es')],
};
type Bank = typeof fullBank;

/** Mimics the `where` filters ExamService uses (language, level set, id set) over an in-memory table. */
const fakeFindMany =
  <T extends Row>(table: T[]) =>
  ({ where = {} }: { where?: Where } = {}): Promise<T[]> =>
    Promise.resolve(
      table.filter(
        (r) =>
          (where.language === undefined || r.language === where.language) &&
          (where.level?.in === undefined || (r.level !== undefined && where.level.in.includes(r.level))) &&
          (where.id?.in === undefined || where.id.in.includes(r.id)),
      ),
    );

const fakeFindUnique =
  <T extends Row>(table: T[]) =>
  ({ where }: { where: { id: string } }): Promise<T | null> =>
    Promise.resolve(table.find((r) => r.id === where.id) ?? null);

const mockPrisma = {
  readingItem: { findMany: jest.fn(), findUnique: jest.fn() },
  listeningItem: { findMany: jest.fn(), findUnique: jest.fn() },
  writingTask: { findMany: jest.fn(), findUnique: jest.fn() },
  topicStat: { findMany: jest.fn(), upsert: jest.fn() },
  reviewItem: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  examSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  answer: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};

const mockClaude = { gradeWriting: jest.fn() };

const sessions = new Map<string, SessionRow>();

function useBank(bank: Bank): void {
  mockPrisma.readingItem.findMany.mockImplementation(fakeFindMany(bank.reading));
  mockPrisma.readingItem.findUnique.mockImplementation(fakeFindUnique(bank.reading));
  mockPrisma.listeningItem.findMany.mockImplementation(fakeFindMany(bank.listening));
  mockPrisma.listeningItem.findUnique.mockImplementation(fakeFindUnique(bank.listening));
  mockPrisma.writingTask.findMany.mockImplementation(fakeFindMany(bank.writing));
  mockPrisma.writingTask.findUnique.mockImplementation(fakeFindUnique(bank.writing));
}

function storeSession(language: Language, items: { reading?: string[]; listening?: string[]; writing?: string[] }) {
  const row: SessionRow = {
    id: 'session-1',
    mode: 'practice',
    skill: null,
    status: 'in_progress',
    language,
    config: { items: { reading: [], listening: [], writing: [], ...items } },
    result: null,
    startedAt: new Date(0),
    completedAt: null,
  };
  sessions.set(row.id, row);
  return row;
}

const createdData = (): Record<string, unknown> & { config: Record<string, unknown> } =>
  mockPrisma.examSession.create.mock.calls[0][0].data;

describe('ExamService', () => {
  let service: ExamService;

  beforeEach(async () => {
    jest.resetAllMocks();
    sessions.clear();
    useBank(fullBank);
    mockPrisma.topicStat.findMany.mockResolvedValue([]);
    mockPrisma.topicStat.upsert.mockResolvedValue({});
    mockPrisma.reviewItem.findUnique.mockResolvedValue(null);
    mockPrisma.reviewItem.upsert.mockResolvedValue({});
    mockPrisma.examSession.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const row: SessionRow = { id: 'session-1', result: null, startedAt: new Date(0), completedAt: null, ...data };
      sessions.set(row.id, row);
      return Promise.resolve(row);
    });
    mockPrisma.examSession.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(sessions.get(where.id) ?? null),
    );
    mockPrisma.examSession.findMany.mockResolvedValue([]);
    mockPrisma.examSession.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.examSession.update.mockResolvedValue({});
    mockPrisma.answer.findMany.mockResolvedValue([]);
    mockPrisma.answer.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.answer.create.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
    mockClaude.gradeWriting.mockResolvedValue({
      overallScore: 3,
      estimatedLevel: '3',
      dimensions: [],
      strengths: [],
      improvements: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClaudeAgentService, useValue: mockClaude },
      ],
    }).compile();
    service = module.get(ExamService);
  });

  describe('createSession()', () => {
    it.each(['en', 'es'] as const)(
      'when creating a full exam in %s, queries every skill only in that language',
      async (language) => {
        await service.createSession({ mode: 'exam', language });

        expect(mockPrisma.readingItem.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { language, level: { in: [3, 4] } } }),
        );
        expect(mockPrisma.listeningItem.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { language } }),
        );
        expect(mockPrisma.writingTask.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { language } }),
        );
      },
    );

    it.each(['en', 'es'] as const)(
      'when creating a full exam in %s, never mixes in items of the other language',
      async (language) => {
        await service.createSession({ mode: 'exam', language });

        expect(createdData().config.items).toEqual({
          reading: [`r-${language}`],
          listening: [`l-${language}`],
          writing: [`w-${language}`],
        });
      },
    );

    it('when creating a session, stores the language on the row and in its config and returns it', async () => {
      const session = (await service.createSession({ mode: 'practice', skill: 'reading', language: 'es' })) as {
        language: string;
      };

      expect(createdData().language).toBe('es');
      expect(createdData().config.language).toBe('es');
      expect(session.language).toBe('es');
    });

    it('when the body omits language, the schema defaults it to en and the session is English', async () => {
      const dto = CreateSessionSchema.parse({ mode: 'practice', skill: 'reading' });

      await service.createSession(dto);

      expect(dto.language).toBe('en');
      expect(createdData().language).toBe('en');
      expect(createdData().config.items).toEqual({ reading: ['r-en'], listening: [], writing: [] });
    });

    it.each(['fr', 'ES', ''])('when the body language is %j, the schema rejects it', (language) => {
      expect(CreateSessionSchema.safeParse({ mode: 'practice', language }).success).toBe(false);
    });

    it('when adaptive, weights reading candidates with the topic stats of the session language only', async () => {
      await service.createSession({ mode: 'practice', skill: 'reading', language: 'es', adaptive: true });

      expect(mockPrisma.topicStat.findMany).toHaveBeenCalledWith({ where: { skill: 'reading', language: 'es' } });
    });

    it('when adaptive and the language has no topic stats yet, still assembles its reading items', async () => {
      await service.createSession({ mode: 'practice', skill: 'reading', language: 'es', adaptive: true });

      expect(createdData().config.items).toEqual({ reading: ['r-es'], listening: [], writing: [] });
    });

    it('when the language has no item for any requested skill, rejects with 422 and creates no session', async () => {
      useBank({
        reading: fullBank.reading.filter((r) => r.language === 'en'),
        listening: fullBank.listening.filter((r) => r.language === 'en'),
        writing: fullBank.writing.filter((r) => r.language === 'en'),
      });

      const attempt = service.createSession({ mode: 'exam', language: 'es' });

      await expect(attempt).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(attempt).rejects.toThrow('no es items available for this request');
      expect(mockPrisma.examSession.create).not.toHaveBeenCalled();
    });

    it('when the requested levels have no item in the language, rejects with 422', async () => {
      await expect(
        service.createSession({ mode: 'practice', skill: 'reading', levels: [1], language: 'en' }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(mockPrisma.examSession.create).not.toHaveBeenCalled();
    });

    it('when only some skills have items in the language, creates the session with the skills that do', async () => {
      useBank({
        reading: fullBank.reading,
        listening: fullBank.listening.filter((r) => r.language === 'en'),
        writing: fullBank.writing.filter((r) => r.language === 'en'),
      });

      await service.createSession({ mode: 'exam', language: 'es' });

      expect(createdData().config.items).toEqual({ reading: ['r-es'], listening: [], writing: [] });
    });
  });

  describe('listSessions()', () => {
    it.each(['en', 'es'] as const)(
      'when listing %s sessions, filters by that language, newest first',
      async (language) => {
        await service.listSessions(language);

        expect(mockPrisma.examSession.findMany).toHaveBeenCalledWith({
          where: { language },
          orderBy: { startedAt: 'desc' },
          take: 100,
        });
      },
    );
  });

  describe('getSession()', () => {
    it('when fetching a session, returns its language', async () => {
      storeSession('es', {});

      const session = (await service.getSession('session-1')) as { language: string };

      expect(session.language).toBe('es');
    });
  });

  describe('submitAnswer()', () => {
    it.each(['en', 'es'] as const)(
      'when grading a writing answer in a %s session, asks Claude to grade in that language',
      async (language) => {
        storeSession(language, { writing: [`w-${language}`] });

        await service.submitAnswer('session-1', {
          itemType: 'writing',
          itemId: `w-${language}`,
          questionIndex: 0,
          responseText: 'my essay',
        });

        expect(mockClaude.gradeWriting).toHaveBeenCalledWith(
          expect.objectContaining({ language, prompt: `prompt w-${language}`, response: 'my essay' }),
        );
      },
    );
  });

  describe('completeSession()', () => {
    const skills = [
      ['reading', 'readingItem'],
      ['listening', 'listeningItem'],
    ] as const;

    describe.each(skills)('with a %s answer', (skill, model) => {
      it.each(['en', 'es'] as const)(
        'when the item is %s, updates the topic stat under that language',
        async (language) => {
          const item = fullBank[skill].find((r) => r.language === language)!;
          storeSession(language, skill === 'reading' ? { reading: [item.id] } : { listening: [item.id] });
          mockPrisma.answer.findMany.mockResolvedValue([
            { itemType: skill, itemId: item.id, questionIndex: 0, isCorrect: true, score: null, feedback: null },
          ]);

          await service.completeSession('session-1');

          expect(mockPrisma[model].findUnique).toHaveBeenCalledWith({
            where: { id: item.id },
            select: expect.objectContaining({ language: true }),
          });
          expect(mockPrisma.topicStat.upsert).toHaveBeenCalledWith({
            where: { language_skill_level_topic: { language, skill, level: 3, topic: item.topic } },
            create: { language, skill, level: 3, topic: item.topic, seen: 1, correct: 1 },
            update: { seen: { increment: 1 }, correct: { increment: 1 } },
          });
        },
      );
    });

    it('when the session only has a writing answer, leaves the topic stats untouched', async () => {
      storeSession('es', { writing: ['w-es'] });
      mockPrisma.answer.findMany.mockResolvedValue([
        {
          itemType: 'writing',
          itemId: 'w-es',
          questionIndex: 0,
          isCorrect: null,
          score: 3,
          feedback: { estimatedLevel: '3' },
        },
      ]);

      await service.completeSession('session-1');

      expect(mockPrisma.topicStat.upsert).not.toHaveBeenCalled();
    });
  });
});
