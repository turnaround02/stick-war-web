import { describe, it, expect } from 'vitest';
import { acquireTarget, shouldKeepTarget, distanceToTarget, targetX, isTargetAlive } from './targeting';
import { spawnUnit } from './spawn';
import { LOCK_BREAK_RANGE, TARGET_ACQUIRE_RANGE, PLAYER_MINE_X, ENEMY_MINE_X } from '../data/constants';
import type { Unit, World } from './types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: PLAYER_MINE_X, goldLeft: 6000 },
      enemy: { side: 'enemy', x: ENEMY_MINE_X, goldLeft: 6000 },
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
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

describe('acquireTarget', () => {
  it('finds the nearest enemy ahead', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const near = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const far = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 800 });
    const t = acquireTarget(makeWorld([me, near, far]), me);
    expect(t).toEqual({ kind: 'unit', id: 2 });
  });

  it('ignores enemies beyond the acquire range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const far = spawnUnit({
      id: 2,
      side: 'enemy',
      typeId: 'swordsman',
      x: 100 + TARGET_ACQUIRE_RANGE + 50,
    });
    expect(acquireTarget(makeWorld([me, far]), me)).toBeNull();
  });

  it('acquires an enemy exactly at the acquire range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const e = spawnUnit({
      id: 2,
      side: 'enemy',
      typeId: 'swordsman',
      x: 100 + TARGET_ACQUIRE_RANGE,
    });
    expect(acquireTarget(makeWorld([me, e]), me)).toEqual({ kind: 'unit', id: 2 });
  });

  it('ignores allies', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const friend = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 120 });
    expect(acquireTarget(makeWorld([me, friend]), me)).toBeNull();
  });

  it('ignores dead units', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const dead = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 120 });
    dead.state = 'dead';
    expect(acquireTarget(makeWorld([me, dead]), me)).toBeNull();
  });

  it('prefers ahead over behind when both are in range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const ahead = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 560 });
    const behind = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 470 });
    expect(acquireTarget(makeWorld([me, ahead, behind]), me)).toEqual({ kind: 'unit', id: 2 });
  });

  it('falls back to the enemy base when no units are around', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    const t = acquireTarget(makeWorld([me]), me);
    expect(t).toEqual({ kind: 'base', side: 'enemy' });
  });

  it('does not target a base that is out of range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    expect(acquireTarget(makeWorld([me]), me)).toBeNull();
  });

  it('never targets its own base', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 310 });
    const t = acquireTarget(makeWorld([me]), me);
    expect(t === null || (t.kind === 'base' && t.side === 'enemy')).toBe(true);
  });
});

describe('shouldKeepTarget', () => {
  it('keeps a target inside the lock-break range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({
      id: 2,
      side: 'enemy',
      typeId: 'swordsman',
      x: 500 + LOCK_BREAK_RANGE - 10,
    });
    me.target = { kind: 'unit', id: 2 };
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(true);
  });

  it('drops a target beyond the lock-break range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({
      id: 2,
      side: 'enemy',
      typeId: 'swordsman',
      x: 500 + LOCK_BREAK_RANGE + 10,
    });
    me.target = { kind: 'unit', id: 2 };
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(false);
  });

  it('has hysteresis: a target between acquire and lock-break is kept', () => {
    const mid = (TARGET_ACQUIRE_RANGE + LOCK_BREAK_RANGE) / 2;
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 500 + mid });
    me.target = { kind: 'unit', id: 2 };

    // Cannot be re-acquired from scratch at this distance...
    expect(acquireTarget(makeWorld([me, e]), me)).toBeNull();
    // ...but an existing lock survives it.
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(true);
  });

  it('drops a dead target', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    e.state = 'dead';
    me.target = { kind: 'unit', id: 2 };
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(false);
  });

  it('drops a target that no longer exists', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    me.target = { kind: 'unit', id: 999 };
    expect(shouldKeepTarget(makeWorld([me]), me)).toBe(false);
  });

  it('keeps a base target while it is alive', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    me.target = { kind: 'base', side: 'enemy' };
    expect(shouldKeepTarget(makeWorld([me]), me)).toBe(true);
  });

  it('drops a destroyed base target', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    me.target = { kind: 'base', side: 'enemy' };
    const world = makeWorld([me]);
    world.bases.enemy.hp = 0;
    expect(shouldKeepTarget(world, me)).toBe(false);
  });
});

describe('distanceToTarget', () => {
  it('measures to a unit', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 150 });
    me.target = { kind: 'unit', id: 2 };
    expect(distanceToTarget(makeWorld([me, e]), me)).toBeCloseTo(50, 10);
  });

  it('measures to a base EDGE, not its centre', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    me.target = { kind: 'base', side: 'enemy' };
    // base centre 2700, BASE_RADIUS 40 -> 100 raw, 60 to the edge. Measuring to
    // the centre would make a base unreachable for short-ranged melee, which
    // are physically held clear of it.
    expect(distanceToTarget(makeWorld([me]), me)).toBeCloseTo(60, 10);
  });

  it('returns Infinity for no target', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    expect(distanceToTarget(makeWorld([me]), me)).toBe(Infinity);
  });
});

describe('targetX', () => {
  it('resolves a unit position', () => {
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 777 });
    const world = makeWorld([e]);
    expect(targetX(world, { kind: 'unit', id: 2 })).toBe(777);
  });

  it('resolves a base position', () => {
    const world = makeWorld([]);
    expect(targetX(world, { kind: 'base', side: 'enemy' })).toBe(2700);
  });

  it('returns null for a missing unit', () => {
    expect(targetX(makeWorld([]), { kind: 'unit', id: 5 })).toBeNull();
  });
});

describe('mine targets', () => {
  it('resolves a mine position', () => {
    const world = makeWorld([]);
    expect(targetX(world, { kind: 'mine', side: 'player' })).toBe(PLAYER_MINE_X);
    expect(targetX(world, { kind: 'mine', side: 'enemy' })).toBe(ENEMY_MINE_X);
  });

  it('treats a mine with gold left as alive', () => {
    const world = makeWorld([]);
    expect(isTargetAlive(world, { kind: 'mine', side: 'player' })).toBe(true);
  });

  it('treats a depleted mine as dead', () => {
    const world = makeWorld([]);
    world.mines.player.goldLeft = 0;
    expect(isTargetAlive(world, { kind: 'mine', side: 'player' })).toBe(false);
  });

  it('measures distance to a mine from the unit', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 700 });
    u.target = { kind: 'mine', side: 'player' };
    expect(distanceToTarget(makeWorld([u]), u)).toBeCloseTo(150, 10);
  });

  it('never picks a mine as a combat target', () => {
    // acquireTarget is for combat only; miners choose their mine in aiSystem.
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const t = acquireTarget(makeWorld([u]), u);
    expect(t === null || t.kind !== 'mine').toBe(true);
  });
});
