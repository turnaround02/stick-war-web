/**
 * A tactical AI's tunable knobs (spec §9.1).
 *
 * The spec's difficulty lever is "the decision frequency and how greedy the
 * script is", not a smarter algorithm — so a profile IS the difficulty. Two
 * profiles ship: the enemy's, and a "reference player" used to prove a level is
 * winnable without a human.
 */

import type { UnitTypeId } from '../data/units';

export interface AiProfile {
  /** Ticks between tactical decisions. 30 = once a second. */
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
 * Deliberately slower than the reference player: spec §8.4 wants level 2 to be
 * winnable, and the difficulty knob is decision frequency.
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
