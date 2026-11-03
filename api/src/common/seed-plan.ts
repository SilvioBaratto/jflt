import type { Language } from './language';

/**
 * Chooses which languages of the seed data to (re)load into the database.
 *
 * The emptiness check is per language so that a database seeded before a language existed still
 * receives that language on the next `SEED_IF_EMPTY` start, while the languages it already holds
 * keep the rows that exam answers and review items point at.
 *
 * @param existingSeedRows Number of seed-sourced rows each language already has in the database.
 * @param present Languages that have records in the seed data, in the order to load them.
 * @param ifEmpty Whether to load only languages that have no seed rows yet.
 * @returns The subset of `present` to load, in the same order: every present language when
 *   `ifEmpty` is false, otherwise only those with zero existing seed rows.
 */
export function languagesToSeed(
  existingSeedRows: Record<Language, number>,
  present: readonly Language[],
  ifEmpty: boolean,
): Language[] {
  if (!ifEmpty) return [...present];
  return present.filter((language) => existingSeedRows[language] === 0);
}
