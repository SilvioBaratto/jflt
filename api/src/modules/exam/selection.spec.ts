import { pickWritingTasks, stratifiedSample, weightedSample, type Rng } from './selection';

/** Mulberry32: a seeded PRNG whose first output already differs well between nearby seeds. */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const writingBank = [
  { id: 'f3a', taskType: 'formal_correspondence', stanagLevel: 3 },
  { id: 'f3b', taskType: 'formal_correspondence', stanagLevel: 3 },
  { id: 'e3a', taskType: 'essay', stanagLevel: 3 },
  { id: 'e3b', taskType: 'essay', stanagLevel: 3 },
  { id: 'f4a', taskType: 'formal_correspondence', stanagLevel: 4 },
  { id: 'e4a', taskType: 'essay', stanagLevel: 4 },
];
const typeOf = (id: string) => writingBank.find((t) => t.id === id)!.taskType;
const levelOf = (id: string) => writingBank.find((t) => t.id === id)!.stanagLevel;

describe('weightedSample', () => {
  it('draws distinct ids and stops when the pool runs out', () => {
    const ids = weightedSample(
      [
        { id: 'a', w: 1 },
        { id: 'b', w: 1 },
      ],
      5,
      seeded(1),
    );
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('keeps zero-weight items reachable', () => {
    const ids = weightedSample([{ id: 'z', w: 0 }], 1, seeded(1));
    expect(ids).toEqual(['z']);
  });
});

describe('stratifiedSample', () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `l3-${i}`, level: 3, w: 1 })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `l4-${i}`, level: 4, w: 1 })),
  ];
  const levelCounts = (ids: string[]) => ({
    l3: ids.filter((id) => id.startsWith('l3')).length,
    l4: ids.filter((id) => id.startsWith('l4')).length,
  });

  it('splits an even count evenly across levels', () => {
    expect(levelCounts(stratifiedSample(pool, 10, seeded(7)))).toEqual({ l3: 5, l4: 5 });
  });

  it('gives the remainder of an odd count to one level only', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = levelCounts(stratifiedSample(pool, 5, seeded(seed)));
      expect(c.l3 + c.l4).toBe(5);
      expect(Math.abs(c.l3 - c.l4)).toBe(1);
    }
  });

  it('orders the paper by ascending level', () => {
    const ids = stratifiedSample(pool, 6, seeded(3));
    const firstL4 = ids.findIndex((id) => id.startsWith('l4'));
    expect(ids.slice(firstL4).every((id) => id.startsWith('l4'))).toBe(true);
  });

  it('hands unused slots of a short level to the others', () => {
    const lopsided = [{ id: 'l3-only', level: 3, w: 1 }, ...pool.filter((p) => p.level === 4)];
    expect(levelCounts(stratifiedSample(lopsided, 6, seeded(2)))).toEqual({ l3: 1, l4: 5 });
  });

  it('returns at most the pool size and nothing for an empty pool', () => {
    expect(stratifiedSample(pool.slice(0, 3), 10, seeded(1))).toHaveLength(3);
    expect(stratifiedSample([], 5, seeded(1))).toEqual([]);
  });
});

describe('pickWritingTasks', () => {
  it('only draws tasks at the requested levels', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = pickWritingTasks(writingBank, [4], 3, seeded(seed));
      expect(ids.every((id) => levelOf(id) === 4)).toBe(true);
    }
    expect(pickWritingTasks(writingBank, [1, 2], 3, seeded(1))).toEqual([]);
  });

  it('mixes task types in a multi-task paper, in paper order', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = pickWritingTasks(writingBank, [3, 4], 3, seeded(seed));
      const types = ids.map(typeOf);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      expect(types).toContain('formal_correspondence');
      expect(types).toContain('essay');
      expect(types.indexOf('essay')).toBeGreaterThan(types.lastIndexOf('formal_correspondence'));
    }
  });

  it('varies the chosen task and its type across single-task draws', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) seen.add(pickWritingTasks(writingBank, [3, 4], 1, seeded(seed))[0]!);
    expect(seen.size).toBeGreaterThan(3);
    expect(new Set([...seen].map(typeOf)).size).toBe(2);
  });
});
