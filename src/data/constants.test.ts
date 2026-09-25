import { describe, it, expect } from 'vitest';
import { TICKS_PER_SEC, toTicks, WORLD_WIDTH, PLAYER_BASE_X, ENEMY_BASE_X } from './constants';

describe('toTicks', () => {
  it('converts whole seconds', () => {
    expect(toTicks(1)).toBe(30);
    expect(toTicks(2)).toBe(60);
  });

  it('rounds fractional seconds to the nearest tick', () => {
    expect(toTicks(0.25)).toBe(8);   // 7.5 -> 8
    expect(toTicks(1.2)).toBe(36);
    expect(toTicks(0.3)).toBe(9);
  });

  it('returns 0 for zero', () => {
    expect(toTicks(0)).toBe(0);
  });

  it('never returns a negative tick count', () => {
    expect(toTicks(-5)).toBe(0);
  });

  it('always returns an integer', () => {
    for (const s of [0.01, 0.017, 1 / 3, 2.718, 99.99]) {
      expect(Number.isInteger(toTicks(s))).toBe(true);
    }
  });
});

describe('world constants', () => {
  it('places the player base left of the enemy base', () => {
    expect(PLAYER_BASE_X).toBeLessThan(ENEMY_BASE_X);
  });

  it('keeps both bases inside the world', () => {
    expect(PLAYER_BASE_X).toBeGreaterThan(0);
    expect(ENEMY_BASE_X).toBeLessThan(WORLD_WIDTH);
  });

  it('uses a 30 Hz logic rate', () => {
    expect(TICKS_PER_SEC).toBe(30);
  });
});
