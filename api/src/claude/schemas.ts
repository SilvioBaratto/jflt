import { z } from 'zod';

/**
 * Convert a Zod schema to the JSON Schema draft-07 shape the Agent SDK validator accepts.
 *
 * @param schema - The Zod schema to convert.
 * @returns A plain JSON Schema object usable as the `claude --json-schema` argument.
 */
export function toSdkSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
}

const optionLabel = z.enum(['A', 'B', 'C', 'D']);

/** One option of a reading item: its label, text, and the rationale for key/distractor. */
export const readingOptionSchema = z.object({
  label: optionLabel,
  text: z.string(),
  rationale: z.string(),
});

/** A generated reading MCQ item (passage, question, four options, key). */
export const readingItemSchema = z.object({
  stanagLevel: z.number().int().min(1).max(4),
  cefr: z.string(),
  topic: z.string(),
  passage: z.string(),
  question: z.string(),
  options: z.array(readingOptionSchema).length(4),
  correctLabel: optionLabel,
});
export type GeneratedReadingItem = z.infer<typeof readingItemSchema>;

/** The blind-solver's judgement of a reading item (never shown the author's key). */
export const verdictSchema = z.object({
  chosenLabel: optionLabel,
  defensibleLabels: z.array(optionLabel),
  issues: z.array(z.string()),
});
export type Verdict = z.infer<typeof verdictSchema>;

/** One listening comprehension question (four options, key, rationale). */
export const listeningQuestionSchema = z.object({
  question: z.string(),
  options: z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() }),
  correctLabel: optionLabel,
  rationale: z.string(),
});

/** A generated listening conversation plus comprehension questions. */
export const listeningItemSchema = z.object({
  stanagLevel: z.number().int().min(1).max(4),
  topic: z.string(),
  conversationType: z.string(),
  setting: z.string(),
  speakers: z.array(z.object({ id: z.string(), role: z.string(), voice: z.string() })).min(2),
  lines: z.array(z.object({ speaker: z.string(), text: z.string() })).min(6),
  questions: z.array(listeningQuestionSchema).min(3).max(3),
});
export type GeneratedListeningItem = z.infer<typeof listeningItemSchema>;

/** Blind-solved answer key (one entry per question) for an existing listening item. */
export const listeningKeysSchema = z.object({
  answers: z
    .array(z.object({ correctLabel: z.enum(['A', 'B', 'C', 'D']), rationale: z.string() }))
    .min(1)
    .max(3),
});
export type ListeningKeys = z.infer<typeof listeningKeysSchema>;

/** A generated writing task with rubric, word band, and one or more prompt options. */
export const writingTaskSchema = z.object({
  taskType: z.enum(['guided_note', 'formal_correspondence', 'essay']),
  stanagLevel: z.number().int().min(1).max(4),
  title: z.string(),
  instructions: z.string(),
  wordCountMin: z.number().int(),
  wordCountMax: z.number().int(),
  rubric: z.array(z.object({ dimension: z.string(), descriptor: z.string() })).min(1),
  options: z
    .array(z.object({ key: z.string(), label: z.string(), prompt: z.string(), modelAnswer: z.string() }))
    .min(1),
});
export type GeneratedWritingTask = z.infer<typeof writingTaskSchema>;

/** A rubric-based grade for a candidate's writing response. */
export const writingGradeSchema = z.object({
  dimensions: z.array(
    z.object({ dimension: z.string(), score: z.number().min(0).max(4), comment: z.string() }),
  ),
  overallScore: z.number().min(0).max(4),
  estimatedLevel: z.enum(['0', '0+', '1', '1+', '2', '2+', '3', '3+', '4', '4+']),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});
export type WritingGrade = z.infer<typeof writingGradeSchema>;
