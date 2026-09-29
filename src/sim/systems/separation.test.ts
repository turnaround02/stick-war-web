import { describe, it, expect } from 'vitest';
import { separationSystem } from './separation';
import { spawnUnit } from '../spawn';
import { UNITS } from '../../data/units';
import { SEPARATION_EPSILON } from '../../data/constants';
import type { TickContext, World } from '../types';

/** Minimal world stub: separation only reads units, bases and worldWidth. */
function makeWorld(units: World['units'], worldWidth = 3000): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 1, maxHp: 1 },
      enemy: { side: 'enemy', x: 2700, hp: 1, maxHp: 1 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    waves: [],
    aiProfile: 'none',
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth,
    difficultyMult: 1,
    endless: false,
  };
}

function ctx(world: World): TickContext {
  return { world, commands: [] };
}

describe('separationSystem', () => {
  it('leaves well-separated units untouched', () => {
    // Inside the corridor between the bases (player 300, enemy 2700).
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 800 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 900 });
    separationSystem(ctx(makeWorld([a, b])));
    expect(a.x).toBe(800);
    expect(b.x).toBe(900);
  });

  it('pushes overlapping allies apart', () => {
    const r = UNITS.swordsman.bodyRadius; // 14, minGap 28
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 110 });
    separationSystem(ctx(makeWorld([a, b])));
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(2 * r - SEPARATION_EPSILON);
  });

  it('resolves a chain of three overlapping allies in one call', () => {
    const r = UNITS.swordsman.bodyRadius;
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 105 });
    const c = spawnUnit({ id: 3, side: 'player', typeId: 'swordsman', x: 110 });
    separationSystem(ctx(makeWorld([a, b, c])));
    const sorted = [a, b, c].sort((p, q) => p.x - q.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x - sorted[i - 1].x).toBeGreaterThanOrEqual(2 * r - SEPARATION_EPSILON);
    }
  });

  it('gives way asymmetrically: the retreating unit barely moves', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 800, stance: 'hold' });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 810, stance: 'retreat' });
    const aBefore = a.x;
    const bBefore = b.x;
    separationSystem(ctx(makeWorld([a, b])));
    const aMoved = Math.abs(a.x - aBefore);
    const bMoved = Math.abs(b.x - bBefore);
    // The idle unit must give way more than the retreating one.
    expect(aMoved).toBeGreaterThan(bMoved);
  });

  it('treats a base as an immovable obstacle', () => {
    // Player base sits at x=300 with bodyRadius 40.
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 300 });
    separationSystem(ctx(makeWorld([u])));
    expect(u.x).toBeGreaterThan(300);
  });

  it('does not let enemies interpenetrate', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 110 });
    separationSystem(ctx(makeWorld([a, b])));
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(28 - SEPARATION_EPSILON);
  });

  it('clamps units to the world bounds', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 1 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 2 });
    const world = makeWorld([a, b], 3000);
    separationSystem(ctx(world));
    for (const u of world.units) {
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(world.worldWidth);
    }
  });

  it('is deterministic regardless of input array order', () => {
    // Each id keeps a FIXED x; only its index in the array varies. Varying x
    // with the array index would change the initial world, not just its
    // ordering, and the test would then be measuring the wrong thing.
    const positionOf: Record<number, number> = { 1: 100, 2: 103, 3: 106 };
    const build = (order: number[]) => {
      const units = order.map((id) =>
        spawnUnit({ id, side: 'player', typeId: 'swordsman', x: positionOf[id] }),
      );
      const world = makeWorld(units);
      separationSystem(ctx(world));
      return world.units
        .map((u) => `${u.id}:${u.x.toFixed(6)}`)
        .sort()
        .join(',');
    };
    expect(build([1, 2, 3])).toBe(build([3, 1, 2]));
    expect(build([1, 2, 3])).toBe(build([2, 3, 1]));
  });

  it('produces no NaN positions', () => {
    const units = Array.from({ length: 20 }, (_, i) =>
      spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 100 + i * 0.5 }),
    );
    const world = makeWorld(units);
    separationSystem(ctx(world));
    for (const u of world.units) expect(Number.isFinite(u.x)).toBe(true);
  });
});

/**
 * The miner exemption (M4a).
 *
 * The battlefield is one lane with the mine at one end and the base at the
 * other, so miners travel both ways while the combat line holds position
 * between them. Head-on units cannot pass — integration closes the gap and
 * separation reopens it, cancelling exactly — so before this rule the economy
 * deadlocked after the first load (1 miner 2.33 gold/s, 12 miners 0.22/s and
 * then nothing).
 *
 * These tests exist because that fix shipped with no direct coverage: it was
 * exercised only through economy totals, in the file AGENTS.md notes has
 * produced two silent, test-invisible bugs already.
 *
 * `separationSystem` reads travel direction from `x - prevX`, so a moving unit
 * is simulated by setting `prevX` behind its current x.
 */
describe('separationSystem — miner exemption', () => {
  const MINER_R = UNITS.miner.bodyRadius; // 10
  const SWORD_R = UNITS.swordsman.bodyRadius; // 14

  /** A miner travelling right (outbound) or left (homeward). */
  function movingMiner(id: number, x: number, dir: 1 | -1) {
    const m = spawnUnit({ id, side: 'player', typeId: 'miner', x, stance: 'advance' });
    m.prevX = x - dir; // one px behind => travelling in `dir`
    return m;
  }

  it('lets a head-on miner pair pass through instead of blocking', () => {
    // Outbound at 400, homeward at 410: 10px apart, well inside the 20px gap.
    const out = movingMiner(1, 400, 1);
    const home = movingMiner(2, 410, -1);
    const world = makeWorld([out, home]);
    separationSystem(ctx(world));
    // Unchanged: neither was pushed, so they can keep moving past each other.
    expect(out.x).toBe(400);
    expect(home.x).toBe(410);
  });

  it('resolves the head-on pair to a real pass-through after a tick of motion', () => {
    // The end-to-end shape: two miners walking at each other must end up having
    // swapped sides, which is impossible if separation blocks them.
    const out = movingMiner(1, 400, 1);
    const home = movingMiner(2, 410, -1);
    const world = makeWorld([out, home]);
    for (let i = 0; i < 30; i++) {
      for (const u of world.units) {
        u.prevX = u.x;
        u.x += u.typeId === 'miner' && u.id === 1 ? 1 : -1;
      }
      separationSystem(ctx(world));
    }
    expect(out.x, 'the outbound miner should now be past the homeward one').toBeGreaterThan(home.x);
  });

  it('still separates two miners travelling the SAME way', () => {
    // Otherwise a crowd stacks on one pixel at the seam.
    const a = movingMiner(1, 400, 1);
    const b = movingMiner(2, 410, 1);
    const world = makeWorld([a, b]);
    separationSystem(ctx(world));
    expect(b.x - a.x).toBeGreaterThanOrEqual(2 * MINER_R - SEPARATION_EPSILON);
  });

  it('does not separate a miner from a combat unit, either direction', () => {
    // A holding soldier must not be shoved by the miner stream (it was pushed
    // 7px backward and the line never advanced), and a homeward miner must not
    // be blocked by its own front line.
    const miner = movingMiner(1, 400, 1);
    const soldier = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 410, stance: 'hold' });
    const world = makeWorld([miner, soldier]);
    separationSystem(ctx(world));
    expect(miner.x).toBe(400);
    expect(soldier.x).toBe(410);
  });

  it('does not separate a homeward miner from a combat unit it is walking into', () => {
    const miner = movingMiner(1, 410, -1);
    const soldier = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 400, stance: 'hold' });
    const world = makeWorld([miner, soldier]);
    separationSystem(ctx(world));
    expect(miner.x).toBe(410);
    expect(soldier.x).toBe(400);
  });

  it('still separates two combat units fully, with miners present', () => {
    // The archer screen depends on this, and it must hold even when miners are
    // in the same group (which is what triggers the re-sort).
    const miner = movingMiner(1, 200, 1);
    const a = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 600 });
    const b = spawnUnit({ id: 3, side: 'player', typeId: 'swordsman', x: 610 });
    const world = makeWorld([miner, a, b]);
    separationSystem(ctx(world));
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(2 * SWORD_R - SEPARATION_EPSILON);
  });

  it('leaves no combat-vs-combat overlap in a mixed group of many units', () => {
    // The residual-overlap sweep's correctness argument needs the array sorted
    // by x. Miners trigger a re-sort, so this checks that the guarantee survives
    // it: every adjacent combat pair must respect the minimum gap.
    const units = [];
    for (let i = 0; i < 8; i++) {
      units.push(movingMiner(i + 1, 400 + i * 3, i % 2 === 0 ? 1 : -1));
    }
    for (let i = 0; i < 8; i++) {
      units.push(
        spawnUnit({ id: 100 + i, side: 'player', typeId: 'swordsman', x: 500 + i * 3 }),
      );
    }
    const world = makeWorld(units);
    separationSystem(ctx(world));

    const soldiers = world.units
      .filter((u) => u.typeId === 'swordsman')
      .sort((p, q) => p.x - q.x);
    for (let i = 1; i < soldiers.length; i++) {
      expect(
        soldiers[i].x - soldiers[i - 1].x,
        `soldiers ${i - 1}/${i} overlapped`,
      ).toBeGreaterThanOrEqual(2 * SWORD_R - SEPARATION_EPSILON);
    }
  });

  it('treats a stationary miner as non-head-on against another stationary miner', () => {
    // prevX === x means no travel, so the pair is NOT head-on and must separate
    // normally — this is the case that keeps a crowd from collapsing.
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'miner', x: 405 });
    const world = makeWorld([a, b]);
    separationSystem(ctx(world));
    expect(b.x - a.x).toBeGreaterThanOrEqual(2 * MINER_R - SEPARATION_EPSILON);
  });
});
