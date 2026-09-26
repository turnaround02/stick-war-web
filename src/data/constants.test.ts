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

import { TARGET_ACQUIRE_RANGE, LOCK_BREAK_RANGE, yieldWeight } from './constants';

describe('targeting constants', () => {
  it('gives the lock-break range real hysteresis over the acquire range', () => {
    expect(LOCK_BREAK_RANGE).toBeGreaterThan(TARGET_ACQUIRE_RANGE);
  });

  it('acquires far enough for an archer to see past its own range', () => {
    expect(TARGET_ACQUIRE_RANGE).toBeGreaterThan(200);
  });
});

describe('yieldWeight', () => {
  it('makes bases immovable', () => {
    expect(yieldWeight('idle', 'hold', true)).toBe(0);
  });

  it('gives retreat the lowest yield so it can push through its own line', () => {
    const retreat = yieldWeight('move', 'retreat', false);
    const idle = yieldWeight('idle', 'hold', false);
    expect(retreat).toBeLessThan(idle);
  });

  it('ranks retreat below busy states below attack below idle', () => {
    const retreat = yieldWeight('move', 'retreat', false);
    const gather = yieldWeight('gather', 'hold', false);
    const attack = yieldWeight('attack', 'hold', false);
    const idle = yieldWeight('idle', 'hold', false);
    expect(retreat).toBeLessThan(gather);
    expect(gather).toBeLessThan(attack);
    expect(attack).toBeLessThan(idle);
  });

  it('keeps attack pushable, not immovable', () => {
    expect(yieldWeight('attack', 'hold', false)).toBeGreaterThan(0);
  });

  it('treats stunned like gather', () => {
    expect(yieldWeight('stunned', 'hold', false)).toBe(yieldWeight('gather', 'hold', false));
  });
});
