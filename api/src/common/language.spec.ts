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

describe('parseLanguage with a non-string value', () => {
  // Express hands the controller an array for a repeated `?lang=es&lang=en`, and an object or array
  // for bracket syntax when the extended query parser is enabled; none may be coerced to a language.
  it.each([[['es', 'en']], [['es']], [{ a: 'es' }]])('rejects %j with a 400', (value) => {
    expect(() => parseLanguage(value as unknown as string)).toThrow(BadRequestException);
    expect(() => parseLanguage(value as unknown as string)).toThrow('lang must be one of: en, es');
  });
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
