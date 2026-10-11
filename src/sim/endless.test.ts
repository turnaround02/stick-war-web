import { describe, it, expect } from 'vitest';
import { endlessWaveAt, endlessWaveBudget } from './endless';
import { UNITS } from '../data/units';
import { TICKS_PER_SEC } from '../data/constants';

describe('endlessWaveBudget', () => {
  it('follows 100 + 60N', () => {
    expect(endlessWaveBudget(1)).toBe(160);
    expect(endlessWaveBudget(2)).toBe(220);
    expect(endlessWaveBudget(12)).toBe(820); // spec §8.4.4's own example
  });

  it('grows monotonically', () => {
    for (let n = 1; n < 30; n++) {
      expect(endlessWaveBudget(n + 1)).toBeGreaterThan(endlessWaveBudget(n));
    }
  });

  it('is positive for wave 1', () => {
    expect(endlessWaveBudget(1)).toBeGreaterThan(0);
  });
});

describe('endlessWaveAt — scheduling', () => {
  it('schedules wave N at 25 * N seconds', () => {
    for (const n of [1, 2, 7, 12]) {
      expect(endlessWaveAt(n).atTick).toBe(25 * n * TICKS_PER_SEC);
    }
  });

  it('never schedules wave 1 at tick 0', () => {
    // A wave due at tick 0 would spawn on the very first tick, before the player
    // has done anything.
    expect(endlessWaveAt(1).atTick).toBeGreaterThan(0);
  });
});

describe('endlessWaveAt — composition', () => {
  it('always produces at least one unit', () => {
    for (let n = 1; n <= 40; n++) {
      expect(endlessWaveAt(n).units.length, `wave ${n}`).toBeGreaterThan(0);
    }
  });

  it('only uses real unit types', () => {
    const known = new Set(Object.keys(UNITS));
    for (let n = 1; n <= 40; n++) {
      for (const t of endlessWaveAt(n).units) {
        expect(known.has(t), `wave ${n} has ${t}`).toBe(true);
      }
    }
  });

  it('never sends miners', () => {
    // Wave units are a free attacking force; miners would be free economy.
    for (let n = 1; n <= 40; n++) {
      expect(endlessWaveAt(n).units).not.toContain('miner');
    }
  });

  it('introduces unit types progressively, not all at once', () => {
    // The ladder is what makes the difficulty curve legible to a player.
    expect(endlessWaveAt(1).units.every((t) => t === 'swordsman')).toBe(true);
  });

  it('eventually uses every combat type', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 40; n++) for (const t of endlessWaveAt(n).units) seen.add(t);
    expect(seen).toContain('swordsman');
    expect(seen).toContain('archer');
    expect(seen).toContain('spearman');
  });

  it('spends close to the budget, never over it', () => {
    // A wave may leave a remainder too small for the cheapest unit, but it must
    // not overspend - the budget IS the difficulty curve.
    for (let n = 1; n <= 30; n++) {
      const cost = endlessWaveAt(n).units.reduce((s, t) => s + UNITS[t].goldCost, 0);
      expect(cost, `wave ${n} spent ${cost}`).toBeLessThanOrEqual(endlessWaveBudget(n));
    }
  });

  it('grows in size as the budget grows', () => {
    const size = (n: number) => endlessWaveAt(n).units.length;
    expect(size(20)).toBeGreaterThan(size(1));
    expect(size(10)).toBeGreaterThanOrEqual(size(1));
  });

  it('is deterministic — the same n gives the same wave', () => {
    // No PRNG: wave 12 must be wave 12 on every machine, every run.
    for (const n of [1, 5, 12, 30]) {
      expect(endlessWaveAt(n)).toEqual(endlessWaveAt(n));
    }
  });
});
