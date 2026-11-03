import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeAgentService } from '../../claude/claude-agent.service';
import { TtsService } from './tts.service';
import type { Language } from '../../common/language';

/** On-demand generation of fresh, references-grounded items that grow the question bank. */
@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeAgentService,
    private readonly tts: TtsService,
  ) {}

  /**
   * Generate, blind-verify, and store one reading item.
   *
   * @param level - Target STANAG level, 1-4.
   * @param topic - Topic angle for the passage.
   * @param language - Language the item is written, verified and stored in.
   * @returns The stored row's id, level and topic, and whether blind verification passed.
   */
  async reading(level: number, topic: string, language: Language): Promise<unknown> {
    // The undefined keeps the verifier's default sample count while still passing the language.
    let item = await this.claude.generateReadingItem(level, topic, language);
    let verification = await this.claude.verifyReadingItem(item, undefined, language);
    if (!verification.passed) {
      item = await this.claude.generateReadingItem(level, topic, language);
      verification = await this.claude.verifyReadingItem(item, undefined, language);
    }
    const row = await this.prisma.readingItem.create({
      data: {
        level: item.stanagLevel,
        topic: item.topic,
        passage: item.passage,
        question: item.question,
        options: item.options,
        correctLabel: item.correctLabel,
        source: 'generated',
        language,
      },
    });
    return { id: row.id, level: row.level, topic: row.topic, verified: verification.passed };
  }

  /**
   * Generate and store one writing task.
   *
   * @param taskType - guided_note, formal_correspondence, or essay.
   * @param language - Language the task and its model answers are written and stored in.
   * @returns The stored row's id, task type and title.
   */
  async writing(
    taskType: 'guided_note' | 'formal_correspondence' | 'essay',
    language: Language,
  ): Promise<unknown> {
    const task = await this.claude.generateWritingTask(taskType, language);
    const row = await this.prisma.writingTask.create({
      data: {
        taskType: task.taskType,
        stanagLevel: task.stanagLevel,
        title: task.title,
        instructions: task.instructions,
        wordCountMin: task.wordCountMin,
        wordCountMax: task.wordCountMax,
        rubric: task.rubric,
        options: task.options,
        source: 'generated',
        language,
      },
    });
    return { id: row.id, taskType: row.taskType, title: row.title };
  }

  /**
   * Generate a listening conversation, render its audio (if TTS is available), and store it.
   *
   * @param topic - Topic angle for the conversation.
   * @param genre - Spoken genre (interview, panel, debate, ...).
   * @param speakers - Number of distinct speakers (2-3).
   * @param language - Language the conversation is spoken and stored in.
   * @returns The stored row's id and topic, its audio path (null without TTS), and `hasKey`.
   */
  async listening(
    topic: string,
    genre: string,
    speakers: number,
    language: Language,
  ): Promise<unknown> {
    const conv = await this.claude.generateListeningConversation(topic, genre, speakers, language);
    const voices: Record<string, string> = {};
    for (const s of conv.speakers) voices[s.id] = s.voice;
    const id = randomUUID();
    let audioPath: string | null = null;
    if (this.tts.available) {
      try {
        audioPath = await this.tts.renderConversation(id, conv.lines, voices);
      } catch (e) {
        this.logger.error(`TTS failed: ${(e as Error).message}`);
      }
    }
    const row = await this.prisma.listeningItem.create({
      data: {
        level: conv.stanagLevel,
        topic: conv.topic,
        conversationType: conv.conversationType,
        setting: conv.setting,
        voices,
        speakers: conv.speakers,
        lines: conv.lines,
        questions: conv.questions,
        audioPath,
        hasKey: true,
        source: 'generated',
        language,
      },
    });
    return { id: row.id, topic: row.topic, audio: audioPath, hasKey: true };
  }
}
