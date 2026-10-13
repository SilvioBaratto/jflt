/** Writing task types in paper order, easiest first. Unknown types sort after these. */
export const WRITING_TYPE_ORDER = ['guided_note', 'formal_correspondence', 'essay'];

/** A source of uniform random numbers in [0, 1); injectable so selection is testable. */
export type Rng = () => number;

/**
 * Draw up to `count` distinct ids without replacement, each draw proportional to its weight.
 *
 * @param pool - Candidates with weights; non-positive weights are treated as a tiny positive weight
 *   so every candidate stays reachable.
 * @returns The drawn ids in draw order; fewer than `count` when the pool is smaller.
 */
export function weightedSample(pool: { id: string; w: number }[], count: number, rng: Rng = Math.random): string[] {
  const items = [...pool];
  const picked: string[] = [];
  while (picked.length < count && items.length) {
    const total = items.reduce((s, x) => s + Math.max(x.w, 0.0001), 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < items.length; idx++) {
      r -= Math.max(items[idx]!.w, 0.0001);
      if (r <= 0) break;
    }
    idx = Math.min(idx, items.length - 1);
    picked.push(items[idx]!.id);
    items.splice(idx, 1);
  }
  return picked;
}

/**
 * Draw `count` items spread as evenly as possible across the levels present in the pool.
 *
 * A multilevel test can only place a candidate at a level it has sampled adequately, so an
 * unstratified draw that happens to land almost entirely on one level makes the level estimate
 * meaningless. Remainder slots go to randomly chosen levels; a level that runs short of items
 * hands its unused slots to the others.
 *
 * @param pool - Candidates with their level and sampling weight.
 * @returns The drawn ids ordered by ascending level, as a multilevel paper climbs.
 */
export function stratifiedSample(
  pool: { id: string; level: number; w: number }[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  const byLevel = new Map<number, { id: string; w: number }[]>();
  for (const p of pool) byLevel.set(p.level, [...(byLevel.get(p.level) ?? []), { id: p.id, w: p.w }]);
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  if (!levels.length || count <= 0) return [];

  const quota = new Map(levels.map((l) => [l, 0]));
  let left = Math.min(count, pool.length);
  while (left > 0) {
    const open = levels.filter((l) => quota.get(l)! < byLevel.get(l)!.length);
    const share = Math.floor(left / open.length);
    if (share > 0) {
      for (const l of open) {
        const take = Math.min(share, byLevel.get(l)!.length - quota.get(l)!);
        quota.set(l, quota.get(l)! + take);
        left -= take;
      }
    } else {
      const l = open[Math.floor(rng() * open.length)]!;
      quota.set(l, quota.get(l)! + 1);
      left -= 1;
    }
  }

  return levels.flatMap((l) => weightedSample(byLevel.get(l)!, quota.get(l)!, rng));
}

/**
 * Choose writing tasks for a session at random, restricted to the requested levels.
 *
 * Successive slots rotate through the task types available, starting from a random type, so a
 * multi-task paper mixes types (for example a formal letter and an essay) and a single-task practice
 * is not always the same type; when a type runs out, the slot is filled from whatever remains.
 *
 * @param tasks - The writing bank.
 * @param levels - STANAG levels to draw from; tasks at other levels are never chosen.
 * @returns Task ids in paper order: by type order, then ascending level.
 */
export function pickWritingTasks(
  tasks: { id: string; taskType: string; stanagLevel: number }[],
  levels: number[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  const typeRank = (t: string): number => {
    const i = WRITING_TYPE_ORDER.indexOf(t);
    return i === -1 ? WRITING_TYPE_ORDER.length : i;
  };
  const remaining = tasks.filter((t) => levels.includes(t.stanagLevel));
  const types = [...new Set(remaining.map((t) => t.taskType))].sort(
    (a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b),
  );

  const picked: typeof remaining = [];
  const firstType = Math.floor(rng() * types.length);
  for (let slot = 0; slot < count && remaining.length; slot++) {
    const type = types[(firstType + slot) % types.length];
    const ofType = remaining.filter((t) => t.taskType === type);
    const from = ofType.length ? ofType : remaining;
    const choice = from[Math.floor(rng() * from.length)]!;
    picked.push(choice);
    remaining.splice(remaining.indexOf(choice), 1);
  }

  return picked
    .sort((a, b) => typeRank(a.taskType) - typeRank(b.taskType) || a.stanagLevel - b.stanagLevel)
    .map((t) => t.id);
}
