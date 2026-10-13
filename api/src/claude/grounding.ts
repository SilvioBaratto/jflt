import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cache = new Map<string, string>();

/** Read a grounding reference file once (memoized) from api/references, relative to the run cwd. */
function readRef(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const path = join(process.cwd(), 'references', name);
  const text = readFileSync(path, 'utf8');
  cache.set(name, text);
  return text;
}

// XML-style fences so a horizontal rule or front matter inside a reference cannot be mistaken
// for a document boundary by the model.
function embed(names: string[]): string {
  return names.map((n) => `<document name="${n}">\n${readRef(n)}\n</document>`).join('\n\n');
}

/** Build the reading-generation grounding block (level descriptors, item rules, topic domains). */
export function readingGrounding(): string {
  return `Follow these grounding documents exactly:\n\n${embed([
    'stanag-l3-reading.md',
    'item-writing-rules.md',
    'topic-domains.md',
  ])}`;
}

/** Build the writing-generation grounding block (task spec, topic domains). */
export function writingGrounding(): string {
  return `Follow these grounding documents exactly:\n\n${embed([
    'writing-tasks-spec.md',
    'topic-domains.md',
  ])}`;
}
