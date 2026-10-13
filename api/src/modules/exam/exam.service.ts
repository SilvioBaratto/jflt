import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeAgentService } from '../../claude/claude-agent.service';
import { CreateSessionDto, SubmitAnswerDto } from './dto/exam.dto';
import { capTaskLevel, scoreMcq, scoreWriting, slpProfile, type McqOutcome } from './scoring';
import { pickWritingTasks, stratifiedSample, weightedSample } from './selection';

type ReadingOption = { label: string; text: string; rationale: string };
type ListeningQuestion = {
  question: string;
  options: Record<string, string>;
  correctLabel: string | null;
  rationale: string | null;
  optionRationales?: Record<string, string> | null;
};
type SessionItems = { reading: string[]; listening: string[]; writing: string[] };
type WritingOption = { key: string; label: string; prompt: string; modelAnswer: string };

const DEFAULT_COUNTS = {
  practice: { reading: 5, listening: 3, writing: 1 },
  exam: { reading: 10, listening: 6, writing: 3 },
};

/**
 * Core study/exam engine: assembles sessions from the question bank (weighted toward weak areas),
 * scores answers (reading/listening MCQs directly, writing via Claude), and on completion computes
 * an SLP-style result, updates per-topic stats, and schedules missed items for spaced repetition.
 */
@Injectable()
export class ExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeAgentService,
  ) {}

  /** Create a session, assemble its items per mode/skill/levels/counts, and return it (keys stripped). */
  async createSession(dto: CreateSessionDto): Promise<unknown> {
    const skills = dto.skill ? [dto.skill] : (['reading', 'listening', 'writing'] as const);
    const levels = dto.levels?.length ? dto.levels : [3, 4];
    const base = DEFAULT_COUNTS[dto.mode];
    const counts = {
      reading: dto.counts?.reading ?? (skills.includes('reading') ? base.reading : 0),
      listening: dto.counts?.listening ?? (skills.includes('listening') ? base.listening : 0),
      writing: dto.counts?.writing ?? (skills.includes('writing') ? base.writing : 0),
    };

    const items = {
      reading: counts.reading ? await this.pickReading(levels, counts.reading, !!dto.adaptive) : [],
      listening: counts.listening ? await this.pickListening(counts.listening) : [],
      writing: counts.writing ? await this.pickWriting(levels, counts.writing) : [],
    };

    const session = await this.prisma.examSession.create({
      data: {
        mode: dto.mode,
        skill: dto.skill ?? null,
        status: 'in_progress',
        config: { levels, counts, adaptive: !!dto.adaptive, items },
      },
    });
    return this.getSession(session.id);
  }

  /** Fetch a session with its assembled items (answer keys stripped) and the answers submitted so far. */
  async getSession(id: string): Promise<unknown> {
    const session = await this.prisma.examSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`session '${id}' not found`);
    const items = this.itemsOf(session);
    const [reading, listening, writing, answers] = await Promise.all([
      this.loadReading(items.reading),
      this.loadListening(items.listening),
      this.loadWriting(items.writing),
      this.prisma.answer.findMany({ where: { sessionId: id } }),
    ]);
    return {
      id: session.id,
      mode: session.mode,
      skill: session.skill,
      status: session.status,
      config: session.config,
      result: session.result,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      items: { reading, listening, writing },
      answers,
    };
  }

  /** List sessions most-recent first (exam history). */
  async listSessions(): Promise<unknown> {
    return this.prisma.examSession.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
  }

  /**
   * Score and store one answer; returns feedback (MCQ key + rationale, or writing grade + model answer).
   *
   * @throws NotFoundException when the session or item does not exist.
   * @throws ConflictException when the session is already completed, since its result is final.
   * @throws BadRequestException when the item is not part of this session or the answer is incomplete.
   */
  async submitAnswer(sessionId: string, dto: SubmitAnswerDto): Promise<unknown> {
    const session = await this.prisma.examSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`session '${sessionId}' not found`);
    if (session.status === 'completed') throw new ConflictException('session already completed');
    if (!this.itemsOf(session)[dto.itemType].includes(dto.itemId)) {
      throw new BadRequestException(`${dto.itemType} item '${dto.itemId}' is not part of this session`);
    }

    if (dto.itemType === 'reading') {
      const item = await this.prisma.readingItem.findUnique({ where: { id: dto.itemId } });
      if (!item) throw new NotFoundException('reading item not found');
      if (!dto.chosenLabel) throw new BadRequestException('chosenLabel required');
      const opts = item.options as unknown as ReadingOption[];
      const correct = dto.chosenLabel === item.correctLabel;
      await this.record(sessionId, dto, { isCorrect: correct });
      return {
        itemType: 'reading',
        correct,
        correctLabel: item.correctLabel,
        keyRationale: opts.find((o) => o.label === item.correctLabel)?.rationale ?? null,
        chosenRationale: opts.find((o) => o.label === dto.chosenLabel)?.rationale ?? null,
      };
    }

    if (dto.itemType === 'listening') {
      const item = await this.prisma.listeningItem.findUnique({ where: { id: dto.itemId } });
      if (!item) throw new NotFoundException('listening item not found');
      const q = (item.questions as unknown as ListeningQuestion[])[dto.questionIndex];
      if (!q) throw new BadRequestException('questionIndex out of range');
      if (!q.correctLabel) {
        await this.record(sessionId, dto, { isCorrect: null });
        return { itemType: 'listening', ungraded: true };
      }
      if (!dto.chosenLabel) throw new BadRequestException('chosenLabel required');
      const correct = dto.chosenLabel === q.correctLabel;
      await this.record(sessionId, dto, { isCorrect: correct });
      return {
        itemType: 'listening',
        correct,
        correctLabel: q.correctLabel,
        keyRationale: q.rationale,
        chosenRationale: q.optionRationales?.[dto.chosenLabel] ?? null,
      };
    }

    // writing
    const task = await this.prisma.writingTask.findUnique({ where: { id: dto.itemId } });
    if (!task) throw new NotFoundException('writing task not found');
    if (!dto.responseText?.trim()) throw new BadRequestException('responseText required');
    const options = task.options as unknown as WritingOption[];
    const chosen = options.find((o) => o.key === (dto.optionKey ?? 'main')) ?? options[0];
    const grade = await this.claude.gradeWriting({
      taskType: task.taskType,
      stanagLevel: task.stanagLevel,
      prompt: chosen?.prompt?.trim() ? chosen.prompt : task.instructions,
      rubric: task.rubric as unknown as { dimension: string; descriptor: string }[],
      response: dto.responseText,
      wordCountMin: task.wordCountMin,
      wordCountMax: task.wordCountMax,
    });
    grade.estimatedLevel = capTaskLevel(grade.estimatedLevel, task.stanagLevel, grade.overallScore);
    await this.record(sessionId, dto, { score: grade.overallScore, feedback: grade });
    return { itemType: 'writing', grade, modelAnswer: chosen?.modelAnswer ?? null };
  }

  /**
   * Finalize a session: compute the per-skill and SLP result, update topic stats, and schedule reviews.
   *
   * Idempotent: completing an already-completed session returns the stored result without touching
   * the adaptive stats again.
   */
  async completeSession(id: string): Promise<unknown> {
    const session = await this.prisma.examSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`session '${id}' not found`);
    if (session.status === 'completed') return session.result;

    const items = this.itemsOf(session);
    const done = await this.prisma.$transaction(async (tx) => {
      // Claiming the row first takes its lock, and record() takes the same lock: an answer write
      // already holding it commits before the answers are read below, and one arriving later waits
      // and then finds the session completed, so no answer can slip in after the snapshot.
      const { count } = await tx.examSession.updateMany({
        where: { id, status: { not: 'completed' } },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (count === 0) return null;

      const answers = await tx.answer.findMany({ where: { sessionId: id } });
      const readingRows = await tx.readingItem.findMany({
        where: { id: { in: items.reading } },
        select: { id: true, level: true },
      });
      const listeningRows = await tx.listeningItem.findMany({
        where: { id: { in: items.listening } },
        select: { id: true, level: true, questions: true },
      });
      const writingRows = await tx.writingTask.findMany({
        where: { id: { in: items.writing } },
        select: { id: true, stanagLevel: true },
      });

      const answerFor = (itemType: string, itemId: string, questionIndex = 0) =>
        answers.find((a) => a.itemType === itemType && a.itemId === itemId && a.questionIndex === questionIndex);
      const outcome = (level: number, isCorrect: boolean | null | undefined): McqOutcome => ({
        level,
        answered: isCorrect != null,
        correct: isCorrect === true,
      });

      const readingOutcomes = readingRows.map((r) => outcome(r.level, answerFor('reading', r.id)?.isCorrect));
      const listeningOutcomes = listeningRows.flatMap((r) =>
        (r.questions as unknown as ListeningQuestion[]).flatMap((q, qi) =>
          q.correctLabel ? [outcome(r.level, answerFor('listening', r.id, qi)?.isCorrect)] : [],
        ),
      );
      const writingOutcomes = writingRows.flatMap((t) => {
        const a = answerFor('writing', t.id);
        if (a?.score == null) return [];
        const level = (a.feedback as { estimatedLevel?: unknown } | null)?.estimatedLevel;
        return [{ score: a.score, level: typeof level === 'string' ? level : null, taskLevel: t.stanagLevel }];
      });

      const skills = {
        reading: scoreMcq(readingOutcomes),
        listening: scoreMcq(listeningOutcomes),
        writing: scoreWriting(writingOutcomes),
      };
      const result = { ...skills, ...slpProfile(skills) };
      await tx.examSession.update({ where: { id }, data: { result: result as object } });
      return { result, answers };
    });

    if (!done) {
      const stored = await this.prisma.examSession.findUnique({ where: { id }, select: { result: true } });
      return stored?.result ?? null;
    }
    await this.updateTopicStats(done.answers);
    await this.updateReviewQueue(done.answers);
    return done.result;
  }

  // ---------------- assembly ----------------

  private async pickReading(levels: number[], count: number, adaptive: boolean): Promise<string[]> {
    const candidates = await this.prisma.readingItem.findMany({
      where: { level: { in: levels } },
      select: { id: true, level: true, topic: true },
    });
    if (!candidates.length) return [];
    let weighted = candidates.map((c) => ({ id: c.id, level: c.level, w: 1 }));
    if (adaptive) {
      const stats = await this.prisma.topicStat.findMany({ where: { skill: 'reading' } });
      const byKey = new Map(stats.map((s) => [`${s.level}|${s.topic}`, s]));
      weighted = candidates.map((c) => {
        const s = byKey.get(`${c.level}|${c.topic}`);
        const acc = s && s.seen > 0 ? s.correct / s.seen : 0.5;
        return { id: c.id, level: c.level, w: 1 - acc + 0.15 };
      });
    }
    return stratifiedSample(weighted, count);
  }

  private async pickListening(count: number): Promise<string[]> {
    const items = await this.prisma.listeningItem.findMany({ select: { id: true } });
    return weightedSample(
      items.map((i) => ({ id: i.id, w: 1 })),
      count,
    );
  }

  private async pickWriting(levels: number[], count: number): Promise<string[]> {
    const tasks = await this.prisma.writingTask.findMany({
      select: { id: true, taskType: true, stanagLevel: true },
    });
    return pickWritingTasks(tasks, levels, count);
  }

  private itemsOf(session: { config: unknown }): SessionItems {
    const items = (session.config as { items?: Partial<SessionItems> } | null)?.items;
    return { reading: items?.reading ?? [], listening: items?.listening ?? [], writing: items?.writing ?? [] };
  }

  // ---------------- key-stripping loaders ----------------

  private async loadReading(ids: string[]): Promise<unknown[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.readingItem.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        level: r.level,
        topic: r.topic,
        passage: r.passage,
        question: r.question,
        options: (r.options as unknown as ReadingOption[]).map((o) => ({ label: o.label, text: o.text })),
      }));
  }

  private async loadListening(ids: string[]): Promise<unknown[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.listeningItem.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        level: r.level,
        topic: r.topic,
        conversationType: r.conversationType,
        setting: r.setting,
        voices: r.voices,
        speakers: r.speakers,
        lines: r.lines,
        audioPath: r.audioPath,
        questions: (r.questions as unknown as ListeningQuestion[]).map((q) => ({
          question: q.question,
          options: q.options,
        })),
      }));
  }

  private async loadWriting(ids: string[]): Promise<unknown[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.writingTask.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        taskType: r.taskType,
        stanagLevel: r.stanagLevel,
        title: r.title,
        instructions: r.instructions,
        wordCountMin: r.wordCountMin,
        wordCountMax: r.wordCountMax,
        rubric: r.rubric,
        options: (r.options as unknown as WritingOption[]).map((o) => ({
          key: o.key,
          label: o.label,
          prompt: o.prompt,
        })),
      }));
  }

  // ---------------- scoring & adaptive ----------------

  private async record(
    sessionId: string,
    dto: SubmitAnswerDto,
    fields: { isCorrect?: boolean | null; score?: number; feedback?: unknown },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // The no-op status write locks the session row (see completeSession), and re-checks the status
      // after a slow writing grade during which the session may have been completed.
      const { count } = await tx.examSession.updateMany({
        where: { id: sessionId, status: { not: 'completed' } },
        data: { status: 'in_progress' },
      });
      if (count === 0) throw new ConflictException('session already completed');
      await tx.answer.deleteMany({
        where: { sessionId, itemId: dto.itemId, questionIndex: dto.questionIndex },
      });
      await tx.answer.create({
        data: {
          sessionId,
          itemType: dto.itemType,
          itemId: dto.itemId,
          questionIndex: dto.questionIndex,
          chosenLabel: dto.chosenLabel ?? null,
          responseText: dto.responseText ?? null,
          isCorrect: fields.isCorrect ?? null,
          score: fields.score ?? null,
          feedback: (fields.feedback as object) ?? undefined,
        },
      });
    });
  }

  private async updateTopicStats(
    answers: { itemType: string; itemId: string; isCorrect: boolean | null }[],
  ): Promise<void> {
    const mcq = answers.filter(
      (a) => (a.itemType === 'reading' || a.itemType === 'listening') && a.isCorrect !== null,
    );
    for (const a of mcq) {
      const meta =
        a.itemType === 'reading'
          ? await this.prisma.readingItem.findUnique({
              where: { id: a.itemId },
              select: { level: true, topic: true },
            })
          : await this.prisma.listeningItem.findUnique({
              where: { id: a.itemId },
              select: { level: true, topic: true },
            });
      if (!meta) continue;
      await this.prisma.topicStat.upsert({
        where: { skill_level_topic: { skill: a.itemType, level: meta.level, topic: meta.topic } },
        create: { skill: a.itemType, level: meta.level, topic: meta.topic, seen: 1, correct: a.isCorrect ? 1 : 0 },
        update: { seen: { increment: 1 }, correct: { increment: a.isCorrect ? 1 : 0 } },
      });
    }
  }

  private async updateReviewQueue(
    answers: { itemType: string; itemId: string; questionIndex: number; isCorrect: boolean | null }[],
  ): Promise<void> {
    const mcq = answers.filter(
      (a) => (a.itemType === 'reading' || a.itemType === 'listening') && a.isCorrect !== null,
    );
    for (const a of mcq) {
      const where = {
        itemType_itemId_questionIndex: {
          itemType: a.itemType,
          itemId: a.itemId,
          questionIndex: a.questionIndex,
        },
      };
      const existing = await this.prisma.reviewItem.findUnique({ where });
      if (a.isCorrect) {
        if (existing) {
          const interval = Math.max(1, Math.round((existing.intervalDays || 1) * existing.ease));
          await this.prisma.reviewItem.update({
            where,
            data: {
              intervalDays: interval,
              reps: { increment: 1 },
              lastResult: true,
              dueAt: new Date(Date.now() + interval * 86400000),
            },
          });
        }
        // a correct first-time answer needs no review entry
      } else {
        await this.prisma.reviewItem.upsert({
          where,
          create: {
            itemType: a.itemType,
            itemId: a.itemId,
            questionIndex: a.questionIndex,
            intervalDays: 1,
            ease: 2.3,
            reps: 0,
            lapses: 1,
            lastResult: false,
            dueAt: new Date(Date.now() + 86400000),
          },
          update: {
            intervalDays: 1,
            ease: 2.3,
            lapses: { increment: 1 },
            lastResult: false,
            dueAt: new Date(Date.now() + 86400000),
          },
        });
      }
    }
  }
}
