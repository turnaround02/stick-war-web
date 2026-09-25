/**
 * Fixed-timestep accumulator for the render loop (spec §3.3).
 *
 * Kept free of Phaser so the tricky part — surviving a huge `delta` after the
 * tab was backgrounded — is unit-testable.
 *
 * Without the cap, a 60s stall makes the while loop try to run 1800 ticks in
 * one frame; that frame takes far longer than a frame, so the next delta is
 * even bigger, and the game never recovers ("spiral of death").
 */

import { TICKS_PER_SEC } from '../data/constants';

/** Duration of one logic tick in milliseconds. */
export const STEP_MS = 1000 / TICKS_PER_SEC;

/**
 * Upper bound on unspent time. Beyond this we drop the excess rather than
 * trying to catch up. 250ms = at most 7 catch-up ticks in one frame.
 */
export const MAX_ACCUMULATOR_MS = 250;

export class FixedTimestep {
  private accumulator = 0;

  /**
   * Feeds one render frame's elapsed time and returns how many logic ticks
   * should run this frame.
   */
  advance(deltaMs: number): number {
    if (deltaMs > 0) {
      this.accumulator += deltaMs;
    }
    if (this.accumulator > MAX_ACCUMULATOR_MS) {
      this.accumulator = MAX_ACCUMULATOR_MS;
    }

    const ticks = Math.floor(this.accumulator / STEP_MS);
    this.accumulator -= ticks * STEP_MS;
    return ticks;
  }

  /** Interpolation factor in [0, 1) between the previous and current tick. */
  get alpha(): number {
    const alpha = this.accumulator / STEP_MS;
    if (alpha < 0) return 0;
    if (alpha >= 1) return 0.999999;
    return alpha;
  }
}
