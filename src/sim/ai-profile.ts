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
 * 2, five seeds each (M4b Task 7). Criteria: the reference player must win every
 * seed — a level that cannot be won is not a level — AND the match must land in
 * the 3-6 minute window of spec §8.4.3, as close to its centre as possible.
 *
 * Sweep (minerTarget / interval -> seconds; all five seeds identical):
 *   4/30 152 · 4/45 136 · 4/60 143
 *   5/30 149 · 5/45 154 · 5/60 144
 *   6/30 174 · 6/45 207 · 6/60 216
 *   7/30 192 · 7/45 206 · 7/60 189
 *   8/30 276 · 8/45 334 · 8/60 217   <- chosen: 8/30, nearest the 270s centre
 *
 * Two earlier sweeps of this same grid were WRONG, and the reason matters more
 * than the numbers, because both mistakes produced plausible-looking tables:
 *
 *   1. Driving both sides from the test's own loop gave 211s where the truth is
 *      216s. The loop applied the player's commands before the enemy's, while
 *      `commandsSystem` consumes the AI's first; that ordering difference alone
 *      moved results by tens of seconds. A sweep must exercise the mechanism
 *      the game runs, so this one repoints the registry entry and lets
 *      `runMatch` drive the enemy normally.
 *   2. Even then, spreading `PLAYER_REFERENCE` as the base meant the sweep used
 *      advanceRatio 0.9 / retreatRatio 0.35 while the shipped profile uses
 *      1.0 / 0.4 — so the table described a profile that does not exist. The
 *      sweep must vary its knobs on top of the EXACT base it intends to ship.
 *
 * Both were caught only because a test pinned the duration and disagreed with
 * the comment. Do not hand-tune these without re-running the sweep.
 */
/**
 * Level-3 enemy profile. Swept on `minerTarget × decisionIntervalTicks`
 * to target: reference player wins on all 5 seeds, duration 3–6 min.
 * (Same methodology as LEVEL_2_ENEMY sweep.)
 *
 * Measured: mt=7 iv=30 → 281 s on all 5 seeds. Swept 2026-10-17.
 *
 * M10 (2026-10-25): buildOrder gains giant+mage — the level-3 economy was
 * swept to startGold 300 / 5 miners so the 400-gold giant is actually
 * affordable (peak was 150 at the old economy; see levels.ts). With the buff,
 * the sweep re-measured 280 s → 192 s on all 5 seeds; the nextBuildType
 * "unaffordable stall" gap never triggered (verified by a train-ledger probe:
 * the enemy built giant:1 in every candidate cell that could afford it).
 */
export const LEVEL_3_ENEMY: AiProfile = {
  decisionIntervalTicks: 30,
  minerTarget: 7,
  buildOrder: ['miner', 'swordsman', 'archer', 'giant', 'mage'],
  advanceRatio: 1.0,
  retreatRatio: 0.4,
};

export const LEVEL_2_ENEMY: AiProfile = {
  decisionIntervalTicks: 30,
  minerTarget: 8,
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
  'level-3': LEVEL_3_ENEMY,
};

/** The profile for an id, or null when that id means "no tactical layer". */
export function profileFor(id: AiProfileId): AiProfile | null {
  return AI_PROFILES[id];
}
