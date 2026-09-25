import { describe, it, expect } from 'vitest';
import { nextRandom, randomInt, pickWeighted } from './rng';

describe('nextRandom', () => {
  it('returns values in [0, 1)', () => {
    let state = 42;
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      state = r.state;
    }
  });

  it('is deterministic for the same seed', () => {
    const a = nextRandom(12345);
    const b = nextRandom(12345);
    expect(a.value).toBe(b.value);
    expect(a.state).toBe(b.state);
  });

  it('produces a repeatable sequence', () => {
    const run = (seed: number) => {
      const out: number[] = [];
      let state = seed;
      for (let i = 0; i < 5; i++) {
        const r = nextRandom(state);
        out.push(r.value);
        state = r.state;
      }
      return out;
    };
    expect(run(7)).toEqual(run(7));
  });

  it('produces different sequences for different seeds', () => {
    const first = (seed: number) => nextRandom(seed).value;
    expect(first(1)).not.toBe(first(2));
  });

  it('survives a serialization round-trip of its state', () => {
    let state = 99;
    for (let i = 0; i < 10; i++) state = nextRandom(state).state;

    const serialized = JSON.parse(JSON.stringify({ state }));
    const afterRestore = nextRandom(serialized.state);
    const withoutRestore = nextRandom(state);

    expect(afterRestore.value).toBe(withoutRestore.value);
    expect(afterRestore.state).toBe(withoutRestore.state);
  });
});

describe('randomInt', () => {
  it('returns integers in [0, maxExclusive)', () => {
    let state = 5;
    for (let i = 0; i < 500; i++) {
      const r = randomInt(state, 10);
      expect(Number.isInteger(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(10);
      state = r.state;
    }
  });

  it('always returns 0 when maxExclusive is 1', () => {
    const r = randomInt(3, 1);
    expect(r.value).toBe(0);
  });
});

describe('pickWeighted', () => {
  it('never picks an entry with zero weight', () => {
    const entries = [
      { item: 'never', weight: 0 },
      { item: 'always', weight: 1 },
    ];
    let state = 17;
    for (let i = 0; i < 200; i++) {
      const r = pickWeighted(state, entries);
      expect(r.value).toBe('always');
      state = r.state;
    }
  });

  it('respects weight ratios within a loose tolerance', () => {
    const entries = [
      { item: 'a', weight: 3 },
      { item: 'b', weight: 1 },
    ];
    let state = 1234;
    const counts: Record<string, number> = { a: 0, b: 0 };
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const r = pickWeighted(state, entries);
      counts[r.value] += 1;
      state = r.state;
    }
    expect(counts.a / N).toBeGreaterThan(0.70);
    expect(counts.a / N).toBeLessThan(0.80);
  });
});
