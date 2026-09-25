/**
 * Project-wide constants. Pure data — no logic, no imports.
 *
 * Data tables are written in SECONDS because that is the natural unit for
 * tuning. Everything is converted to INTEGER TICKS exactly once, at load
 * time, via toTicks(). Floating point accumulation would break determinism
 * (spec §5.1).
 */

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

/** Player gold mine, 250px behind the player base (spec §7.2). */
export const PLAYER_MINE_X = 50;
/** Enemy gold mine, 250px behind the enemy base. */
export const ENEMY_MINE_X = 2950;

// ── Bases, economy, population (spec §8.3) ──────────────────────────
export const BASE_HP = 3000;
export const BASE_ARMOR = 10;
export const BASE_RADIUS = 40;

/** Population cap per side. */
export const POP_CAP = 60;

/** Gold stored in each side's mine. */
export const MINE_GOLD = 6000;

/** Gold each side starts with. */
export const START_GOLD = 200;
