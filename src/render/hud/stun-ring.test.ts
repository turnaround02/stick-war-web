import { describe, it, expect } from 'vitest';
import { stunRingFor, STUN_RING_COLOR, STUN_TOTAL_TICKS } from './stun-ring';

describe('stunRingFor', () => {
  it('is invisible for a non-stunned unit', () => {
    const r = stunRingFor({ stunTicksLeft: 0 }, 100, 400);
    expect(r.visible).toBe(false);
  });

  it('is visible with fraction 1 right after the hit', () => {
    const r = stunRingFor({ stunTicksLeft: STUN_TOTAL_TICKS }, 100, 400);
    expect(r.visible).toBe(true);
    expect(r.fraction).toBeCloseTo(1, 10);
    expect(r.y).toBe(399); // groundY - 1
  });

  it('fraction decays with the remaining ticks', () => {
    const half = stunRingFor({ stunTicksLeft: STUN_TOTAL_TICKS / 2 }, 0, 0);
    expect(half.fraction).toBeCloseTo(0.5, 10);
  });

  it('still renders on the final tick (fraction near 0)', () => {
    const r = stunRingFor({ stunTicksLeft: 1 }, 0, 0);
    expect(r.visible).toBe(true);
    expect(r.fraction).toBeCloseTo(1 / STUN_TOTAL_TICKS, 10);
  });

  it('carries the caller x through', () => {
    const r = stunRingFor({ stunTicksLeft: 10 }, 1234, 400);
    expect(r.x).toBe(1234);
  });

  it('pulse stays within a tight band around 1', () => {
    for (let ticks = 1; ticks <= STUN_TOTAL_TICKS; ticks++) {
      const { pulse } = stunRingFor({ stunTicksLeft: ticks }, 0, 0);
      expect(pulse).toBeGreaterThan(0.8);
      expect(pulse).toBeLessThan(1.2);
    }
  });
});

describe('constants', () => {
  it('uses a colour distinct from the white selection ring', () => {
    expect(STUN_RING_COLOR).not.toBe(0xffffff);
  });

  it('matches the mage stun duration', () => {
    // If the mage's stunOnHitTicks changes, this ring's decay must follow.
    expect(STUN_TOTAL_TICKS).toBe(30);
  });
});
