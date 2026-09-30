/**
 * A tactical AI's tunable knobs (spec §9.1).
 *
 * The spec's difficulty lever is "the decision frequency and how greedy the
 * script is", not a smarter algorithm — so a profile IS the difficulty. Two
 * profiles ship: the enemy's, and a "reference player" used to prove a level is
 * winnable without a human.
 */

import type { AiProfileId } from '../data/types';
import type { UnitTypeId } from '../data/units';

export type { AiProfileId };

export interface AiProfile {
  /**
   * Ticks between tactical decisions. 30 = once a second, so 45 is every 1.5s
   * and 24 is every 0.8s. Lower is a faster, more responsive commander.
   */
  decisionIntervalTicks: number;
  /** How many miners to keep alive before spending on combat units. */
  minerTarget: number;
  /**
   * Combat units in the order they are bought, cycled through. A list rather
   * than weights: it makes the composition deterministic and readable, and
   * "ratio" falls out of the cycle length.
   */
  buildOrder: UnitTypeId[];
  /** Advance when own combat units >= enemy * this. */
  advanceRatio: number;
  /** Retreat when own combat units <= enemy * this. */
  retreatRatio: number;
}

/**
 * The enemy's standard profile.
 *
 * Deliberately slower than the reference player. Spec §9.1 makes decision
 * frequency the difficulty knob, so this is where the enemy's handicap lives —
 * it is what `RENDER_DEMO_MATCH` and level 2's economy enemy run on.
 */
export const ENEMY_STANDARD: AiProfile = {
  decisionIntervalTicks: 45,
  minerTarget: 3,
  buildOrder: ['swordsman', 'archer', 'swordsman', 'spearman'],
  advanceRatio: 1.0,
  retreatRatio: 0.4,
};

/**
 * The reference player — an AI that plays the player's side well enough to beat
 * level 1 and 2. Used by tests to assert a level is WINNABLE without a human,
 * which turns "can win level 2" from a subjective claim into a deterministic one.
 *
 * `minerTarget` is a MEASURED value, not a guess. Swept over 12 seeds against
 * level 1 (spec §9.1's "greediness" knob, and Q7's rule to sweep before fixing):
 *
 *   target  4 ->  0/12 wins      target  5..8 -> 12/12 wins
 *   target 10 ->  0/12 wins
 *
 * The plateau is wide and the failure on either side is total, which makes the
 * mechanism easy to state: below it the player cannot out-produce the wave
 * schedule, and above it the gold goes to miners that never become an army. 6 is
 * the centre of the plateau, so the smallest reasonable change to either the
 * unit table or the level data keeps it inside.
 */
export const PLAYER_REFERENCE: AiProfile = {
  decisionIntervalTicks: 30,
  minerTarget: 6,
  buildOrder: ['swordsman', 'archer', 'swordsman', 'spearman'],
  advanceRatio: 0.9,
  retreatRatio: 0.35,
};

/**
 * Level 2's enemy.
 *
 * Values MEASURED by sweeping minerTarget x decisionIntervalTicks against level
 * 2, five seeds each (Task 7 of the M4b plan). Criteria: the reference player
 * must win every seed — a level that cannot be won is not a level — AND the
 * match must land in the 3-6 minute window of spec §8.4.3.
 *
 * Sweep results are pasted here by that task. Until then this mirrors the
 * standard enemy; do NOT hand-tune it without re-running the sweep.
 */
export const LEVEL_2_ENEMY: AiProfile = {
  decisionIntervalTicks: 45,
  minerTarget: 3,
  buildOrder: ['swordsman', 'archer', 'swordsman', 'spearman'],
  advanceRatio: 1.0,
  retreatRatio: 0.4,
};

/**
 * The registry a level selects from.
 *
 * A registry of ids rather than an inline profile on MatchConfig: the id is a
 * short string that hashes cheaply, and `World` already carried an `aiProfile`
 * field from M4a — widening its values is a smaller change than introducing a
 * second way to express the same thing.
 *
 * `none` is `null`, not a profile: it means the tactical layer is SKIPPED, which
 * is what a scripted level (no enemy economy) and the balance harness both need.
 *
 * `PLAYER_REFERENCE` is deliberately absent. It is the yardstick for "can a
 * competent player win this level"; letting a level name it as its ENEMY would
 * invalidate that proof.
 */
export const AI_PROFILES: Record<AiProfileId, AiProfile | null> = {
  none: null,
  standard: ENEMY_STANDARD,
  'level-2': LEVEL_2_ENEMY,
};

/** The profile for an id, or null when that id means "no tactical layer". */
export function profileFor(id: AiProfileId): AiProfile | null {
  return AI_PROFILES[id];
}
