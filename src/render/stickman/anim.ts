/**
 * Frame-index arithmetic for the animated sprite strips (M15 step-2).
 *
 * Phaser-free so it can be asserted (iron rule #7): the strip player must
 * reproduce two contracts the skeletal rig already guarantees, and both are
 * pure arithmetic on the sim's phase values:
 *
 *   1. WALK/GATHER cycles map phase → frame uniformly (phase 0 = frame 0,
 *      one full cycle = the whole strip, wrapping).
 *   2. ATTACK maps `attackPhase` (0..1 over windup + cooldown) → frames with
 *      the CONTACT keyframe pinned to the strike frame — the sprite twin of
 *      `poses.ts`'s CONTACT_PHASE contract ("the blade is shown connecting
 *      exactly when the blow lands", spec §7.1's hard constraint).
 *
 * The STRIP has 6 frames; the attack maps its 0..1 phase so that
 * CONTACT_PHASE (0.5) lands exactly on frame 3 (the mid-swing frame the art
 * was generated for). Segment boundaries use `floor`, so a phase of exactly
 * 0.5 selects frame 3, and the final phase 1.0 wraps to frame 0 — the cycle
 * ends where the next one begins, with no held extra frame.
 */

import { attackPhase, CONTACT_PHASE } from './poses';

/** Frames per strip (both walk and attack sheets are generated with 6). */
export const FRAMES_PER_STRIP = 6;

/** The frame the attack's CONTACT_PHASE (0.5) maps onto. */
export const ATTACK_CONTACT_FRAME = 3;

/**
 * Walk (and gather, which reuses the walk strip): uniform phase → frame.
 *
 * `floor(phase * frames)` with the phase first wrapped into [0, 1): a phase
 * of exactly 1 (cycle end) or any multiple wraps back to frame 0, and garbage
 * (NaN/negative/huge) recovers to frame 0 — the cycle's rest frame — rather
 * than an off-strip index.
 */
export function frameIndexFor(phase: number): number {
  if (!Number.isFinite(phase) || phase < 0) return 0;
  const wrapped = phase % 1; // exact 1 → 0
  return Math.floor(wrapped * FRAMES_PER_STRIP);
}

/**
 * Attack: piecewise map of `attackPhase` onto the strip.
 *
 * The windup half (phase 0 → CONTACT_PHASE) covers frames 0 → 3, and the
 * recovery half (CONTACT_PHASE → 1) covers frames 3 → 5 → wraps to 0. Frames
 * 1-2 are the raise, frame 3 the strike (pinned to the damage tick via
 * CONTACT_PHASE, exactly as the skeletal rig pins its strike keyframe), and
 * frames 4-5 the follow-through.
 *
 * The same normalized shape as `attackPhase` in poses.ts: linear in each half,
 * continuous at the contact point. A degenerate unit with no windup keeps the
 * contact frame — same answer as the rig's degenerate case.
 */
export function attackFrameIndex(
  windupTicksLeft: number,
  cooldownTicksLeft: number,
  windupTicks: number,
  cooldownTicks: number,
): number {
  // Reuse the rig's phase: one source of truth for where in the cycle we are.
  // poses.ts is Phaser-free, so the import is node-safe and keeps CONTACT_PHASE
  // (and its damage-tick contract) in exactly one place.
  const phase = attackPhase(windupTicksLeft, cooldownTicksLeft, windupTicks, cooldownTicks);
  if (phase < CONTACT_PHASE) {
    // Raise: frames 0..3. floor of (phase / CONTACT_PHASE) * 3, clamped to 2
    // so the contact phase itself maps to frame 3 below.
    const t = phase / CONTACT_PHASE;
    return Math.min(2, Math.floor(t * 3));
  }
  if (phase < 1) {
    // Recover: frames 3..5. The recovery's LAST moment (phase → 1) is the
    // instant before the cycle restarts, so it holds frame 5 (follow-through
    // complete); the next tick's phase 0 begins a new raise at frame 0.
    const t = (phase - CONTACT_PHASE) / (1 - CONTACT_PHASE);
    return Math.min(FRAMES_PER_STRIP - 1, 3 + Math.floor(t * 3));
  }
  return ATTACK_CONTACT_FRAME;
}
