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
import { step } from '../sim/tick';
import type { Command, World } from '../sim/types';

/** Duration of one logic tick in milliseconds. */
export const STEP_MS = 1000 / TICKS_PER_SEC;

/**
 * Upper bound on unspent time. Beyond this we drop the excess rather than
 * trying to catch up. 250ms = at most 7 catch-up ticks in one frame.
 */
export const MAX_ACCUMULATOR_MS = 250;

/** Selectable game speeds. Logic is identical at every one. */
export const SPEED_STEPS = [1, 2, 4] as const;

export type GameSpeed = (typeof SPEED_STEPS)[number];

export class FixedTimestep {
  private accumulator = 0;

  /**
   * Feeds one render frame's elapsed time and returns how many logic ticks
   * should run this frame.
   *
   * `speed` scales TIME, not the tick. The simulation still advances in whole
   * 30 Hz steps, so a match played at 4x produces the same sequence of states
   * as the same match at 1x — only fewer frames pass. That is what lets the
   * determinism hash be speed-independent.
   *
   * A non-positive speed falls back to 1x: a stalled accumulator would freeze
   * the game with nothing on screen to explain why.
   */
  advance(deltaMs: number, speed = 1): number {
    const scale = speed > 0 ? speed : 1;

    if (deltaMs > 0) {
      this.accumulator += deltaMs * scale;
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

/**
 * The scene's whole per-frame logic step, extracted from BattleScene so the
 * speed/command interaction is testable without a canvas.
 *
 * `speed` changes ONLY how many ticks run this frame. Two consequences that
 * this function is the single place responsible for:
 *
 *   - Commands reach only the FIRST tick of the frame (spec §6.3.3). At 4x a
 *     frame runs several ticks, and handing the same orders to each would spend
 *     four times the gold for one click.
 *   - The per-tick work is identical at every speed, so the same seed reaches
 *     the same state regardless of how fast it was played. That property is
 *     what the determinism tests assert, and this function is where it could
 *     actually be broken.
 */
export function advanceWorld(
  timestep: FixedTimestep,
  world: World,
  deltaMs: number,
  speed: number,
  commands: Command[],
): number {
  const ticks = timestep.advance(deltaMs, speed);

  for (let i = 0; i < ticks; i++) {
    step(world, i === 0 ? commands : []);
  }

  return ticks;
}
