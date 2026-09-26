import { describe, it, expect } from 'vitest';
import { computeDamage } from './damage';

describe('computeDamage', () => {
  it('subtracts armour', () => {
    // swordsman 25 vs spearman armour 4, no bonus
    expect(computeDamage(25, {}, 4, 'heavy')).toBeCloseTo(21, 10);
  });

  it('applies the bonus multiplier BEFORE armour', () => {
    // swordsman 25 x1.5 vs light = 37.5, minus 0 armour
    expect(computeDamage(25, { light: 1.5 }, 0, 'light')).toBeCloseTo(37.5, 10);
    // spearman 24 x1.6 vs heavy = 38.4, minus 5 armour
    expect(computeDamage(24, { heavy: 1.6 }, 5, 'heavy')).toBeCloseTo(33.4, 10);
  });

  it('ignores bonuses that do not match the target armour type', () => {
    expect(computeDamage(25, { light: 1.5 }, 4, 'heavy')).toBeCloseTo(21, 10);
  });

  it('never drops below 10% of the raw value', () => {
    // 10 raw, 999 armour -> 10% floor = 1
    expect(computeDamage(10, {}, 999, 'heavy')).toBeCloseTo(1, 10);
  });

  it('still lets an armoured target be hurt by a weak attacker', () => {
    expect(computeDamage(5, {}, 100, 'heavy')).toBeGreaterThan(0);
  });

  it('returns the raw value when armour is zero', () => {
    expect(computeDamage(18, {}, 0, 'light')).toBeCloseTo(18, 10);
  });

  it('is deterministic and pure', () => {
    const a = computeDamage(24, { heavy: 1.6 }, 5, 'heavy');
    const b = computeDamage(24, { heavy: 1.6 }, 5, 'heavy');
    expect(a).toBe(b);
  });

  it('handles a zero attack gracefully', () => {
    expect(computeDamage(0, {}, 5, 'heavy')).toBe(0);
  });
});
