import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateService } from './generate.service';
import { TtsService } from './tts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeAgentService } from '../../claude/claude-agent.service';
import type {
  GeneratedListeningItem,
  GeneratedReadingItem,
  GeneratedWritingTask,
} from '../../claude/schemas';
import type { Language } from '../../common/language';

const LANGUAGES: Language[] = ['en', 'es'];

const readingItem = (topic: string): GeneratedReadingItem => ({
  stanagLevel: 3,
  cefr: 'C1',
  topic,
  passage: `passage ${topic}`,
  question: 'question',
  options: (['A', 'B', 'C', 'D'] as const).map((label) => ({ label, text: label, rationale: 'r' })),
  correctLabel: 'A',
});

const writingTask: GeneratedWritingTask = {
  taskType: 'essay',
  stanagLevel: 3,
  title: 'title',
  instructions: 'instructions',
  wordCountMin: 250,
  wordCountMax: 500,
  rubric: [{ dimension: 'd', descriptor: 'x' }],
  options: [{ key: 'A', label: 'l', prompt: 'p', modelAnswer: 'm' }],
};

const conversation: GeneratedListeningItem = {
  stanagLevel: 3,
  topic: 'energy',
  conversationType: 'panel',
  setting: 'a studio',
  speakers: [
    { id: 'A', role: 'host', voice: 'alloy' },
    { id: 'B', role: 'guest', voice: 'onyx' },
    { id: 'C', role: 'critic', voice: 'nova' },
  ],
  lines: Array.from({ length: 6 }, (_, i) => ({ speaker: ['A', 'B', 'C'][i % 3], text: `line ${i}` })),
  questions: Array.from({ length: 3 }, () => ({
    question: 'q',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correctLabel: 'A' as const,
    rationale: 'r',
  })),
};

const mockPrisma = {
  readingItem: { create: jest.fn() },
  writingTask: { create: jest.fn() },
  listeningItem: { create: jest.fn() },
};

const mockClaude = {
  generateReadingItem: jest.fn(),
  verifyReadingItem: jest.fn(),
  generateWritingTask: jest.fn(),
  generateListeningConversation: jest.fn(),
};

// The real TtsService calls the OpenAI API and writes an MP3; the stub reproduces only its path contract.
const mockTts = {
  available: true,
  renderConversation: jest.fn(),
};

const pass = { passed: true, chosenLabels: ['A'], defensibleLabels: ['A'], warnings: [] };
const fail = { passed: false, chosenLabels: ['B'], defensibleLabels: ['A', 'B'], warnings: ['ambiguous'] };

describe('GenerateService', () => {
  let service: GenerateService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockTts.available = true;
    mockTts.renderConversation.mockImplementation((id: string) =>
      Promise.resolve(`/static/listening/gen-${id}.mp3`),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClaudeAgentService, useValue: mockClaude },
        { provide: TtsService, useValue: mockTts },
      ],
    }).compile();
    service = module.get(GenerateService);
  });

  describe('reading()', () => {
    beforeEach(() => {
      mockClaude.verifyReadingItem.mockResolvedValue(pass);
      mockPrisma.readingItem.create.mockResolvedValue({ id: 'row-1', level: 3, topic: 'logistics' });
    });

    it.each(LANGUAGES)('generates, verifies and stores the item in %s', async (language) => {
      const item = readingItem('logistics');
      mockClaude.generateReadingItem.mockResolvedValue(item);

      const result = await service.reading(3, 'topic', language);

      expect(mockClaude.generateReadingItem).toHaveBeenCalledTimes(1);
      expect(mockClaude.generateReadingItem).toHaveBeenCalledWith(3, 'topic', language);
      expect(mockClaude.verifyReadingItem).toHaveBeenCalledTimes(1);
      expect(mockClaude.verifyReadingItem).toHaveBeenCalledWith(item, undefined, language);
      expect(mockPrisma.readingItem.create).toHaveBeenCalledWith({
        data: {
          level: 3,
          topic: 'logistics',
          passage: 'passage logistics',
          question: 'question',
          options: item.options,
          correctLabel: 'A',
          source: 'generated',
          language,
        },
      });
      expect(result).toEqual({ id: 'row-1', level: 3, topic: 'logistics', verified: true });
    });

    it('regenerates and re-verifies in the same language, then stores the retried item', async () => {
      const first = readingItem('first');
      const second = readingItem('second');
      mockClaude.generateReadingItem.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      mockClaude.verifyReadingItem.mockResolvedValueOnce(fail).mockResolvedValueOnce(pass);

      const result = await service.reading(3, 'topic', 'es');

      expect(mockClaude.generateReadingItem.mock.calls).toEqual([
        [3, 'topic', 'es'],
        [3, 'topic', 'es'],
      ]);
      expect(mockClaude.verifyReadingItem.mock.calls).toEqual([
        [first, undefined, 'es'],
        [second, undefined, 'es'],
      ]);
      expect(mockPrisma.readingItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ topic: 'second', passage: 'passage second', language: 'es' }),
      });
      expect(result).toMatchObject({ verified: true });
    });

    it('still stores the item with its language when the retry fails verification too', async () => {
      mockClaude.generateReadingItem.mockResolvedValue(readingItem('weak'));
      mockClaude.verifyReadingItem.mockResolvedValue(fail);

      const result = await service.reading(3, 'topic', 'es');

      expect(mockPrisma.readingItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ language: 'es' }),
      });
      expect(result).toMatchObject({ verified: false });
    });
  });

  describe('writing()', () => {
    beforeEach(() => {
      mockClaude.generateWritingTask.mockResolvedValue(writingTask);
      mockPrisma.writingTask.create.mockResolvedValue({ id: 'row-2', taskType: 'essay', title: 'title' });
    });

    it.each(LANGUAGES)('generates and stores the task in %s', async (language) => {
      const result = await service.writing('essay', language);

      expect(mockClaude.generateWritingTask).toHaveBeenCalledWith('essay', language);
      expect(mockPrisma.writingTask.create).toHaveBeenCalledWith({
        data: {
          taskType: 'essay',
          stanagLevel: 3,
          title: 'title',
          instructions: 'instructions',
          wordCountMin: 250,
          wordCountMax: 500,
          rubric: writingTask.rubric,
          options: writingTask.options,
          source: 'generated',
          language,
        },
      });
      expect(result).toEqual({ id: 'row-2', taskType: 'essay', title: 'title' });
    });
  });

  describe('listening()', () => {
    const voices = { A: 'alloy', B: 'onyx', C: 'nova' };

    beforeEach(() => {
      mockClaude.generateListeningConversation.mockResolvedValue(conversation);
      mockPrisma.listeningItem.create.mockImplementation(({ data }: { data: { topic: string } }) =>
        Promise.resolve({ id: 'row-3', topic: data.topic }),
      );
    });

    it.each(LANGUAGES)('generates the %s conversation and stores it with its audio', async (language) => {
      const result = (await service.listening('energy', 'panel', 3, language)) as { audio: string };

      expect(mockClaude.generateListeningConversation).toHaveBeenCalledWith('energy', 'panel', 3, language);
      const [id, lines, rendered] = mockTts.renderConversation.mock.calls[0] as [string, unknown, unknown];
      expect(lines).toBe(conversation.lines);
      expect(rendered).toEqual(voices);
      const audioPath = `/static/listening/gen-${id}.mp3`;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(mockPrisma.listeningItem.create).toHaveBeenCalledWith({
        data: {
          level: 3,
          topic: 'energy',
          conversationType: 'panel',
          setting: 'a studio',
          voices,
          speakers: conversation.speakers,
          lines: conversation.lines,
          questions: conversation.questions,
          audioPath,
          hasKey: true,
          source: 'generated',
          language,
        },
      });
      expect(result).toEqual({ id: 'row-3', topic: 'energy', audio: audioPath, hasKey: true });
    });

    it('stores the language without audio when TTS is not configured', async () => {
      mockTts.available = false;

      const result = await service.listening('energy', 'panel', 3, 'es');

      expect(mockTts.renderConversation).not.toHaveBeenCalled();
      expect(mockPrisma.listeningItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ audioPath: null, language: 'es' }),
      });
      expect(result).toMatchObject({ audio: null });
    });

    it('stores the language without audio when rendering fails', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockTts.renderConversation.mockRejectedValue(new Error('quota'));

      const result = await service.listening('energy', 'panel', 3, 'es');

      expect(logged).toHaveBeenCalledWith('TTS failed: quota');
      expect(mockPrisma.listeningItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ audioPath: null, language: 'es' }),
      });
      expect(result).toMatchObject({ audio: null });
      logged.mockRestore();
    });
  });
});
