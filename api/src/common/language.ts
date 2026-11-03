import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Content languages the question bank is seeded in. */
export const LANGUAGES = ['en', 'es'] as const;

/** One of {@link LANGUAGES}. */
export type Language = (typeof LANGUAGES)[number];

/** Language served when a request carries no `lang` parameter. */
export const DEFAULT_LANGUAGE: Language = 'en';

/** Zod schema accepting exactly the values in {@link LANGUAGES}. */
export const LanguageSchema = z.enum(LANGUAGES);

/**
 * Resolves the `lang` query parameter of a request into a content language.
 *
 * Matching is deliberately strict, with no trimming or case folding: a typo such as `ES` or an
 * empty `?lang=` must fail loudly rather than silently serve English to a Spanish learner.
 *
 * @param value Raw `lang` query value, or `undefined` when the parameter is absent. Typed `unknown`
 * because Express passes an array for a repeated key, whatever the controller declares.
 * @returns The matching language, or {@link DEFAULT_LANGUAGE} when `value` is `undefined`.
 * @throws BadRequestException when `value` is anything other than `undefined`, `'en'` or `'es'`.
 */
export function parseLanguage(value: unknown): Language {
  if (value === undefined) return DEFAULT_LANGUAGE;
  const parsed = LanguageSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(`lang must be one of: ${LANGUAGES.join(', ')}`);
  }
  return parsed.data;
}
