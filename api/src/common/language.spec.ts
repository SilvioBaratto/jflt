import { BadRequestException } from '@nestjs/common';
import { DEFAULT_LANGUAGE, LANGUAGES, LanguageSchema, parseLanguage } from './language';

describe('parseLanguage', () => {
  it('defaults to English when the parameter is absent', () => {
    expect(parseLanguage(undefined)).toBe('en');
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it.each(LANGUAGES)('accepts %s as itself', (lang) => {
    expect(parseLanguage(lang)).toBe(lang);
  });

  it.each(['', 'ES', 'EN', 'fr', 'en ', ' es', 'english'])(
    'rejects %j with a 400 instead of falling back to English',
    (value) => {
      expect(() => parseLanguage(value)).toThrow(BadRequestException);
      expect(() => parseLanguage(value)).toThrow('lang must be one of: en, es');
    },
  );
});

describe('LanguageSchema', () => {
  it('accepts supported languages', () => {
    expect(LanguageSchema.safeParse('es').success).toBe(true);
    expect(LanguageSchema.safeParse('en').success).toBe(true);
  });

  it.each(['fr', 'ES', ''])('rejects %j', (value) => {
    expect(LanguageSchema.safeParse(value).success).toBe(false);
  });
});
