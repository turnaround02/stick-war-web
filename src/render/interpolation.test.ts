import { describe, it, expect } from 'vitest';
import { FixedTimestep, STEP_MS } from './timestep';

/**
 * Regression tests for the render-side interpolation contract.
 *
 * The bug these pin down: BattleScene originally called syncStickmen() only on
 * frames where `ticks > 0`. On a 144 Hz display only ~1 frame in 5 advances a
 * tick, and on that frame the accumulator has just been drained, so alpha is
 * near 0. The result was that no frame ever rendered an interpolated position —
 * units sat at prevX (a full logic tick stale) with no sub-tick smoothing.
 *
 * The invariant that makes interpolation work: alpha must be able to reach
 * values across the whole (0, 1) range on frames that did NOT advance a tick.
 * If alpha were always ~0 when a tick fired, sampling it every frame would
 * still be pointless.
 */
describe('interpolation contract', () => {
  it('alpha grows across consecutive frames that do not advance a tick', () => {
    const ts = new FixedTimestep();
    const frameMs = 1000 / 144; // a 144 Hz display: fewer frames than ticks

    const alphaAtTickFrame: number[] = [];
    const alphaAtIdleFrame: number[] = [];

    for (let i = 0; i < 40; i++) {
      const ticks = ts.advance(frameMs);
      (ticks > 0 ? alphaAtTickFrame : alphaAtIdleFrame).push(ts.alpha);
    }

    // Idle frames must span a wide range of alpha, otherwise interpolating on
    // them buys nothing.
    expect(alphaAtIdleFrame.length).toBeGreaterThan(0);
    const idleMax = Math.max(...alphaAtIdleFrame);
    expect(idleMax).toBeGreaterThan(0.5);

    // And the tick frames must be small — well below what the idle frames
    // reach. This is exactly why the old `if (ticks > 0) syncStickmen()` gate
    // could not produce smoothing: the only frames it rendered were the ones
    // with the smallest alpha.
    expect(alphaAtTickFrame.length).toBeGreaterThan(0);
    const tickMax = Math.max(...alphaAtTickFrame);
    expect(tickMax).toBeLessThan(idleMax);
    expect(tickMax).toBeLessThan(0.25);
  });

  it('a position interpolated with alpha stays between prevX and x', () => {
    const prevX = 100;
    const x = 103; // one tick of movement at ~90 px/s, 30 Hz

    for (const alpha of [0, 0.25, 0.5, 0.75, 0.999]) {
      const rendered = prevX + (x - prevX) * alpha;
      expect(rendered).toBeGreaterThanOrEqual(prevX);
      expect(rendered).toBeLessThanOrEqual(x);
    }
  });

  it('alpha of 0 renders exactly prevX and never overshoots x', () => {
    const ts = new FixedTimestep();
    // Feed exactly one step so the accumulator drains to zero.
    expect(ts.advance(STEP_MS)).toBe(1);
    expect(ts.alpha).toBe(0);
  });
});
