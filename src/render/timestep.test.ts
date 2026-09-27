import { describe, it, expect } from 'vitest';
import { FixedTimestep, MAX_ACCUMULATOR_MS, SPEED_STEPS, STEP_MS } from './timestep';

describe('FixedTimestep', () => {
  it('uses a 30 Hz step', () => {
    expect(STEP_MS).toBeCloseTo(1000 / 30, 10);
  });

  it('runs zero ticks for a delta smaller than one step', () => {
    const ts = new FixedTimestep();
    expect(ts.advance(STEP_MS / 2)).toBe(0);
  });

  it('runs exactly one tick for a delta of one step', () => {
    const ts = new FixedTimestep();
    expect(ts.advance(STEP_MS)).toBe(1);
  });

  it('accumulates remainders across frames', () => {
    const ts = new FixedTimestep();
    const half = STEP_MS / 2;
    expect(ts.advance(half)).toBe(0);
    expect(ts.advance(half)).toBe(1);
  });

  it('runs three ticks for a delta of three steps', () => {
    const ts = new FixedTimestep();
    expect(ts.advance(STEP_MS * 3)).toBe(3);
  });

  it('caps catch-up after a huge delta so the game cannot spiral', () => {
    const ts = new FixedTimestep();
    const ticks = ts.advance(60_000);
    expect(ticks).toBeLessThanOrEqual(Math.ceil(MAX_ACCUMULATOR_MS / STEP_MS));
    expect(ticks).toBeGreaterThan(0);
  });

  it('does not keep a backlog after a huge delta', () => {
    const ts = new FixedTimestep();
    ts.advance(60_000);
    // The next normal frame must not try to catch up further.
    expect(ts.advance(STEP_MS)).toBe(1);
  });

  it('reports alpha in [0, 1) after any delta', () => {
    const ts = new FixedTimestep();
    for (const delta of [0, 1, STEP_MS / 3, STEP_MS, STEP_MS * 2.5, 60_000]) {
      ts.advance(delta);
      expect(ts.alpha).toBeGreaterThanOrEqual(0);
      expect(ts.alpha).toBeLessThan(1);
    }
  });

  it('treats a negative delta as zero', () => {
    const ts = new FixedTimestep();
    expect(ts.advance(-100)).toBe(0);
    expect(ts.alpha).toBeGreaterThanOrEqual(0);
  });

  it('does not accumulate floating point drift over many frames', () => {
    const ts = new FixedTimestep();
    let total = 0;
    // 1000 frames of 16.666... ms ~= 16.67s ~= 500 ticks
    for (let i = 0; i < 1000; i++) total += ts.advance(1000 / 60);
    expect(total).toBeGreaterThanOrEqual(499);
    expect(total).toBeLessThanOrEqual(501);
  });
});

describe('speed scaling', () => {
  it('offers 1x, 2x and 4x', () => {
    expect([...SPEED_STEPS]).toEqual([1, 2, 4]);
  });

  it('runs twice as many ticks per frame at 2x', () => {
    const slow = new FixedTimestep();
    const fast = new FixedTimestep();
    let slowTicks = 0;
    let fastTicks = 0;
    for (let i = 0; i < 60; i++) {
      slowTicks += slow.advance(STEP_MS);
      fastTicks += fast.advance(STEP_MS, 2);
    }
    expect(fastTicks).toBe(slowTicks * 2);
  });

  it('runs four times as many ticks per frame at 4x', () => {
    const slow = new FixedTimestep();
    const fast = new FixedTimestep();
    let slowTicks = 0;
    let fastTicks = 0;
    for (let i = 0; i < 60; i++) {
      slowTicks += slow.advance(STEP_MS);
      fastTicks += fast.advance(STEP_MS, 4);
    }
    expect(fastTicks).toBe(slowTicks * 4);
  });

  it('defaults to 1x when no speed is given', () => {
    const a = new FixedTimestep();
    const b = new FixedTimestep();
    expect(a.advance(STEP_MS * 3)).toBe(b.advance(STEP_MS * 3, 1));
  });

  it('still caps catch-up at high speed', () => {
    const ts = new FixedTimestep();
    const ticks = ts.advance(60_000, 4);
    // The cap is MAX_ACCUMULATOR_MS of REAL time, which at 4x is 4x the ticks.
    expect(ticks).toBeLessThanOrEqual(Math.ceil((MAX_ACCUMULATOR_MS / STEP_MS) * 4));
  });

  it('keeps alpha in range at every speed', () => {
    for (const speed of SPEED_STEPS) {
      const ts = new FixedTimestep();
      for (const delta of [0, 1, STEP_MS / 3, STEP_MS, STEP_MS * 2.5]) {
        ts.advance(delta, speed);
        expect(ts.alpha).toBeGreaterThanOrEqual(0);
        expect(ts.alpha).toBeLessThan(1);
      }
    }
  });

  it('treats a zero or negative speed as 1x rather than stalling', () => {
    // A stalled timestep would freeze the game with no visible cause.
    const ts = new FixedTimestep();
    expect(ts.advance(STEP_MS * 2, 0)).toBe(2);
    const ts2 = new FixedTimestep();
    expect(ts2.advance(STEP_MS * 2, -1)).toBe(2);
  });
});

describe('catch-up window is measured in REAL time', () => {
  it('caps the accumulator in unscaled time, not scaled', () => {
    // The bug: MAX_ACCUMULATOR_MS was applied AFTER multiplying by speed, so at
    // 4x the real-time window was only 62.5ms. A 250ms hitch at 4x should be
    // worth 250ms of real catch-up, i.e. four times the 1x tick count.
    const one = new FixedTimestep().advance(MAX_ACCUMULATOR_MS, 1);
    const four = new FixedTimestep().advance(MAX_ACCUMULATOR_MS, 4);
    // Exact equality is avoided on purpose: 250 / (1000/30) is 7.4999..., so the
    // floor lands one either side depending on the speed's rounding. The
    // property that matters is the 4x relationship.
    expect(four).toBeGreaterThanOrEqual(one * 4);
    expect(four).toBeLessThanOrEqual(one * 4 + 4);
  });

  it('never exceeds the cap in real milliseconds at any speed', () => {
    for (const speed of SPEED_STEPS) {
      const ts = new FixedTimestep();
      // Feed a huge stall: the accumulated REAL time must be capped at
      // MAX_ACCUMULATOR_MS regardless of speed.
      const ticks = ts.advance(60_000, speed);
      const realMsConsumed = (ticks / speed) * STEP_MS;
      expect(realMsConsumed, `speed ${speed}`).toBeLessThanOrEqual(MAX_ACCUMULATOR_MS + STEP_MS);
    }
  });

  it('still drops excess time after a long stall', () => {
    // The cap's whole purpose: do not try to catch up on a 60s background tab.
    for (const speed of SPEED_STEPS) {
      const ts = new FixedTimestep();
      const ticks = ts.advance(60_000, speed);
      expect(ticks, `speed ${speed}`).toBeLessThan(1000);
    }
  });

  it('is unaffected at 1x', () => {
    const ts = new FixedTimestep();
    expect(ts.advance(60_000, 1)).toBe(Math.floor(MAX_ACCUMULATOR_MS / STEP_MS));
  });

  it('keeps alpha in range after a stall at every speed', () => {
    for (const speed of SPEED_STEPS) {
      const ts = new FixedTimestep();
      ts.advance(60_000, speed);
      expect(ts.alpha).toBeGreaterThanOrEqual(0);
      expect(ts.alpha).toBeLessThan(1);
    }
  });
});
