import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeAgentService } from '../../claude/claude-agent.service';
import { CreateSessionDto, SubmitAnswerDto } from './dto/exam.dto';

type ReadingOption = { label: string; text: string; rationale: string };
type ListeningQuestion = {
  question: string;
  options: Record<string, string>;
  correctLabel: string | null;
  rationale: string | null;
};
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
      writing: counts.writing ? await this.pickWriting(counts.writing) : [],
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
    const cfg = session.config as { items: { reading: string[]; listening: string[]; writing: string[] } };
    const [reading, listening, writing, answers] = await Promise.all([
      this.loadReading(cfg.items.reading),
      this.loadListening(cfg.items.listening),
      this.loadWriting(cfg.items.writing),
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

  /** Score and store one answer; returns feedback (MCQ key + rationale, or writing grade + model answer). */
  async submitAnswer(sessionId: string, dto: SubmitAnswerDto): Promise<unknown> {
    const session = await this.prisma.examSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`session '${sessionId}' not found`);

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
      return { itemType: 'listening', correct, correctLabel: q.correctLabel, keyRationale: q.rationale };
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
    await this.record(sessionId, dto, { score: grade.overallScore, feedback: grade });
    return { itemType: 'writing', grade, modelAnswer: chosen?.modelAnswer ?? null };
  }

  /** Finalize a session: compute the SLP-style result, update topic stats, and schedule reviews. */
  async completeSession(id: string): Promise<unknown> {
    const session = await this.prisma.examSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`session '${id}' not found`);
    const answers = await this.prisma.answer.findMany({ where: { sessionId: id } });

    const readingAns = answers.filter((a) => a.itemType === 'reading' && a.isCorrect !== null);
    const listeningAns = answers.filter((a) => a.itemType === 'listening' && a.isCorrect !== null);
    const writingAns = answers.filter((a) => a.itemType === 'writing' && a.score !== null);

    const result = {
      reading: await this.scoreMcq('reading', readingAns),
      listening: await this.scoreMcq('listening', listeningAns),
      writing: this.scoreWriting(writingAns.map((a) => a.score as number)),
    };

    await this.updateTopicStats(answers);
    await this.updateReviewQueue(answers);

    await this.prisma.examSession.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date(), result: result as object },
    });
    return result;
  }

  // ---------------- assembly ----------------

  private async pickReading(levels: number[], count: number, adaptive: boolean): Promise<string[]> {
    const candidates = await this.prisma.readingItem.findMany({
      where: { level: { in: levels } },
      select: { id: true, level: true, topic: true },
    });
    if (!candidates.length) return [];
    let weighted = candidates.map((c) => ({ id: c.id, w: 1 }));
    if (adaptive) {
      const stats = await this.prisma.topicStat.findMany({ where: { skill: 'reading' } });
      const byKey = new Map(stats.map((s) => [`${s.level}|${s.topic}`, s]));
      weighted = candidates.map((c) => {
        const s = byKey.get(`${c.level}|${c.topic}`);
        const acc = s && s.seen > 0 ? s.correct / s.seen : 0.5;
        return { id: c.id, w: 1 - acc + 0.15 };
      });
    }
    return this.weightedSample(weighted, count);
  }

  private async pickListening(count: number): Promise<string[]> {
    const items = await this.prisma.listeningItem.findMany({ select: { id: true } });
    return this.weightedSample(
      items.map((i) => ({ id: i.id, w: 1 })),
      count,
    );
  }

  private async pickWriting(count: number): Promise<string[]> {
    const order = ['guided_note', 'formal_correspondence', 'essay'];
    const tasks = await this.prisma.writingTask.findMany({ select: { id: true, taskType: true } });
    tasks.sort((a, b) => order.indexOf(a.taskType) - order.indexOf(b.taskType));
    return tasks.slice(0, count).map((t) => t.id);
  }

  private weightedSample(pool: { id: string; w: number }[], count: number): string[] {
    const items = [...pool];
    const picked: string[] = [];
    while (picked.length < count && items.length) {
      const total = items.reduce((s, x) => s + Math.max(x.w, 0.0001), 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < items.length; idx++) {
        r -= Math.max(items[idx]!.w, 0.0001);
        if (r <= 0) break;
      }
      idx = Math.min(idx, items.length - 1);
      picked.push(items[idx]!.id);
      items.splice(idx, 1);
    }
    return picked;
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
    await this.prisma.answer.deleteMany({
      where: { sessionId, itemId: dto.itemId, questionIndex: dto.questionIndex },
    });
    await this.prisma.answer.create({
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
  }

  private async scoreMcq(
    skill: 'reading' | 'listening',
    answers: { itemId: string; isCorrect: boolean | null }[],
  ): Promise<unknown> {
    if (!answers.length) return null;
    const correct = answers.filter((a) => a.isCorrect).length;
    const total = answers.length;
    const pct = Math.round((100 * correct) / total);
    let estimatedLevel = 1;
    if (skill === 'reading') {
      const rows = await this.prisma.readingItem.findMany({
        where: { id: { in: answers.map((a) => a.itemId) } },
        select: { id: true, level: true },
      });
      const lvl = new Map(rows.map((r) => [r.id, r.level]));
      const byLevel = new Map<number, { c: number; t: number }>();
      for (const a of answers) {
        const l = lvl.get(a.itemId) ?? 1;
        const e = byLevel.get(l) ?? { c: 0, t: 0 };
        e.t += 1;
        if (a.isCorrect) e.c += 1;
        byLevel.set(l, e);
      }
      for (const l of [4, 3, 2, 1]) {
        const e = byLevel.get(l);
        if (e && e.c / e.t >= 0.6) {
          estimatedLevel = l;
          break;
        }
      }
    } else {
      estimatedLevel = pct >= 60 ? 3 : 2;
    }
    return { correct, total, pct, estimatedLevel };
  }

  private scoreWriting(scores: number[]): unknown {
    if (!scores.length) return null;
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
    const level = avg >= 3.5 ? '3+' : avg >= 3 ? '3' : avg >= 2.5 ? '2+' : avg >= 2 ? '2' : avg >= 1 ? '1' : '0';
    return { avgScore: Math.round(avg * 100) / 100, estimatedLevel: level, count: scores.length };
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
