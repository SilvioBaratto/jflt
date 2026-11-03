import { languagesToSeed } from './seed-plan';

describe('languagesToSeed', () => {
  it('seeds only the languages with no seed rows when asked to seed if empty', () => {
    expect(languagesToSeed({ en: 60, es: 0 }, ['en', 'es'], true)).toEqual(['es']);
  });

  it('seeds every present language when none has seed rows yet', () => {
    expect(languagesToSeed({ en: 0, es: 0 }, ['en', 'es'], true)).toEqual(['en', 'es']);
  });

  it('seeds nothing when every present language already has seed rows', () => {
    expect(languagesToSeed({ en: 60, es: 60 }, ['en', 'es'], true)).toEqual([]);
  });

  it.each([
    { en: 60, es: 0 },
    { en: 0, es: 0 },
    { en: 60, es: 60 },
  ])('reseeds every present language regardless of existing rows %j', (existing) => {
    expect(languagesToSeed(existing, ['en', 'es'], false)).toEqual(['en', 'es']);
  });

  it('never seeds a language the seed data does not contain', () => {
    expect(languagesToSeed({ en: 0, es: 0 }, ['es'], true)).toEqual(['es']);
    expect(languagesToSeed({ en: 0, es: 0 }, ['es'], false)).toEqual(['es']);
  });
});
