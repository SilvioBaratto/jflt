import { z } from 'zod';
import { DEFAULT_LANGUAGE, LanguageSchema } from '../../../common/language';

/** Request body to generate a fresh reading item. */
export const GenReadingSchema = z.object({
  level: z.number().int().min(1).max(4),
  topic: z.string().min(3),
  language: LanguageSchema.default(DEFAULT_LANGUAGE),
});
export type GenReadingDto = z.infer<typeof GenReadingSchema>;

/** Request body to generate a fresh writing task. */
export const GenWritingSchema = z.object({
  taskType: z.enum(['guided_note', 'formal_correspondence', 'essay']),
  language: LanguageSchema.default(DEFAULT_LANGUAGE),
});
export type GenWritingDto = z.infer<typeof GenWritingSchema>;

/** Request body to generate a fresh listening conversation (with audio). */
export const GenListeningSchema = z.object({
  topic: z.string().min(3),
  genre: z.string().min(3),
  speakers: z.number().int().min(2).max(3).optional(),
  language: LanguageSchema.default(DEFAULT_LANGUAGE),
});
export type GenListeningDto = z.infer<typeof GenListeningSchema>;
