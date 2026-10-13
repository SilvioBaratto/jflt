import {
  capTaskLevel,
  levelToNumber,
  numberToLevel,
  scoreMcq,
  scoreWriting,
  slpProfile,
  type McqOutcome,
} from './scoring';

const right = (level: number): McqOutcome => ({ level, answered: true, correct: true });
const wrong = (level: number): McqOutcome => ({ level, answered: true, correct: false });
const skipped = (level: number): McqOutcome => ({ level, answered: false, correct: false });
const times = (n: number, o: McqOutcome): McqOutcome[] => Array.from({ length: n }, () => o);

describe('levelToNumber / numberToLevel', () => {
  it.each([
    ['3', 3],
    ['2+', 2.5],
    ['Level 3+', 3.5],
    ['4', 4],
  ])('parses %p as %p', (label, n) => {
    expect(levelToNumber(label)).toBe(n);
  });

  it('returns null for a label with no digit', () => {
    expect(levelToNumber('n/a')).toBeNull();
    expect(levelToNumber(null)).toBeNull();
  });

  it.each([
    [4, '4'],
    [3.99, '3+'],
    [3.5, '3+'],
    [3.49, '3'],
    [1.5, '1+'],
    [0.2, '0'],
    [9, '4+'],
    [-1, '0'],
  ])('formats %p as %p, rounding down to a half level', (n, label) => {
    expect(numberToLevel(n)).toBe(label);
  });
});

describe('capTaskLevel', () => {
  it('caps a level above the task level at the task level plus', () => {
    expect(capTaskLevel('4', 3, 4)).toBe('3+');
  });

  it('keeps a level at or below the cap', () => {
    expect(capTaskLevel('2+', 3, 2.5)).toBe('2+');
    expect(capTaskLevel('4', 4, 4)).toBe('4');
  });

  it('falls back to the rubric score when the label is unusable', () => {
    expect(capTaskLevel('unknown', 4, 3.2)).toBe('3');
  });
});

describe('scoreMcq', () => {
  it('returns null when nothing keyed was presented', () => {
    expect(scoreMcq([])).toBeNull();
  });

  it('counts unanswered questions as wrong so skipping cannot inflate the percentage', () => {
    const r = scoreMcq([right(3), ...times(9, skipped(3))])!;
    expect(r).toMatchObject({ correct: 1, answered: 1, total: 10, pct: 10, estimatedLevel: '<3' });
  });

  it('reports "<N" instead of an unmeasured lower level when the lowest tested level is failed', () => {
    const r = scoreMcq([...times(2, right(3)), ...times(3, wrong(3)), ...times(5, right(4))])!;
    expect(r.estimatedLevel).toBe('<3');
  });

  it('awards the highest level reached by passing each tested level in turn', () => {
    expect(scoreMcq([...times(3, right(3)), wrong(3), ...times(2, right(4)), ...times(3, wrong(4))])!.estimatedLevel).toBe(
      '3',
    );
    expect(scoreMcq([...times(3, right(3)), wrong(3), ...times(3, right(4)), wrong(4)])!.estimatedLevel).toBe('4');
  });

  it('treats exactly the pass ratio as a pass', () => {
    expect(scoreMcq([...times(3, right(3)), ...times(2, wrong(3))])!.estimatedLevel).toBe('3');
  });

  it('reports "0" when level 1 is the lowest tested level and is failed', () => {
    expect(scoreMcq([wrong(1), wrong(1)])!.estimatedLevel).toBe('0');
  });

  it('breaks the score down by level, lowest first', () => {
    const r = scoreMcq([right(4), right(3), wrong(3)])!;
    expect(r.byLevel).toEqual([
      { level: 3, correct: 1, total: 2 },
      { level: 4, correct: 1, total: 1 },
    ]);
  });
});

describe('scoreWriting', () => {
  it('returns null when nothing was graded', () => {
    expect(scoreWriting([])).toBeNull();
  });

  it('can reach level 4 when level-4 tasks are graded at 4', () => {
    const r = scoreWriting([
      { score: 4, level: '4', taskLevel: 4 },
      { score: 4, level: '4', taskLevel: 4 },
    ])!;
    expect(r).toEqual({ avgScore: 4, estimatedLevel: '4', count: 2 });
  });

  it('caps each task by its own level before averaging', () => {
    const r = scoreWriting([
      { score: 4, level: '4', taskLevel: 3 },
      { score: 3, level: '3', taskLevel: 4 },
    ])!;
    expect(r.estimatedLevel).toBe('3');
  });

  it('agrees with the per-task levels rather than re-deriving them from the rubric score', () => {
    const r = scoreWriting([
      { score: 3.4, level: '3+', taskLevel: 3 },
      { score: 3.4, level: '3+', taskLevel: 4 },
    ])!;
    expect(r.estimatedLevel).toBe('3+');
    expect(r.avgScore).toBe(3.4);
  });

  it('uses the rubric score for legacy grades without a usable level', () => {
    expect(scoreWriting([{ score: 2.6, level: null, taskLevel: 3 }])!.estimatedLevel).toBe('2+');
  });
});

describe('slpProfile', () => {
  it('orders the profile L/S/R/W and marks unassessed skills', () => {
    const r = slpProfile({
      listening: { estimatedLevel: '3' },
      reading: { estimatedLevel: '<3' },
      writing: null,
    });
    expect(r.profile).toEqual({ listening: '3', speaking: null, reading: '<3', writing: null });
    expect(r.slp).toBe('3/–/<3/–');
  });
});
