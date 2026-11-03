import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LANGUAGE, type Language } from '../common/language';

const cache = new Map<string, string>();

// English references live directly in api/references; every other language gets its own subfolder.
function refDir(language: Language): string[] {
  return language === DEFAULT_LANGUAGE ? [] : [language];
}

/**
 * Read a grounding reference file once (memoized) from api/references, relative to the run cwd.
 * The cache key carries the language because the English and Spanish sets share file names.
 */
function readRef(name: string, language: Language): string {
  const key = `${language}/${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const path = join(process.cwd(), 'references', ...refDir(language), name);
  const text = readFileSync(path, 'utf8');
  cache.set(key, text);
  return text;
}

// XML-style fences so a horizontal rule or front matter inside a reference cannot be mistaken
// for a document boundary by the model.
function embed(names: string[], language: Language): string {
  return names
    .map((n) => `<document name="${n}">\n${readRef(n, language)}\n</document>`)
    .join('\n\n');
}

/**
 * Build the reading-generation grounding block (level descriptors, item rules, topic domains).
 *
 * @param language - Content language whose reference set to embed; defaults to English.
 * @returns The prompt block embedding that language's grounding documents.
 */
export function readingGrounding(language: Language = DEFAULT_LANGUAGE): string {
  return `Follow these grounding documents exactly:\n\n${embed(
    ['stanag-l3-reading.md', 'item-writing-rules.md', 'topic-domains.md'],
    language,
  )}`;
}

/**
 * Build the writing-generation grounding block (task spec, topic domains).
 *
 * @param language - Content language whose reference set to embed; defaults to English.
 * @returns The prompt block embedding that language's grounding documents.
 */
export function writingGrounding(language: Language = DEFAULT_LANGUAGE): string {
  return `Follow these grounding documents exactly:\n\n${embed(
    ['writing-tasks-spec.md', 'topic-domains.md'],
    language,
  )}`;
}
