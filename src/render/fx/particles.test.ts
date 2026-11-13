import { describe, it, expect } from 'vitest';
import { hitSparks, deathShatter, SPARK_LIFETIME_MS, SHARD_LIFETIME_MS } from './particles';
import { PALETTES } from '../stickman/palette';

describe('hitSparks', () => {
  it('produces exactly 4 sparks', () => {
    expect(hitSparks('swordsman', 42)).toHaveLength(4);
  });

  it('sparks use the victim palette limb colour', () => {
    for (const p of hitSparks('archer', 7)) {
      expect(p.color).toBe(PALETTES.archer.limb);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(hitSparks('miner', 99)).toEqual(hitSparks('miner', 99));
  });

  it('differs across seeds (varied bursts)', () => {
    const a = hitSparks('miner', 1);
    const b = hitSparks('miner', 2);
    expect(a).not.toEqual(b);
  });

  it('sparks are biased upward (debris kicks up)', () => {
    for (const p of hitSparks('swordsman', 5)) {
      expect(p.vy).toBeLessThan(0.01);
    }
  });

  it('lifetimes stay within a sane band', () => {
    for (const p of hitSparks('swordsman', 5)) {
      expect(p.lifetimeMs).toBeGreaterThan(SPARK_LIFETIME_MS * 0.5);
      expect(p.lifetimeMs).toBeLessThan(SPARK_LIFETIME_MS * 1.5);
    }
  });
});

describe('deathShatter', () => {
  it('a standard unit breaks into 6 shards, a giant into 10', () => {
    expect(deathShatter('swordsman', 3)).toHaveLength(6);
    expect(deathShatter('giant', 3)).toHaveLength(10);
  });

  it('shards fly upward-outward (negative vy) and will fall under gravity', () => {
    for (const p of deathShatter('giant', 11)) {
      expect(p.vy).toBeLessThan(0);
    }
  });

  it('lifetimes stay within a sane band', () => {
    for (const p of deathShatter('swordsman', 5)) {
      expect(p.lifetimeMs).toBeGreaterThan(SHARD_LIFETIME_MS * 0.7);
      expect(p.lifetimeMs).toBeLessThan(SHARD_LIFETIME_MS * 1.4);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(deathShatter('mage', 77)).toEqual(deathShatter('mage', 77));
  });
});
