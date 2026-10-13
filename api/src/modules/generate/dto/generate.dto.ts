import { z } from 'zod';

/** Request body to generate a fresh reading item. */
export const GenReadingSchema = z.object({
  level: z.number().int().min(1).max(4),
  topic: z.string().min(3),
});
export type GenReadingDto = z.infer<typeof GenReadingSchema>;

/** Request body to generate a fresh writing task. */
export const GenWritingSchema = z.object({
  taskType: z.enum(['guided_note', 'formal_correspondence', 'essay']),
});
export type GenWritingDto = z.infer<typeof GenWritingSchema>;

/** Request body to generate a fresh listening conversation (with audio). */
export const GenListeningSchema = z.object({
  topic: z.string().min(3),
  genre: z.string().min(3),
  speakers: z.number().int().min(2).max(3).optional(),
});
export type GenListeningDto = z.infer<typeof GenListeningSchema>;
