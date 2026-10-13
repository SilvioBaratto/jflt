import { z } from 'zod';

/** Request body for recording a vocab flashcard review outcome. */
export const VocabReviewSchema = z.object({
  vocabId: z.string().uuid(),
  remembered: z.boolean(),
});
export type VocabReviewDto = z.infer<typeof VocabReviewSchema>;
