/** Share of a level's questions a candidate must get right to be credited with that level. */
export const MCQ_PASS_RATIO = 0.6;

/** A STANAG 6001 base or plus level label, "0" through "4+". */
export type StanagLevel = '0' | '0+' | '1' | '1+' | '2' | '2+' | '3' | '3+' | '4' | '4+';

/** One presented MCQ question: the STANAG level of its item and how the candidate did on it. */
export interface McqOutcome {
  level: number;
  answered: boolean;
  correct: boolean;
}

/** Aggregate result for one MCQ skill (reading or listening). */
export interface McqSkillResult {
  correct: number;
  answered: number;
  total: number;
  pct: number;
  estimatedLevel: string;
  byLevel: { level: number; correct: number; total: number }[];
}

/** One graded writing response, with the level of the task it answered. */
export interface WritingOutcome {
  score: number;
  level: string | null;
  taskLevel: number;
}

/** Aggregate writing result. */
export interface WritingSkillResult {
  avgScore: number;
  estimatedLevel: string;
  count: number;
}

/** Per-skill levels in STANAG SLP order (Listening, Speaking, Reading, Writing). */
export interface SlpProfile {
  listening: string | null;
  speaking: null;
  reading: string | null;
  writing: string | null;
}

/**
 * Parse a STANAG level label into a half-step number.
 *
 * @param label - A label such as "3", "2+", or "Level 3+"; only the first digit and an optional
 *   trailing plus are read.
 * @returns The level as a number where a plus adds 0.5 ("2+" is 2.5), or null when no digit is present.
 */
export function levelToNumber(label: string | null | undefined): number | null {
  const m = /([0-5])\s*(\+)?/.exec(label ?? '');
  if (!m) return null;
  return Number(m[1]) + (m[2] ? 0.5 : 0);
}

/**
 * Format a half-step number as a STANAG level label, rounding down to the nearest half level.
 *
 * @param n - A level number; values outside 0-4.5 are clamped.
 * @returns A label such as "3" or "2+".
 */
export function numberToLevel(n: number): StanagLevel {
  const clamped = Math.min(4.5, Math.max(0, n));
  const half = Math.floor(clamped * 2) / 2;
  return (Number.isInteger(half) ? String(half) : `${Math.floor(half)}+`) as StanagLevel;
}

/**
 * Bound a per-task writing level by what the task can evidence.
 *
 * A task written at Level N can show performance beyond N but not sustained performance at N+1,
 * so its rating is capped at N+.
 *
 * @param level - The grader's level label; when unparseable, `fallbackScore` is used instead.
 * @param taskLevel - The STANAG level the task targets.
 * @param fallbackScore - The 0-4 overall rubric score, read as a level when `level` is unusable.
 * @returns A level label no higher than `taskLevel`+.
 */
export function capTaskLevel(
  level: string | null | undefined,
  taskLevel: number,
  fallbackScore: number,
): StanagLevel {
  const n = levelToNumber(level) ?? fallbackScore;
  return numberToLevel(Math.min(n, taskLevel + 0.5));
}

/**
 * Score one MCQ skill as a multilevel test.
 *
 * Unanswered questions count as wrong, so skipping cannot raise the percentage. The estimated level
 * is the highest tested level reached by passing every tested level up to it in turn; failing the
 * lowest tested level yields "<N", since nothing below it was measured.
 *
 * @param outcomes - Every question presented in the session that has an answer key.
 * @returns The skill result, or null when no keyed question was presented.
 */
export function scoreMcq(outcomes: McqOutcome[]): McqSkillResult | null {
  if (!outcomes.length) return null;
  const byLevel = new Map<number, { correct: number; total: number }>();
  for (const o of outcomes) {
    const e = byLevel.get(o.level) ?? { correct: 0, total: 0 };
    e.total += 1;
    if (o.answered && o.correct) e.correct += 1;
    byLevel.set(o.level, e);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  let estimatedLevel = levels[0]! <= 1 ? '0' : `<${levels[0]}`;
  for (const l of levels) {
    const e = byLevel.get(l)!;
    if (e.correct / e.total < MCQ_PASS_RATIO) break;
    estimatedLevel = String(l);
  }

  const correct = outcomes.filter((o) => o.answered && o.correct).length;
  return {
    correct,
    answered: outcomes.filter((o) => o.answered).length,
    total: outcomes.length,
    pct: Math.round((100 * correct) / outcomes.length),
    estimatedLevel,
    byLevel: levels.map((level) => ({ level, ...byLevel.get(level)! })),
  };
}

/**
 * Score the writing paper from its graded responses.
 *
 * The level is the mean of the per-task levels (each capped by its task level), rounded down to a
 * half level, so the session summary agrees with the levels shown on each graded task.
 *
 * @param outcomes - One entry per graded response.
 * @returns The writing result, or null when nothing was graded.
 */
export function scoreWriting(outcomes: WritingOutcome[]): WritingSkillResult | null {
  if (!outcomes.length) return null;
  const avgScore = outcomes.reduce((s, o) => s + o.score, 0) / outcomes.length;
  const levels = outcomes.map((o) => levelToNumber(capTaskLevel(o.level, o.taskLevel, o.score))!);
  const avgLevel = levels.reduce((s, x) => s + x, 0) / levels.length;
  return {
    avgScore: Math.round(avgScore * 100) / 100,
    estimatedLevel: numberToLevel(avgLevel),
    count: outcomes.length,
  };
}

/**
 * Assemble the SLP profile from per-skill results. Speaking is never assessed by this app.
 *
 * @returns The profile and its compact L/S/R/W string, with "–" for a skill not assessed
 *   (for example "3/–/3/2+").
 */
export function slpProfile(results: {
  listening: { estimatedLevel: string } | null;
  reading: { estimatedLevel: string } | null;
  writing: { estimatedLevel: string } | null;
}): { profile: SlpProfile; slp: string } {
  const profile: SlpProfile = {
    listening: results.listening?.estimatedLevel ?? null,
    speaking: null,
    reading: results.reading?.estimatedLevel ?? null,
    writing: results.writing?.estimatedLevel ?? null,
  };
  const slp = [profile.listening, profile.speaking, profile.reading, profile.writing]
    .map((l) => l ?? '–')
    .join('/');
  return { profile, slp };
}
