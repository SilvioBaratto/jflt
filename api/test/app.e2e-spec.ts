import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MemoryHealthIndicator } from '@nestjs/terminus';
// supertest is an `export =` CommonJS module and esModuleInterop is off, so a default import would
// compile to an undefined `.default` at runtime.
import request = require('supertest');

// AppModule validates the env when it is imported, so these must be set before that import runs.
process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
process.env.DIRECT_URL = 'postgresql://localhost:5432/test';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const mockPrismaService = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
  onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockResolvedValue(true),
};

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      // The real heap check reads this Jest worker's heap, which ts-jest can push past the
      // liveness threshold and make the probe flap.
      .overrideProvider(MemoryHealthIndicator)
      .useValue({ checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }) })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
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
});
