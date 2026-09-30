/**
 * Data-domain types: the vocabulary shared between level data and the sim.
 *
 * These live in data/ rather than sim/ so the dependency arrow stays strictly
 * one-way (spec §3.2): sim imports data, never the reverse. A type-only import
 * in the other direction would be erased at runtime, but keeping the direction
 * clean means the boundary rule needs no exception.
 *
 * This file imports only from data/.
 */

import type { UnitTypeId } from './units';

export type Side = 'player' | 'enemy';

/**
 * Tactical posture. The only way to move units — there is no click-to-move
 * (spec §4.2). Lives here rather than in sim/ so MatchConfig can name it
 * without data/ importing from sim/.
 */
export type Stance = 'advance' | 'hold' | 'retreat';

/** One scheduled enemy spawn (spec §8.4). */
export interface WaveScript {
  /** Tick at which this wave spawns. */
  atTick: number;
  /** Units to spawn, as a list of type ids. */
  units: UnitTypeId[];
}

/** Everything needed to build a World. Consumed once by createWorld. */
export interface MatchConfig {
  levelId: string;
  worldWidth: number;
  baseHp: Record<Side, number>;
  mineGold: Record<Side, number>;
  startGold: Record<Side, number>;
  startMiners: Record<Side, number>;
  popCap: Record<Side, number>;
  /** `scripted` = waves only, no economy. `economy` = full two-layer AI (spec §8.4). */
  enemyAi: 'scripted' | 'economy';
  /** Scripted wave table. Empty when enemyAi is `economy`. */
  waves: WaveScript[];
  endless: boolean;
  /** Multiplier applied to enemy HP and attack. 1 = no scaling. */
  difficultyMult: number;

  /**
   * How the match is won. `annihilation` (default) is the historical rule:
   * either side's base falling OR either side's unit count reaching zero ends
   * the match. `base` requires the enemy BASE to fall — an empty enemy field is
   * not a terminal state, which matters in an economy level where the enemy
   * rebuilds.
   *
   * Deliberately NOT derived from `enemyAi`: "does the enemy have an economy"
   * and "what counts as winning" are different questions that merely happen to
   * coincide in this game's two levels.
   */
  winCondition?: 'annihilation' | 'base';

  /**
   * Explicit starting roster, listed as type ids. Takes precedence over
   * startMiners when present. Used by the balance harness to build arbitrary
   * matchups without inventing a level file per scenario.
   */
  initialUnits?: {
    player?: UnitTypeId[];
    enemy?: UnitTypeId[];
  };

  /** Gap between same-side units when spawning a roster, in px. */
  initialSpacing?: number;

  /**
   * Posture for roster-spawned units. Defaults to `advance`, because an
   * explicit roster means "these units are meant to fight"; requiring every
   * caller to remember a stance fails silently (a draw at maxTicks, not an
   * error). Miners spawned from startMiners always default to `hold`.
   */
  initialStance?: Stance;

  /**
   * Parks both bases outside the battlefield so no unit can ever reach them.
   * Used by the harness for base-less matchups: the bases stay at full hp, so
   * cleanupSystem's "base fell" condition never fires and the match is decided
   * purely by which side runs out of units.
   *
   * (Setting baseHp to 0 instead would end every such match on tick 1.)
   */
  noBases?: boolean;
}
