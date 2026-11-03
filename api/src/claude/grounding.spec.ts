import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readingGrounding, writingGrounding } from './grounding';

const ref = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), 'references', ...parts), 'utf8');

describe('readingGrounding', () => {
  it('embeds the English reference files by default', () => {
    const grounding = readingGrounding();

    expect(grounding).toBe(readingGrounding('en'));
    expect(grounding).toContain(ref('item-writing-rules.md'));
    expect(grounding).toContain(ref('stanag-l3-reading.md'));
    expect(grounding).toContain(ref('topic-domains.md'));
    expect(grounding).not.toContain(ref('es', 'item-writing-rules.md'));
  });

  it('embeds the Spanish reference files for es', () => {
    const grounding = readingGrounding('es');

    expect(grounding).toContain(ref('es', 'item-writing-rules.md'));
    expect(grounding).toContain(ref('es', 'stanag-l3-reading.md'));
    expect(grounding).toContain(ref('es', 'topic-domains.md'));
    expect(grounding).not.toContain(ref('item-writing-rules.md'));
  });

  it('keeps the two languages apart however the calls interleave', () => {
    // Both languages share the file names, so a cache keyed by name alone would leak one into the other.
    const es = readingGrounding('es');
    const en = readingGrounding('en');

    expect(es).not.toBe(en);
    expect(readingGrounding('es')).toBe(es);
    expect(readingGrounding('en')).toBe(en);
  });
});

describe('writingGrounding', () => {
  it('embeds the English reference files by default', () => {
    const grounding = writingGrounding();

    expect(grounding).toBe(writingGrounding('en'));
    expect(grounding).toContain(ref('writing-tasks-spec.md'));
    expect(grounding).toContain(ref('topic-domains.md'));
    expect(grounding).not.toContain(ref('es', 'writing-tasks-spec.md'));
  });

  it('embeds the Spanish reference files for es', () => {
    const grounding = writingGrounding('es');

    expect(grounding).toContain(ref('es', 'writing-tasks-spec.md'));
    expect(grounding).toContain(ref('es', 'topic-domains.md'));
    expect(grounding).not.toContain(ref('writing-tasks-spec.md'));
  });
});
