import type { Language } from '../common/language';

/** Wording the Claude prompts use to name a content language. */
export interface LanguageProfile {
  /** English name of the exam language, interpolated into prompts that write or solve items. */
  name: string;
  /**
   * Language the grader writes feedback in. It matches the exam language so a candidate practising
   * Spanish reads the examiner's comments in Spanish too.
   */
  feedbackLanguage: string;
  /**
   * Word range requested for a generated listening dialogue. It follows each language's own
   * item-writing rules (`references/item-writing-rules.md`, `references/es/item-writing-rules.md`),
   * which size the dialogue differently.
   */
  dialogueWords: { min: number; max: number };
}

/** Prompt wording per content language. */
export const LANGUAGE_PROFILE: Record<Language, LanguageProfile> = {
  en: { name: 'English', feedbackLanguage: 'English', dialogueWords: { min: 320, max: 480 } },
  es: { name: 'Spanish', feedbackLanguage: 'Spanish', dialogueWords: { min: 380, max: 500 } },
};
