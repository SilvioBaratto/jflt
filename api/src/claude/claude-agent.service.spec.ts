import { ClaudeAgentService } from './claude-agent.service';
import { readingGrounding, writingGrounding } from './grounding';
import { LANGUAGE_PROFILE } from './language-profile';
import type { GeneratedReadingItem } from './schemas';
import type { Language } from '../common/language';

// The service shells out to the `claude` CLI; every test replaces this seam so nothing leaves the process.
interface Seam {
  runStructured(prompt: string, schema: Record<string, unknown>): Promise<unknown>;
}

const LANGUAGES: Language[] = ['en', 'es'];
const OTHER: Record<Language, Language> = { en: 'es', es: 'en' };

const options = (['A', 'B', 'C', 'D'] as const).map((label) => ({ label, text: label, rationale: 'r' }));
const readingItem = (stanagLevel: number): GeneratedReadingItem => ({
  stanagLevel,
  cefr: 'C1',
  topic: 't',
  passage: 'p',
  question: 'q',
  options,
  correctLabel: 'A',
});
const listeningItem = {
  stanagLevel: 3,
  topic: 't',
  conversationType: 'c',
  setting: 's',
  speakers: [
    { id: 'A', role: 'r', voice: 'alloy' },
    { id: 'B', role: 'r', voice: 'echo' },
  ],
  lines: Array.from({ length: 6 }, () => ({ speaker: 'A', text: 'x' })),
  questions: Array.from({ length: 3 }, () => ({
    question: 'q',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correctLabel: 'A',
    rationale: 'r',
  })),
};
const writingTask = {
  taskType: 'essay',
  stanagLevel: 3,
  title: 't',
  instructions: 'i',
  wordCountMin: 250,
  wordCountMax: 500,
  rubric: [{ dimension: 'd', descriptor: 'x' }],
  options: [{ key: 'A', label: 'l', prompt: 'p', modelAnswer: 'm' }],
};
const writingGrade = {
  dimensions: [{ dimension: 'd', score: 3, comment: 'c' }],
  overallScore: 3,
  estimatedLevel: '3',
  strengths: ['s'],
  improvements: ['i'],
};

describe('ClaudeAgentService prompts', () => {
  let service: ClaudeAgentService;
  let runStructured: jest.SpyInstance<Promise<unknown>, [string, Record<string, unknown>]>;

  const stub = (result: unknown): void => {
    runStructured.mockResolvedValue(result);
  };
  const prompts = (): string[] => runStructured.mock.calls.map(([prompt]) => prompt);
  const lastPrompt = (): string => prompts().at(-1) as string;
  // The grounding documents legitimately mention the other language, so only the instructions
  // around them are held to "names exactly one language".
  const instructionsOf = (prompt: string, grounding?: string): string =>
    grounding ? prompt.replace(grounding, '') : prompt;

  beforeEach(() => {
    service = new ClaudeAgentService();
    runStructured = jest.spyOn(service as unknown as Seam, 'runStructured');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateReadingItem', () => {
    it.each(LANGUAGES)('writes the %s item in that language, grounded in its own references', async (language) => {
      stub(readingItem(3));

      await service.generateReadingItem(3, 'x', language);

      const grounding = readingGrounding(language);
      expect(lastPrompt()).toContain(grounding);
      const instructions = instructionsOf(lastPrompt(), grounding);
      expect(instructions).toContain(`Write ONE original reading item in ${LANGUAGE_PROFILE[language].name}`);
      expect(instructions).not.toContain(LANGUAGE_PROFILE[OTHER[language]].name);
    });

    it('defaults to English', async () => {
      stub(readingItem(3));

      await service.generateReadingItem(3, 'x');

      expect(lastPrompt()).toContain(readingGrounding('en'));
      expect(lastPrompt()).toContain('Write ONE original reading item in English');
    });

    it('still rejects an item whose level differs from the one asked for', async () => {
      stub(readingItem(2));

      await expect(service.generateReadingItem(3, 'x', 'es')).rejects.toThrow('expected 3');
    });
  });

  describe('verifyReadingItem', () => {
    it.each(LANGUAGES)('has the blind %s solver test that language, on every sample', async (language) => {
      stub({ chosenLabel: 'A', defensibleLabels: ['A'], issues: [] });

      const verification = await service.verifyReadingItem(readingItem(3), 2, language);

      expect(verification.passed).toBe(true);
      expect(prompts()).toHaveLength(2);
      for (const prompt of prompts()) {
        expect(prompt).toContain(`${LANGUAGE_PROFILE[language].name} test-taker`);
        expect(prompt).not.toContain(LANGUAGE_PROFILE[OTHER[language]].name);
      }
    });

    it('defaults to English', async () => {
      stub({ chosenLabel: 'A', defensibleLabels: ['A'], issues: [] });

      await service.verifyReadingItem(readingItem(3), 1);

      expect(lastPrompt()).toContain('English test-taker');
    });
  });

  describe('generateListeningConversation', () => {
    it.each(LANGUAGES)('asks for a spoken %s conversation grounded in its own references', async (language) => {
      stub(listeningItem);

      await service.generateListeningConversation('topic', 'debate', 2, language);

      const grounding = readingGrounding(language);
      expect(lastPrompt()).toContain(grounding);
      const instructions = instructionsOf(lastPrompt(), grounding);
      expect(instructions).toContain(`spoken conversation in ${LANGUAGE_PROFILE[language].name}`);
      expect(instructions).not.toContain(LANGUAGE_PROFILE[OTHER[language]].name);
    });

    it('defaults to English with two speakers', async () => {
      stub(listeningItem);

      await service.generateListeningConversation('topic', 'debate');

      expect(lastPrompt()).toContain('spoken conversation in English');
      expect(lastPrompt()).toContain('Distinct speakers: 2');
    });
  });

  describe('solveListeningKeys', () => {
    const lines = [{ speaker: 'A', text: 'x' }];
    const questions = [{ question: 'q', options: { A: 'a', B: 'b', C: 'c', D: 'd' } }];

    it.each(LANGUAGES)('names %s as the language of the item and of the rationales', async (language) => {
      stub({ answers: [{ correctLabel: 'A', rationale: 'r' }] });

      await service.solveListeningKeys(lines, questions, language);

      const name = LANGUAGE_PROFILE[language].name;
      expect(lastPrompt()).toContain(`STANAG Level 3 ${name} listening item`);
      expect(lastPrompt()).toContain(`one-sentence rationale in ${name}`);
      expect(lastPrompt()).not.toContain(LANGUAGE_PROFILE[OTHER[language]].name);
    });

    it('defaults to English', async () => {
      stub({ answers: [{ correctLabel: 'A', rationale: 'r' }] });

      await service.solveListeningKeys(lines, questions);

      expect(lastPrompt()).toContain('STANAG Level 3 English listening item');
    });
  });

  describe('generateWritingTask', () => {
    it.each(LANGUAGES)('asks for a task written in %s, grounded in its own references', async (language) => {
      stub(writingTask);

      await service.generateWritingTask('essay', language);

      const grounding = writingGrounding(language);
      expect(lastPrompt()).toContain(grounding);
      const instructions = instructionsOf(lastPrompt(), grounding);
      expect(instructions).toContain(`written in ${LANGUAGE_PROFILE[language].name}`);
      expect(instructions).not.toContain(LANGUAGE_PROFILE[OTHER[language]].name);
    });

    it('defaults to English', async () => {
      stub(writingTask);

      await service.generateWritingTask('guided_note');

      expect(lastPrompt()).toContain(writingGrounding('en'));
      expect(lastPrompt()).toContain('written in English');
    });
  });

  describe('gradeWriting', () => {
    const params = {
      taskType: 'essay',
      stanagLevel: 3,
      prompt: 'p',
      rubric: [{ dimension: 'd', descriptor: 'x' }],
      response: 'r',
      wordCountMin: 250,
      wordCountMax: 500,
    };

    it.each(LANGUAGES)('grades the %s test and asks for the feedback in that language', async (language) => {
      stub(writingGrade);

      await service.gradeWriting({ ...params, language });

      const name = LANGUAGE_PROFILE[language].name;
      const grounding = writingGrounding(language);
      expect(lastPrompt()).toContain(grounding);
      const instructions = instructionsOf(lastPrompt(), grounding);
      expect(instructions).toContain(`examiner for the ${name} STANAG 6001 / JFLT writing test`);
      expect(instructions).toContain(
        `Write the feedback (dimension comments, strengths and improvements) in ${name}.`,
      );
      expect(instructions).not.toContain(LANGUAGE_PROFILE[OTHER[language]].name);
    });

    it('defaults to English', async () => {
      stub(writingGrade);

      await service.gradeWriting(params);

      expect(lastPrompt()).toContain('examiner for the English STANAG 6001 / JFLT writing test');
      expect(lastPrompt()).toContain('improvements) in English.');
    });
  });
});
