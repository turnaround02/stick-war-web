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
}
