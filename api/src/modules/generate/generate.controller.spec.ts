import { Test, TestingModule } from '@nestjs/testing';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import {
  GenListeningSchema,
  GenReadingSchema,
  GenWritingSchema,
  type GenListeningDto,
  type GenReadingDto,
  type GenWritingDto,
} from './dto/generate.dto';

const mockGen = { reading: jest.fn(), writing: jest.fn(), listening: jest.fn() };

describe('GenerateController', () => {
  let controller: GenerateController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GenerateController],
      providers: [{ provide: GenerateService, useValue: mockGen }],
    }).compile();
    controller = module.get(GenerateController);
  });

  it('reading() generates in the body language', async () => {
    const dto: GenReadingDto = { level: 3, topic: 'logistics', language: 'es' };

    await controller.reading(dto);

    expect(mockGen.reading).toHaveBeenCalledWith(3, 'logistics', 'es');
  });

  it('writing() generates in the body language', async () => {
    const dto: GenWritingDto = { taskType: 'essay', language: 'es' };

    await controller.writing(dto);

    expect(mockGen.writing).toHaveBeenCalledWith('essay', 'es');
  });

  it('listening() generates in the body language', async () => {
    const dto: GenListeningDto = { topic: 'energy', genre: 'panel', speakers: 3, language: 'es' };

    await controller.listening(dto);

    expect(mockGen.listening).toHaveBeenCalledWith('energy', 'panel', 3, 'es');
  });

  it('listening() keeps two speakers by default next to the language', async () => {
    await controller.listening({ topic: 'energy', genre: 'panel', language: 'en' });

    expect(mockGen.listening).toHaveBeenCalledWith('energy', 'panel', 2, 'en');
  });
});

describe('generate body schemas', () => {
  const bodies = {
    reading: { schema: GenReadingSchema, body: { level: 3, topic: 'logistics' } },
    writing: { schema: GenWritingSchema, body: { taskType: 'essay' } },
    listening: { schema: GenListeningSchema, body: { topic: 'energy', genre: 'panel' } },
  } as const;

  describe.each(Object.entries(bodies))('%s', (_name, { schema, body }) => {
    it('defaults the language to en when absent', () => {
      expect(schema.parse(body)).toMatchObject({ language: 'en' });
    });

    it('accepts es', () => {
      expect(schema.parse({ ...body, language: 'es' })).toMatchObject({ language: 'es' });
    });

    it.each(['fr', '', 'ES', 'En', ' es'])('rejects language %j', (language) => {
      expect(schema.safeParse({ ...body, language }).success).toBe(false);
    });

    it('rejects a null language rather than treating it as absent', () => {
      expect(schema.safeParse({ ...body, language: null }).success).toBe(false);
    });
  });
});
