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
 * level 2. Used by tests to assert a level is WINNABLE without a human, which
 * turns "can win level 2" from a subjective claim into a deterministic one.
 */
export const PLAYER_REFERENCE: AiProfile = {
  decisionIntervalTicks: 30,
  minerTarget: 4,
  buildOrder: ['swordsman', 'archer', 'swordsman', 'spearman'],
  advanceRatio: 0.9,
  retreatRatio: 0.35,
};
