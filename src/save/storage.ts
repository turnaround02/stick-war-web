/**
 * The localStorage save: progress, endless best wave, speed preference.
 *
 * Kept Phaser-free and free of any browser global at import time (the storage
 * is passed in), so the whole read/write path is unit-testable against an
 * in-memory stub — and so a hostile storage (private mode, disabled storage)
 * is exercised in tests rather than discovered in production.
 *
 * Rules from spec §10.1.1 / §13.9 Q10:
 *  - ONE key, `stick-war-web:save`, holding JSON with a `version` field.
 *  - Reads MUST tolerate anything: absent, corrupt, wrong version, wrong shape,
 *    even a getItem that throws. Any problem falls back silently — never throws,
 *    never leaves the game unplayable.
 *  - Writes are try/caught (quota / private mode can throw).
 *  - No in-progress match is stored; "resume" means restarting the furthest
 *    level reached.
 */

export const SAVE_KEY = 'stick-war-web:save';

/** Bump when the shape changes; a mismatch is treated as "no save". */
export const SAVE_VERSION = 1;

export type GameSpeedPref = 1 | 2 | 4;

export interface SaveData {
  version: number;
  /** Furthest level index reached (progress = furthest unlocked). */
  furthestLevel: number;
  /** Best wave reached in endless mode. */
  endlessBestWave: number;
  /** Preferred game speed, applied at the start of a match. */
  speedPreference: GameSpeedPref;
}

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  furthestLevel: 0,
  endlessBestWave: 0,
  speedPreference: 1,
};

/** The subset of the Storage API this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SPEED_PREFS: readonly GameSpeedPref[] = [1, 2, 4];

function isSpeedPref(v: unknown): v is GameSpeedPref {
  return typeof v === 'number' && (SPEED_PREFS as readonly number[]).includes(v);
}

function asNonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/**
 * Reads the save, merging whatever is valid over the defaults.
 *
 * Every failure mode collapses to "use the default for that field": a corrupt
 * blob yields the default save, a blob missing `speedPreference` keeps its
 * other fields and defaults only the missing one.
 */
export function loadSave(storage: StorageLike): SaveData {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw == null) return { ...DEFAULT_SAVE };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULT_SAVE };
    }

    const obj = parsed as Record<string, unknown>;
    if (obj.version !== SAVE_VERSION) return { ...DEFAULT_SAVE };

    return {
      version: SAVE_VERSION,
      furthestLevel: asNonNegInt(obj.furthestLevel, DEFAULT_SAVE.furthestLevel),
      endlessBestWave: asNonNegInt(obj.endlessBestWave, DEFAULT_SAVE.endlessBestWave),
      speedPreference: isSpeedPref(obj.speedPreference)
        ? obj.speedPreference
        : DEFAULT_SAVE.speedPreference,
    };
  } catch {
    // Corrupt JSON, a throwing getItem, anything else: the game must still run.
    return { ...DEFAULT_SAVE };
  }
}

/** Writes the save. Never throws; a failed write is not worth interrupting play. */
export function saveGame(storage: StorageLike, data: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded / private mode: drop the write silently.
  }
}

/**
 * The furthest level after finishing `wonLevelIndex`, advancing ONLY on a win.
 *
 * Losing does not unlock anything, and progress never regresses (replaying an
 * earlier level and losing must not lock a later one back up).
 */
export function advanceFurthestLevel(current: number, wonLevelIndex: number, won: boolean): number {
  if (!won) return current;
  return Math.max(current, wonLevelIndex);
}

/** The best wave after reaching `wave`: the maximum, never a regression. */
export function recordBestWave(current: number, wave: number): number {
  return Math.max(current, wave);
}
