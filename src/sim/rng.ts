/**
 * Seeded, deterministic pseudo-random number generator (mulberry32).
 *
 * Every function here is PURE: the generator state is passed in and returned
 * out. There is no module-level mutable state, so a World can serialize its
 * rngState and resume the exact same sequence later (spec §5.2).
 *
 * Never use Math.random() in src/sim — ESLint blocks it.
 */

const UINT32 = 4294967296;

/** Advances the generator one step. Returns a value in [0, 1) and the new state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32;
  return { value, state: next };
}

/** Returns an integer in [0, maxExclusive). maxExclusive <= 1 always yields 0. */
export function randomInt(
  state: number,
  maxExclusive: number,
): { value: number; state: number } {
  const r = nextRandom(state);
  if (maxExclusive <= 1) return { value: 0, state: r.state };
  return { value: Math.floor(r.value * maxExclusive), state: r.state };
}

export interface WeightedEntry<T> {
  item: T;
  weight: number;
}

/**
 * Picks one entry with probability proportional to its weight.
 * Entries with weight <= 0 are never picked.
 * Falls back to the last entry if every weight is non-positive.
 */
export function pickWeighted<T>(
  state: number,
  entries: readonly WeightedEntry<T>[],
): { value: T; state: number } {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  const r = nextRandom(state);

  if (total <= 0) {
    return { value: entries[entries.length - 1].item, state: r.state };
  }

  let threshold = r.value * total;
  for (const entry of entries) {
    threshold -= Math.max(0, entry.weight);
    if (threshold < 0) return { value: entry.item, state: r.state };
  }
  return { value: entries[entries.length - 1].item, state: r.state };
}
