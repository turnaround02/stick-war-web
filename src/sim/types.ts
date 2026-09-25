/**
 * Core simulation types. Type-only file — no runtime code.
 *
 * Nothing in here may reference Phaser. The renderer reads these shapes but
 * never writes them back (spec §3.1).
 *
 * Dependency direction is strictly one-way: sim -> data (spec §3.2). The
 * data-domain unions (UnitTypeId, ArmorType) live in data/units.ts, which
 * imports nothing from sim.
 */

import type { ArmorType, UnitTypeId } from '../data/units';

export type { ArmorType, UnitTypeId };

export type Side = 'player' | 'enemy';

/** Reserved: `stunned` has no producer in v1 but is the mount point for future control effects. */
export type UnitState = 'idle' | 'move' | 'gather' | 'attack' | 'stunned' | 'dead';

/** Tactical posture. The only way to move units — there is no click-to-move (spec §4.2). */
export type Stance = 'advance' | 'hold' | 'retreat';

export interface Unit {
  id: number;
  side: Side;
  typeId: UnitTypeId;
  /** Current X in px. */
  x: number;
  /** X at the start of this tick. Used ONLY by the renderer for interpolation. */
  prevX: number;
  hp: number;
  state: UnitState;
  /** Tick at which the current state was entered. Lets the renderer derive animation progress. */
  stateEnteredTick: number;
  stance: Stance;
  /** Locked target. Null when idle with no target (spec §6.4). */
  targetId: number | null;
  /** Wind-up ticks remaining. 0 means the unit may strike. Sync point for animation + sfx. */
  windupTicksLeft: number;
  /** Attack cooldown ticks remaining. */
  cooldownTicksLeft: number;
  /** Ticks left in the current gather action (miners only). */
  gatherTicksLeft: number;
  /** Gold currently carried (miners only). */
  carrying: number;
  /** Ticks left in a stun. Reserved — no producer in v1. */
  stunTicksLeft: number;
}

export interface Base {
  side: Side;
  x: number;
  hp: number;
  maxHp: number;
}

export interface Mine {
  side: Side;
  x: number;
  goldLeft: number;
}

/** Purely logical projectile. The renderer may draw a trail but sim never depends on it. */
export interface Projectile {
  id: number;
  side: Side;
  x: number;
  targetId: number;
  damage: number;
  /** Ticks until the projectile lands and resolves damage. */
  ticksToImpact: number;
}

export type Outcome = 'ongoing' | 'playerWin' | 'playerLose';

export interface World {
  tick: number;
  /** Serialised PRNG state — travels with the world so replays resume exactly (spec §5.2). */
  rngState: number;
  units: Unit[];
  nextUnitId: number;
  bases: Record<Side, Base>;
  mines: Record<Side, Mine>;
  projectiles: Projectile[];
  nextProjectileId: number;
  gold: Record<Side, number>;
  popUsed: Record<Side, number>;
  trainingQueue: Record<Side, TrainingOrder[]>;
  /** Index of the next wave to spawn (scripted levels). */
  waveIndex: number;
  /** Tick at which the next wave should spawn. */
  nextWaveTick: number;
  outcome: Outcome;
  levelId: string;
}

export interface TrainingOrder {
  typeId: UnitTypeId;
  /** Ticks remaining until the unit appears. */
  ticksLeft: number;
}

export interface WaveScript {
  /** Tick at which this wave spawns. */
  atTick: number;
  /** Units to spawn, as a list of type ids. */
  units: UnitTypeId[];
}

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

/**
 * Input to the simulation. The ONLY way the outside world affects sim state.
 * Player commands and AI commands share this exact type, which is what makes
 * the AI fair — it is literally pressing the same buttons (spec §9.1).
 */
export type Command =
  | { kind: 'train'; side: Side; typeId: UnitTypeId }
  | { kind: 'setStance'; side: Side; unitIds: number[]; stance: Stance };
