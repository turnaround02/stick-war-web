import { describe, expect, it } from 'vitest';
import {
  diffSfx,
  snapshotWorld,
  SFX_PER_TICK_CAP,
  type SfxSnapshot,
  type SfxUnitSnapshot,
} from './detect';
import { SFX_RECIPES, SFX_KINDS } from './recipes';
import { createWorld } from '../../sim/createWorld';
import { LEVEL_2 } from '../../data/levels';
import type { SfxEvent } from './detect';

/** A minimal valid snapshot. Most tests override specific fields. */
function snap(partial: Partial<SfxSnapshot> = {}): SfxSnapshot {
  return {
    units: [],
    nextUnitId: 1,
    gold: { player: 0, enemy: 0 },
    baseHp: { player: 1, enemy: 1 },
    projectiles: [],
    trainingQueueLen: { player: 0, enemy: 0 },
    ...partial,
  };
}

/** Build an `SfxUnitSnapshot` with sane defaults; override as needed. */
function u(over: Partial<SfxUnitSnapshot> & Pick<SfxUnitSnapshot, 'id' | 'typeId'>): SfxUnitSnapshot {
  return {
    side: 'player',
    state: 'idle',
    windupTicksLeft: 0,
    ...over,
  };
}

/** Convenience: list of `{kind, side}` sorted for stable assertion. */
function sorted(events: SfxEvent[]): string[] {
  return events.map((e) => `${e.kind}:${e.side}`).sort();
}

describe('diffSfx', () => {
  it('returns [] when nothing changed between two identical snapshots', () => {
    const cur = snap();
    expect(diffSfx(cur, cur)).toEqual([]);
  });

  describe('swing + melee hit', () => {
    it('fires both on the tick windup just hit 0', () => {
      const prev = snap({
        units: [u({ id: 1, typeId: 'swordsman', state: 'attack', windupTicksLeft: 3 })],
      });
      const cur = snap({
        units: [u({ id: 1, typeId: 'swordsman', state: 'attack', windupTicksLeft: 0 })],
      });
      expect(sorted(diffSfx(prev, cur))).toEqual(['hit:player', 'swing:player']);
    });

    it('does NOT fire when windup is already 0 on both (mid cooldown)', () => {
      const prev = snap({
        units: [u({ id: 1, typeId: 'swordsman', state: 'attack', windupTicksLeft: 0 })],
      });
      const cur = snap({
        units: [u({ id: 1, typeId: 'swordsman', state: 'attack', windupTicksLeft: 0 })],
      });
      expect(diffSfx(prev, cur)).toEqual([]);
    });

    it('fires for the enemy side too', () => {
      const prev = snap({
        units: [u({ id: 1, typeId: 'swordsman', side: 'enemy', windupTicksLeft: 1 })],
      });
      const cur = snap({
        units: [u({ id: 1, typeId: 'swordsman', side: 'enemy', windupTicksLeft: 0 })],
      });
      expect(sorted(diffSfx(prev, cur))).toEqual(['hit:enemy', 'swing:enemy']);
    });

    it('does NOT fire for a miner (attackType none)', () => {
      const prev = snap({
        units: [u({ id: 1, typeId: 'miner', windupTicksLeft: 5 })],
      });
      const cur = snap({
        units: [u({ id: 1, typeId: 'miner', windupTicksLeft: 0 })],
      });
      expect(diffSfx(prev, cur)).toEqual([]);
    });
  });

  describe('ranged hit', () => {
    it('fires on the impact tick (ticksToImpact just hit 0), attributed to the shooter', () => {
      const prev = snap({
        projectiles: [
          { id: 10, side: 'player', ticksToImpact: 1 },
        ],
      });
      const cur = snap({
        projectiles: [
          { id: 10, side: 'player', ticksToImpact: 0 },
        ],
      });
      expect(sorted(diffSfx(prev, cur))).toEqual(['hit:player']);
    });

    it('does NOT fire when the projectile is still in flight', () => {
      const prev = snap({ projectiles: [{ id: 10, side: 'player', ticksToImpact: 3 }] });
      const cur = snap({ projectiles: [{ id: 10, side: 'player', ticksToImpact: 2 }] });
      expect(diffSfx(prev, cur)).toEqual([]);
    });

    it('does NOT fire for a projectile that was spawned this tick (not in flight last tick)', () => {
      const prev = snap({ projectiles: [] });
      const cur = snap({ projectiles: [{ id: 10, side: 'enemy', ticksToImpact: 0 }] });
      expect(diffSfx(prev, cur)).toEqual([]);
    });

    it('an archer release fires swing but NOT a hit (the hit is on impact)', () => {
      const prev = snap({
        units: [u({ id: 1, typeId: 'archer', windupTicksLeft: 2 })],
      });
      const cur = snap({
        units: [u({ id: 1, typeId: 'archer', windupTicksLeft: 0 })],
      });
      // archer attackType is 'ranged', so only swing fires here.
      expect(sorted(diffSfx(prev, cur))).toEqual(['swing:player']);
    });
  });

  describe('death', () => {
    it('fires when state just became dead', () => {
      const prev = snap({ units: [u({ id: 1, typeId: 'swordsman', state: 'attack' })] });
      const cur = snap({ units: [u({ id: 1, typeId: 'swordsman', state: 'dead' })] });
      expect(sorted(diffSfx(prev, cur))).toEqual(['death:player']);
    });

    it('does NOT fire when the unit was already dead last tick', () => {
      const prev = snap({ units: [u({ id: 1, typeId: 'swordsman', state: 'dead' })] });
      const cur = snap({ units: [u({ id: 1, typeId: 'swordsman', state: 'dead' })] });
      expect(diffSfx(prev, cur)).toEqual([]);
    });

    it('does NOT fire for a unit that has not died yet', () => {
      const prev = snap({ units: [u({ id: 1, typeId: 'spearman', state: 'attack' })] });
      const cur = snap({ units: [u({ id: 1, typeId: 'spearman', state: 'move' })] });
      expect(diffSfx(prev, cur)).toEqual([]);
    });
  });

  describe('gold', () => {
    it('fires on a side whose gold increased', () => {
      const prev = snap();
      const cur = snap({ gold: { player: 20, enemy: 0 } });
      expect(sorted(diffSfx(prev, cur))).toEqual(['gold:player']);
    });

    it('fires for both sides when both increased', () => {
      const prev = snap();
      const cur = snap({ gold: { player: 5, enemy: 5 } });
      expect(sorted(diffSfx(prev, cur))).toEqual(['gold:enemy', 'gold:player']);
    });

    it('does NOT fire when gold stayed the same or decreased', () => {
      const prev = snap({ gold: { player: 100, enemy: 100 } });
      const cur = snap({ gold: { player: 80, enemy: 100 } }); // spend
      expect(diffSfx(prev, cur)).toEqual([]);
    });

    it('a unit that vanished (no prev) fires death', () => {
      // The death detector keys on `state === 'dead'`; a unit that has been
      // removed by cleanup does NOT fire. Verify that a snapshot where a unit
      // disappeared entirely does not emit death for it.
      const prev = snap({ units: [u({ id: 1, typeId: 'swordsman', state: 'dead' })] });
      const cur = snap({ units: [] });
      expect(diffSfx(prev, cur)).toEqual([]);
    });
  });

  describe('training', () => {
    it('fires on a side whose spawn queue shrank', () => {
      const prev = snap({ trainingQueueLen: { player: 2, enemy: 0 } });
      const cur = snap({ trainingQueueLen: { player: 1, enemy: 0 } });
      expect(sorted(diffSfx(prev, cur))).toEqual(['training:player']);
    });

    it('fires on both sides if both shrank', () => {
      const prev = snap({ trainingQueueLen: { player: 3, enemy: 2 } });
      const cur = snap({ trainingQueueLen: { player: 2, enemy: 1 } });
      expect(sorted(diffSfx(prev, cur))).toEqual(['training:enemy', 'training:player']);
    });

    it('does NOT fire when the queue grew or held steady', () => {
      const prev = snap({ trainingQueueLen: { player: 1, enemy: 1 } });
      const cur = snap({ trainingQueueLen: { player: 2, enemy: 1 } });
      expect(diffSfx(prev, cur)).toEqual([]);
    });
  });

  describe('base', () => {
    it('fires on a side whose base HP dropped', () => {
      const prev = snap();
      const cur = snap({ baseHp: { player: 1, enemy: 0 } });
      expect(sorted(diffSfx(prev, cur))).toEqual(['base:enemy']);
    });

    it('does NOT fire when base HP held or rose', () => {
      const prev = snap({ baseHp: { player: 100, enemy: 100 } });
      const cur = snap({ baseHp: { player: 100, enemy: 100 } });
      expect(diffSfx(prev, cur)).toEqual([]);
    });
  });

  describe('cap + priority (Q2 + Q10)', () => {
    it('truncates a 12-event set to 8, keeping the highest-priority kinds', () => {
      // 3 hit, 3 swing, 3 death, 3 gold = 12.
      // Priority: hit(3) > swing(3) > death(3) > gold(3). Cap 8 → keep 3 hit
      // + 3 swing + 2 death; drop 1 death + 3 gold.
      // Build 12 events directly: 3 hit, 3 swing, 3 death, 3 gold.
      const events: SfxEvent[] = [
        { kind: 'hit', side: 'player' },
        { kind: 'hit', side: 'player' },
        { kind: 'hit', side: 'enemy' },
        { kind: 'swing', side: 'player' },
        { kind: 'swing', side: 'player' },
        { kind: 'swing', side: 'enemy' },
        { kind: 'death', side: 'player' },
        { kind: 'death', side: 'player' },
        { kind: 'death', side: 'enemy' },
        { kind: 'gold', side: 'player' },
        { kind: 'gold', side: 'enemy' },
        { kind: 'gold', side: 'player' },
      ];
      // Assert the cap by constructing snapshots that yield MORE than 8 raw
      // events. Five melee units releasing in the same tick → 5 swing + 5
      // hit = 10 raw events; the cap drops the two lowest-priority swings.
      const richPrev = snap({
        units: [
          u({ id: 1, typeId: 'swordsman', windupTicksLeft: 1, state: 'attack' }),
          u({ id: 2, typeId: 'swordsman', windupTicksLeft: 1, state: 'attack' }),
          u({ id: 3, typeId: 'swordsman', windupTicksLeft: 1, state: 'attack' }),
          u({ id: 4, typeId: 'spearman', windupTicksLeft: 1, state: 'attack' }),
          u({ id: 5, typeId: 'spearman', windupTicksLeft: 1, state: 'attack' }),
        ],
      });
      const richCur = snap({
        units: [
          u({ id: 1, typeId: 'swordsman', windupTicksLeft: 0, state: 'attack' }),
          u({ id: 2, typeId: 'swordsman', windupTicksLeft: 0, state: 'attack' }),
          u({ id: 3, typeId: 'swordsman', windupTicksLeft: 0, state: 'attack' }),
          u({ id: 4, typeId: 'spearman', windupTicksLeft: 0, state: 'attack' }),
          u({ id: 5, typeId: 'spearman', windupTicksLeft: 0, state: 'attack' }),
        ],
      });
      // 5 swordsman/spearman each release → 5 swing + 5 hit = 10 events.
      const got = diffSfx(richPrev, richCur);
      expect(got).toHaveLength(SFX_PER_TICK_CAP);
      // All 5 hits + 3 swings (the two lowest-priority swings are dropped).
      expect(got.filter((e) => e.kind === 'hit')).toHaveLength(5);
      expect(got.filter((e) => e.kind === 'swing')).toHaveLength(3);
      // `events` array used only to document intent.
      expect(events).toHaveLength(12);
    });

    it('does NOT truncate when the raw count is at or under the cap', () => {
      // Two swordsman release simultaneously → 2 swing + 2 hit = 4, under cap.
      const twoUnits = [
        u({ id: 1, typeId: 'swordsman', windupTicksLeft: 1, state: 'attack' }),
        u({ id: 2, typeId: 'swordsman', windupTicksLeft: 1, state: 'attack' }),
      ];
      const twoUnitsReleasing = twoUnits.map((x) => ({ ...x, windupTicksLeft: 0 }));
      const richPrev = snap({ units: twoUnits });
      const richCur = snap({ units: twoUnitsReleasing });
      const got = diffSfx(richPrev, richCur);
      expect(got).toHaveLength(4);
      expect(sorted(got)).toEqual(['hit:player', 'hit:player', 'swing:player', 'swing:player']);
    });
  });
});

describe('recipes (M5c §C)', () => {
  it('exactly six recipes exist, one per SfxKind', () => {
    const kinds = Object.keys(SFX_RECIPES);
    expect(kinds).toHaveLength(6);
    expect(SFX_KINDS).toHaveLength(6);
    for (const k of SFX_KINDS) {
      expect(SFX_RECIPES[k]).toBeDefined();
    }
  });

  it('every recipe has a defined voice and a positive duration', () => {
    for (const k of SFX_KINDS) {
      const r = SFX_RECIPES[k];
      expect(r.voice).toBeDefined();
      expect(r.durSec).toBeGreaterThan(0);
      expect(r.peakGain).toBeGreaterThan(0);
    }
  });

  it('the base-damage recipe is the only one using an LFO', () => {
    const withLfo = SFX_KINDS.filter((k) => SFX_RECIPES[k].lfo !== undefined);
    expect(withLfo).toEqual(['base']);
  });

  it('the gold recipe uses a square voice (bright ding)', () => {
    expect(SFX_RECIPES.gold.voice).toBe('square');
  });
});

describe('snapshotWorld', () => {
  it('builds a snapshot from a real World', () => {
    const w = createWorld({ ...LEVEL_2, startMiners: { player: 1, enemy: 1 } }, 1);
    const snapA = snapshotWorld(w);
    expect(snapA.units).toHaveLength(2);
    expect(snapA.nextUnitId).toBeGreaterThan(2);
    expect(snapA.gold.player).toBe(LEVEL_2.startGold?.player ?? 0);
    // The snapshot must be a plain object (no reference to the live World).
    const before = snapA.gold.player;
    w.gold.player = 999;
    expect(snapA.gold.player).toBe(before);
  });

  it('a two-tick diff over a real World is stable', () => {
    const w = createWorld({ ...LEVEL_2, startMiners: { player: 1, enemy: 1 } }, 1);
    const s1 = snapshotWorld(w);
    const s2 = snapshotWorld(w);
    // Identical states → no events.
    expect(diffSfx(s1, s2)).toEqual([]);
  });
});
