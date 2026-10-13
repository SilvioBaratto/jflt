import { z } from 'zod';

const skill = z.enum(['reading', 'listening', 'writing']);
const label = z.enum(['A', 'B', 'C', 'D']);

/** Request body for creating a practice set or timed mock exam. */
export const CreateSessionSchema = z.object({
  mode: z.enum(['practice', 'exam']),
  skill: skill.optional(), // omit for a full exam covering all three skills
  levels: z.array(z.number().int().min(1).max(4)).optional(),
  counts: z
    .object({
      reading: z.number().int().min(0).max(60).optional(),
      listening: z.number().int().min(0).max(30).optional(),
      writing: z.number().int().min(0).max(3).optional(),
    })
    .optional(),
  adaptive: z.boolean().optional(),
});
export type CreateSessionDto = z.infer<typeof CreateSessionSchema>;

/** Request body for submitting one answer within a session. */
export const SubmitAnswerSchema = z.object({
  itemType: skill,
  itemId: z.string().uuid(),
  questionIndex: z.number().int().min(0).default(0),
  optionKey: z.string().optional(), // writing: which essay option was answered
  chosenLabel: label.optional(), // reading/listening MCQ
  responseText: z.string().optional(), // writing
});
export type SubmitAnswerDto = z.infer<typeof SubmitAnswerSchema>;
