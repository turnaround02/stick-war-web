/**
 * Core simulation types. Type-only file — no runtime code.
 *
 * Nothing in here may reference Phaser. The renderer reads these shapes but
 * never writes them back (spec §3.1).
 *
 * Dependency direction is strictly one-way: sim -> data (spec §3.2). The
 * data-domain unions and MatchConfig live in data/, which imports nothing
 * from sim.
 */

import type { ArmorType, UnitTypeId } from '../data/units';
import type { MatchConfig, Side, Stance, WaveScript } from '../data/types';

export type { ArmorType, MatchConfig, Side, Stance, UnitTypeId, WaveScript };

/** Reserved: `stunned` has no producer in v1 but is the mount point for future control effects. */
export type UnitState = 'idle' | 'move' | 'gather' | 'attack' | 'stunned' | 'dead';

/**
 * What a unit is currently heading for or attacking. A discriminated union
 * rather than a numeric id so the type system forces every consumer to handle
 * bases — units attacking the enemy base is core gameplay, not an edge case.
 *
 * `mine` exists for navigation, not combat: a miner's "go home" leg is
 * expressed as targeting its own base, so `target` alone decides where any
 * unit is going and movementSystem needs no miner-specific branch.
 */
export type TargetRef =
  | { kind: 'unit'; id: number }
  | { kind: 'base'; side: Side }
  | { kind: 'mine'; side: Side }
  | null;

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
  target: TargetRef;
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
  /** X at the start of this tick. Used ONLY by the renderer for interpolation. */
  prevX: number;
  targetId: number;
  damage: number;
  /** Ticks until the projectile lands and resolves damage. */
  ticksToImpact: number;
}

/** Per-side accumulators for the balance harness (spec §6.7). */
export interface SideStats {
  /** Total damage this side has dealt to the other side's units and base. */
  damageDealt: number;
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
  popCap: Record<Side, number>;
  trainingQueue: Record<Side, TrainingOrder[]>;
  /** Per-side combat accumulators. Serialised with the world. */
  stats: Record<Side, SideStats>;
  /** Index of the next wave to spawn (scripted levels). */
  waveIndex: number;
  /** Tick at which the next wave should spawn. */
  nextWaveTick: number;
  /**
   * Scripted wave table, copied off MatchConfig so cleanup can tell whether more
   * enemy units are still due. Empty for economy-only matches.
   */
  waves: WaveScript[];
  /**
   * Which tactical profile the enemy runs. Derived from MatchConfig.enemyAi.
   * `none` means no tactical layer at all — the right setting for a scripted
   * level (no enemy economy) and for the balance harness, which measures pure
   * unit matchups and must not have an AI spend gold or issue stance orders.
   */
  aiProfile: 'none' | 'standard';
  outcome: Outcome;
  levelId: string;

  // ── Match environment ────────────────────────────────────────────
  // These are copied off MatchConfig at construction so the systems can reach
  // them. Without worldWidth the separation step cannot clamp unit positions
  // to the battlefield (spec §6.2), and without popCap / difficultyMult the
  // economy and AI rules have no source for their limits (spec §8.3, §8.4).
  /** Battlefield width. Units are clamped to [0, worldWidth]. */
  worldWidth: number;
  /** Multiplier on enemy hp and attack. 1 = no scaling. */
  difficultyMult: number;
  /** Endless mode: waves are generated procedurally rather than scripted. */
  endless: boolean;
}

export interface TrainingOrder {
  typeId: UnitTypeId;
  /** Ticks remaining until the unit appears. */
  ticksLeft: number;
}

/**
 * Input to the simulation. The ONLY way the outside world affects sim state.
 * Player commands and AI commands share this exact type, which is what makes
 * the AI fair — it is literally pressing the same buttons (spec §9.1).
 */
export type Command =
  | { kind: 'train'; side: Side; typeId: UnitTypeId }
  | { kind: 'setStance'; side: Side; unitIds: number[]; stance: Stance };

/**
 * What every tick system receives.
 *
 * Lives here rather than in tick.ts because tick.ts imports the systems while
 * the systems need this type — putting it in tick.ts would make the dependency
 * direction circular, with the orchestrator depending on its own consumers.
 */
export interface TickContext {
  world: World;
  commands: Command[];
}

/** A single step of the tick pipeline. */
export type TickSystem = (ctx: TickContext) => void;
