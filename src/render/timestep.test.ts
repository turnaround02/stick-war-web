import { describe, it, expect } from 'vitest';
import { FixedTimestep, MAX_ACCUMULATOR_MS, STEP_MS } from './timestep';

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
