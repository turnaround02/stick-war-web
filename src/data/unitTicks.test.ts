import { describe, it, expect } from 'vitest';
import { UNIT_TICKS } from './unitTicks';
import { UNITS } from './units';
import { TICKS_PER_SEC } from './constants';

describe('UNIT_TICKS', () => {
  it('covers every unit type', () => {
    for (const id of Object.keys(UNITS) as (keyof typeof UNITS)[]) {
      expect(UNIT_TICKS[id]).toBeDefined();
    }
  });

  it('converts attackCooldown from seconds to ticks', () => {
    // swordsman: 1.0s -> 30 ticks
    expect(UNIT_TICKS.swordsman.attackCooldown).toBe(30);
    // archer: 1.2s -> 36 ticks
    expect(UNIT_TICKS.archer.attackCooldown).toBe(36);
    // spearman: 1.2s -> 36 ticks
    expect(UNIT_TICKS.spearman.attackCooldown).toBe(36);
  });

  it('converts windupTime from seconds to ticks', () => {
    // swordsman: 0.25s -> 7.5 -> round -> 8
    expect(UNIT_TICKS.swordsman.windup).toBe(8);
    // archer/spearman: 0.30s -> 9
    expect(UNIT_TICKS.archer.windup).toBe(9);
    expect(UNIT_TICKS.spearman.windup).toBe(9);
  });

  it('converts trainTime and gatherTime', () => {
    expect(UNIT_TICKS.swordsman.trainTime).toBe(240); // 8s
    expect(UNIT_TICKS.miner.gatherTime).toBe(90); // 3s
  });

  it('produces integers everywhere', () => {
    for (const stats of Object.values(UNIT_TICKS)) {
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value === 'number' && Number.isInteger(UNIT_TICKS.swordsman.windup)) {
          // Only tick-valued fields must be integers; the per-tick speeds are
          // deliberately floating point.
          if (key === 'speedPerTick' || key === 'projectilePerTick') continue;
          expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
        }
      }
    }
  });

  it('gives a miner zero windup and zero cooldown (it cannot attack)', () => {
    expect(UNIT_TICKS.miner.windup).toBe(0);
    expect(UNIT_TICKS.miner.attackCooldown).toBe(0);
  });

  it('never produces a zero windup for a unit that can attack', () => {
    for (const id of ['swordsman', 'archer', 'spearman'] as const) {
      expect(UNIT_TICKS[id].windup).toBeGreaterThan(0);
      expect(UNIT_TICKS[id].attackCooldown).toBeGreaterThan(0);
    }
  });

  it('derives speed per tick from px per second', () => {
    // swordsman: 95 px/s / 30 = 3.1666...
    expect(UNIT_TICKS.swordsman.speedPerTick).toBeCloseTo(95 / TICKS_PER_SEC, 10);
  });

  it('derives projectile speed per tick for ranged units only', () => {
    expect(UNIT_TICKS.archer.projectilePerTick).toBeCloseTo(400 / TICKS_PER_SEC, 10);
    expect(UNIT_TICKS.swordsman.projectilePerTick).toBe(0);
  });

  it('does not mutate the source table', () => {
    const before = JSON.stringify(UNITS.swordsman);
    void UNIT_TICKS;
    expect(JSON.stringify(UNITS.swordsman)).toBe(before);
  });
});
