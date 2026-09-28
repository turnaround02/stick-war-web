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
