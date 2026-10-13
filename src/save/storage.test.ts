import { describe, it, expect } from 'vitest';
import {
  SAVE_KEY,
  DEFAULT_SAVE,
  loadSave,
  saveGame,
  advanceFurthestLevel,
  recordBestWave,
  type SaveData,
  type StorageLike,
} from './storage';

/** An in-memory Storage, so the tests never touch a real browser. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

describe('DEFAULT_SAVE', () => {
  it('is a fresh, zeroed save', () => {
    expect(DEFAULT_SAVE).toEqual({
      version: 1,
      furthestLevel: 0,
      endlessBestWave: 0,
      speedPreference: 1,
    });
  });
});

describe('loadSave', () => {
  it('returns the default when the key is absent', () => {
    expect(loadSave(memoryStorage())).toEqual(DEFAULT_SAVE);
  });

  it('returns the default on corrupt JSON, without throwing', () => {
    const s = memoryStorage({ [SAVE_KEY]: '{ not json' });
    expect(() => loadSave(s)).not.toThrow();
    expect(loadSave(s)).toEqual(DEFAULT_SAVE);
  });

  it('returns the default when version does not match', () => {
    const s = memoryStorage({
      [SAVE_KEY]: JSON.stringify({ version: 999, furthestLevel: 2, endlessBestWave: 9, speedPreference: 4 }),
    });
    expect(loadSave(s)).toEqual(DEFAULT_SAVE);
  });

  it('keeps valid fields and falls back on missing ones', () => {
    // A partially-written save (older shape, or a field removed later) must not
    // blank the whole thing — only the missing field falls back.
    const s = memoryStorage({
      [SAVE_KEY]: JSON.stringify({ version: 1, furthestLevel: 2 }),
    });
    const out = loadSave(s);
    expect(out.furthestLevel).toBe(2);
    expect(out.endlessBestWave).toBe(DEFAULT_SAVE.endlessBestWave);
    expect(out.speedPreference).toBe(DEFAULT_SAVE.speedPreference);
  });

  it('rejects a non-object payload', () => {
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify([1, 2, 3]) });
    expect(loadSave(s)).toEqual(DEFAULT_SAVE);
  });

  it('rejects a null payload', () => {
    const s = memoryStorage({ [SAVE_KEY]: 'null' });
    expect(loadSave(s)).toEqual(DEFAULT_SAVE);
  });

  it('falls back on a garbage speedPreference', () => {
    const s = memoryStorage({
      [SAVE_KEY]: JSON.stringify({ version: 1, furthestLevel: 1, endlessBestWave: 3, speedPreference: 7 }),
    });
    const out = loadSave(s);
    expect(out.speedPreference).toBe(DEFAULT_SAVE.speedPreference);
    expect(out.furthestLevel).toBe(1);
  });

  it('survives a storage whose getItem throws', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(() => loadSave(hostile)).not.toThrow();
    expect(loadSave(hostile)).toEqual(DEFAULT_SAVE);
  });
});

describe('saveGame', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    const data: SaveData = { version: 1, furthestLevel: 2, endlessBestWave: 12, speedPreference: 4 };
    saveGame(s, data);
    expect(loadSave(s)).toEqual(data);
  });

  it('does not throw when setItem throws (private mode)', () => {
    const hostile: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveGame(hostile, DEFAULT_SAVE)).not.toThrow();
  });
});

describe('advanceFurthestLevel', () => {
  const MAX = 2; // three levels: indices 0,1,2 (endless is last, not winnable)

  it('unlocks the NEXT level on a win', () => {
    expect(advanceFurthestLevel(0, 0, true, MAX)).toBe(1);
    expect(advanceFurthestLevel(1, 1, true, MAX)).toBe(2);
  });

  it('advances nothing on a loss', () => {
    expect(advanceFurthestLevel(1, 1, false, MAX)).toBe(1);
  });

  it('never regresses when replaying an earlier level', () => {
    expect(advanceFurthestLevel(2, 0, true, MAX)).toBe(2);
  });

  it('caps at the last campaign level', () => {
    // Beating the final campaign level must not land the player on endless.
    expect(advanceFurthestLevel(1, MAX, true, MAX)).toBe(MAX);
  });
});

describe('recordBestWave', () => {
  it('keeps the maximum', () => {
    expect(recordBestWave(12, 8)).toBe(12);
    expect(recordBestWave(12, 20)).toBe(20);
  });
});
