import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MemoryHealthIndicator } from '@nestjs/terminus';
import { getOptionsToken } from '@nestjs/throttler';
// supertest is an `export =` CommonJS module and esModuleInterop is off, so a default import would
// compile to an undefined `.default` at runtime.
import request = require('supertest');

// AppModule validates the env when it is imported, so these must be set before that import runs.
process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
process.env.DIRECT_URL = 'postgresql://localhost:5432/test';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GenerateService } from '../src/modules/generate/generate.service';

const dataDelegates = {
  readingItem: { count: jest.fn(), findMany: jest.fn() },
  listeningItem: { count: jest.fn(), findMany: jest.fn() },
  writingTask: { count: jest.fn(), findMany: jest.fn() },
  vocabEntry: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  reviewItem: { findMany: jest.fn() },
  topicStat: { findMany: jest.fn() },
  examSession: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  answer: { findMany: jest.fn() },
};

const mockPrismaService = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
  onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockResolvedValue(true),
  ...dataDelegates,
};

const mockGenerateService = {
  reading: jest.fn(),
  writing: jest.fn(),
  listening: jest.fn(),
};

/**
 * Puts every data delegate back to "an empty database". The mock is module-level state shared by
 * all tests, so a call or stubbed result left over from one test would otherwise satisfy or break
 * the next one.
 */
function resetPrismaMock(): void {
  for (const delegate of Object.values(dataDelegates)) {
    for (const [method, fn] of Object.entries(delegate) as [string, jest.Mock][]) {
      fn.mockReset();
      if (method === 'count') fn.mockResolvedValue(0);
      else if (method === 'findMany' || method === 'groupBy') fn.mockResolvedValue([]);
      else fn.mockResolvedValue(null);
    }
  }
}

/** Every `where.language` the given Prisma mocks were queried with, deduplicated. */
function languagesQueried(...fns: jest.Mock[]): unknown[] {
  const seen = fns.flatMap((fn) =>
    fn.mock.calls.map((args: unknown[]) => (args[0] as { where?: { language?: unknown } })?.where?.language),
  );
  return [...new Set(seen)];
}

const neverCalled = (fns: jest.Mock[]): boolean => fns.every((fn) => fn.mock.calls.length === 0);

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      // The suite sends every request from one address, and the production limit of 100 per minute
      // would start answering 429 once the language matrix below grows past it.
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60000, limit: 100000 }])
      // The real heap check reads this Jest worker's heap, which ts-jest can push past the
      // liveness threshold and make the probe flap.
      .overrideProvider(MemoryHealthIndicator)
      .useValue({ checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }) })
      // Generation would call Claude and a TTS API; these tests only cover the request validation in front of it.
      .overrideProvider(GenerateService)
      .useValue(mockGenerateService)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    resetPrismaMock();
    for (const fn of Object.values(mockGenerateService)) {
      fn.mockReset();
      fn.mockResolvedValue({ ok: true });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('when GET /api/v1/test/ping is called, returns 200 with { message: "pong" }', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test/ping')
      .expect(200)
      .expect({ message: 'pong' });
  });

  it('when GET /api/v1/health/liveness is called, returns 200', () => {
    return request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);
  });

  it('when POST /api/v1/sessions has an unknown mode, the validation pipe rejects it with 400', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sessions')
      .send({ mode: 'speedrun' })
      .expect(400);
  });

  it('when POST /api/v1/sessions/:id/answers has a non-uuid itemId, the validation pipe rejects it with 400', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sessions/00000000-0000-0000-0000-000000000000/answers')
      .send({ itemType: 'reading', itemId: 'not-a-uuid', chosenLabel: 'A' })
      .expect(400);
  });

  describe('lang query parameter on read routes', () => {
    // Each route lists the Prisma calls that carry its language filter, so one matrix proves both
    // that a bad value is refused before any query and that a good one reaches the database.
    const routes: { path: string; queried: () => jest.Mock[] }[] = [
      {
        path: '/api/v1/content/reading',
        queried: () => [dataDelegates.readingItem.count, dataDelegates.readingItem.findMany],
      },
      {
        path: '/api/v1/content/listening',
        queried: () => [dataDelegates.listeningItem.count, dataDelegates.listeningItem.findMany],
      },
      {
        path: '/api/v1/content/writing',
        queried: () => [dataDelegates.writingTask.count, dataDelegates.writingTask.findMany],
      },
      {
        path: '/api/v1/vocab',
        queried: () => [dataDelegates.vocabEntry.count, dataDelegates.vocabEntry.findMany],
      },
      { path: '/api/v1/vocab/sections', queried: () => [dataDelegates.vocabEntry.groupBy] },
      { path: '/api/v1/vocab/flashcards', queried: () => [dataDelegates.vocabEntry.findMany] },
      {
        path: '/api/v1/progress',
        queried: () => [
          dataDelegates.topicStat.findMany,
          dataDelegates.examSession.findMany,
          dataDelegates.readingItem.count,
          dataDelegates.listeningItem.count,
          dataDelegates.writingTask.count,
          dataDelegates.vocabEntry.count,
        ],
      },
      { path: '/api/v1/sessions', queried: () => [dataDelegates.examSession.findMany] },
    ];

    // Express 5 parses queries with node:querystring, so only a repeated key reaches the controller
    // as an array. Bracket syntax (`lang[]=es`) becomes a key literally named `lang[]` and never
    // reaches the `lang` handler at all; the array and object shapes are covered in language.spec.ts.
    const rejectedQueries = [
      ['an unsupported language', 'lang=fr'],
      ['an empty value', 'lang='],
      ['an upper-case code', 'lang=ES'],
      ['a repeated parameter', 'lang=es&lang=en'],
      ['a repeated parameter in the other order', 'lang=en&lang=es'],
    ];

    describe.each(routes)('GET $path', ({ path, queried }) => {
      it.each(rejectedQueries)(
        'when lang is %s (?%s), returns 400 and never queries the database',
        async (_label, query) => {
          const res = await request(app.getHttpServer()).get(`${path}?${query}`);

          expect(res.status).toBe(400);
          expect(neverCalled(queried())).toBe(true);
        },
      );

      it('when lang=es, returns 200 and filters every query by es', async () => {
        await request(app.getHttpServer()).get(`${path}?lang=es`).expect(200);

        expect(languagesQueried(...queried())).toEqual(['es']);
      });

      it('when lang=en, returns 200 and filters every query by en', async () => {
        await request(app.getHttpServer()).get(`${path}?lang=en`).expect(200);

        expect(languagesQueried(...queried())).toEqual(['en']);
      });

      it('when lang is absent, returns 200 and filters every query by en', async () => {
        await request(app.getHttpServer()).get(path).expect(200);

        expect(languagesQueried(...queried())).toEqual(['en']);
      });
    });

    it('when GET /api/v1/vocab?lang=xx, returns 400', () => {
      return request(app.getHttpServer()).get('/api/v1/vocab?lang=xx').expect(400);
    });

    it('when GET /api/v1/sessions?lang=zz, returns 400', () => {
      return request(app.getHttpServer()).get('/api/v1/sessions?lang=zz').expect(400);
    });

    it('when GET /api/v1/vocab combines lang with other filters, the language still applies alongside them', async () => {
      await request(app.getHttpServer()).get('/api/v1/vocab?lang=es&section=Verbos&q=correr').expect(200);

      expect(dataDelegates.vocabEntry.findMany.mock.calls[0][0].where).toMatchObject({
        language: 'es',
        section: 'Verbos',
      });
    });
  });

  describe('POST /api/v1/sessions language', () => {
    const bankQueries = () => [
      dataDelegates.readingItem.findMany,
      dataDelegates.listeningItem.findMany,
      dataDelegates.writingTask.findMany,
    ];

    it.each([
      ['an unsupported language', 'fr'],
      ['an upper-case code', 'ES'],
      ['an empty string', ''],
      ['null', null],
      ['an array', ['es']],
      ['a number', 1],
    ])('when the body language is %s, returns 400 and creates nothing', async (_label, language) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .send({ mode: 'practice', language });

      expect(res.status).toBe(400);
      expect(neverCalled([...bankQueries(), dataDelegates.examSession.create])).toBe(true);
    });

    it('when language is es and every bank is empty, returns 422 naming Spanish and creates no session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .send({ mode: 'practice', language: 'es' });

      expect(res.status).toBe(422);
      expect(res.body.message).toBe('no Spanish items available for this request');
      expect(languagesQueried(...bankQueries())).toEqual(['es']);
      expect(dataDelegates.examSession.create).not.toHaveBeenCalled();
    });

    it('when language is absent and every bank is empty, assembles from English and returns 422 naming English', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/sessions').send({ mode: 'practice' });

      expect(res.status).toBe(422);
      expect(res.body.message).toBe('no English items available for this request');
      expect(languagesQueried(...bankQueries())).toEqual(['en']);
    });

    it('when language is es and the Spanish bank has an item, creates the session in es from es items only', async () => {
      dataDelegates.readingItem.findMany.mockResolvedValue([
        {
          id: 'r-es',
          language: 'es',
          level: 3,
          topic: 'logística',
          passage: 'texto',
          question: 'pregunta',
          options: [{ label: 'A', text: 'a', rationale: 'clave' }],
        },
      ]);
      dataDelegates.examSession.create.mockResolvedValue({ id: 'session-1' });
      dataDelegates.examSession.findUnique.mockResolvedValue({
        id: 'session-1',
        mode: 'practice',
        skill: 'reading',
        language: 'es',
        status: 'in_progress',
        config: { items: { reading: ['r-es'], listening: [], writing: [] } },
        result: null,
        startedAt: new Date(0),
        completedAt: null,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .send({ mode: 'practice', skill: 'reading', language: 'es' });

      expect(res.status).toBe(201);
      expect(res.body.language).toBe('es');
      // The first findMany is the pick; the second only reloads the chosen ids for the response.
      expect(dataDelegates.readingItem.findMany.mock.calls[0][0].where.language).toBe('es');
      expect(dataDelegates.examSession.create.mock.calls[0][0].data).toMatchObject({
        language: 'es',
        config: { language: 'es' },
      });
    });
  });

  describe('POST /api/v1/generate language', () => {
    // Only the request validation is exercised: the service is stubbed, so a rejected body must
    // never reach it and an accepted one must hand it the language as its last argument.
    const routes = [
      { path: 'reading', service: mockGenerateService.reading, body: { level: 3, topic: 'abc' } },
      { path: 'writing', service: mockGenerateService.writing, body: { taskType: 'essay' } },
      { path: 'listening', service: mockGenerateService.listening, body: { topic: 'abc', genre: 'dialogue' } },
    ];

    describe.each(routes)('POST /api/v1/generate/$path', ({ path, service, body }) => {
      it.each([
        ['an unsupported language', 'fr'],
        ['an upper-case code', 'ES'],
        ['an empty string', ''],
        ['null', null],
      ])('when language is %s, returns 400 and never calls the service', async (_label, language) => {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/generate/${path}`)
          .send({ ...body, language });

        expect(res.status).toBe(400);
        expect(service).not.toHaveBeenCalled();
      });

      it('when language is absent, passes validation and generates in en', async () => {
        await request(app.getHttpServer()).post(`/api/v1/generate/${path}`).send(body).expect(201);

        expect(service).toHaveBeenCalledTimes(1);
        expect(service.mock.calls[0].at(-1)).toBe('en');
      });

      it('when language is es, passes validation and generates in es', async () => {
        await request(app.getHttpServer())
          .post(`/api/v1/generate/${path}`)
          .send({ ...body, language: 'es' })
          .expect(201);

        expect(service).toHaveBeenCalledTimes(1);
        expect(service.mock.calls[0].at(-1)).toBe('es');
      });
    });
  });
});
