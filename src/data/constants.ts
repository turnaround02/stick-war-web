/**
 * Project-wide constants. Pure data — no logic, no imports.
 *
 * Data tables are written in SECONDS because that is the natural unit for
 * tuning. Everything is converted to INTEGER TICKS exactly once, at load
 * time, via toTicks(). Floating point accumulation would break determinism
 * (spec §5.1).
 */

// Type-only import: erased at compile time, so this does not create a runtime
// cycle with sim/types.ts (which imports value types from data/units.ts).
import type { ArmorType } from './units';
import type { Stance, UnitState } from '../sim/types';

/** Logic frames per second. Fixed — never make this dynamic. */
export const TICKS_PER_SEC = 30;

/** Converts a duration in seconds to whole logic ticks. */
export function toTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds * TICKS_PER_SEC));
}

// ── Battlefield geometry ────────────────────────────────────────────
/** Total width of the battlefield in px. Units are clamped to [0, WORLD_WIDTH]. */
export const WORLD_WIDTH = 3000;

/** Player base centre. */
export const PLAYER_BASE_X = 300;
/** Enemy base centre. */
export const ENEMY_BASE_X = 2700;

/**
 * Player gold mine, 250px toward the battlefield from the player base.
 *
 * NOT behind the base: M2's corridor clamps units to
 * [base + BASE_RADIUS + r, ...], so a miner could never reach a mine placed
 * behind its own base and the gather cycle could not start. Placing it on the
 * battlefield side also keeps the mine threatenable without requiring an enemy
 * to walk through a base.
 */
export const PLAYER_MINE_X = 550;
/** Enemy gold mine, 250px toward the battlefield from the enemy base. */
export const ENEMY_MINE_X = 2450;

// ── Bases, economy, population (spec §8.3) ──────────────────────────
export const BASE_HP = 3000;
export const BASE_ARMOR = 10;

/** Bases count as heavy armour, so anti-heavy bonuses apply against them. */
export const BASE_ARMOR_TYPE: ArmorType = 'heavy';

export const BASE_RADIUS = 40;

/** Population cap per side. */
export const POP_CAP = 60;

/** Gold stored in each side's mine. */
export const MINE_GOLD = 6000;

/** Gold each side starts with. */
export const START_GOLD = 200;

// ── Targeting (spec §6.4) ───────────────────────────────────────────
/** How far ahead a unit looks for a new target. */
export const TARGET_ACQUIRE_RANGE = 500;

/**
 * Distance at which a lock is dropped. Must exceed TARGET_ACQUIRE_RANGE or a
 * unit sitting exactly at the acquire boundary would re-acquire and drop its
 * target every tick, jittering between choices.
 */
export const LOCK_BREAK_RANGE = 700;

/** Slack around "directly ahead" when searching, so units on the same X still engage. */
export const TARGET_TOLERANCE = 20;

// ── Separation (spec §6.2) ──────────────────────────────────────────
/** Overlap tolerated before a push is applied. Sub-pixel jitter guard. */
export const SEPARATION_EPSILON = 0.5;

/**
 * Yield weights. HIGHER means the unit gives way MORE.
 *
 * A unit with weight w yields the fraction w / (self + other) of the overlap,
 * so weight 0 yields nothing (immovable). The two fractions always sum to 1,
 * so the overlap is exactly resolved in one pass.
 *
 * The ordering matters and each step has a reason:
 *   BASE    0     - immovable obstacle
 *   RETREAT 0.25  - must push through its own line, or `retreat` does nothing
 *   BUSY    0.5   - gathering / stunned units cannot step aside on their own
 *   ATTACK  1.0   - has weight but stays pushable; making it 0 would form a
 *                   zombie wall and break the back-rank design (R2)
 *   IDLE    1.5   - easiest to shove
 */
export const YIELD_BASE = 0;
export const YIELD_RETREAT = 0.25;
export const YIELD_BUSY = 0.5;
export const YIELD_ATTACK = 1.0;
export const YIELD_IDLE = 1.5;

/** How much a unit gives way when pushed. See the weight table above. */
export function yieldWeight(state: UnitState, stance: Stance, isBase: boolean): number {
  if (isBase) return YIELD_BASE;
  if (stance === 'retreat') return YIELD_RETREAT;
  if (state === 'gather' || state === 'stunned') return YIELD_BUSY;
  if (state === 'attack') return YIELD_ATTACK;
  return YIELD_IDLE;
}
