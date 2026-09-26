import { describe, it, expect } from 'vitest';
import { aiSystem } from './ai';
import { spawnUnit } from '../spawn';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { TickContext, Unit, World } from '../types';

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
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });

describe('aiSystem', () => {
  it('acquires a target when idle and one is in range', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'unit', id: 2 });
  });

  it('enters attack when already within range', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('attack');
  });

  it('enters move when the target is out of range', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('move');
  });

  it('starts a windup once in attack range and off cooldown', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(UNIT_TICKS.swordsman.windup);
  });

  it('does not restart a windup that is already running', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    a.windupTicksLeft = 5;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(5);
  });

  it('does not start a windup while on cooldown', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.cooldownTicksLeft = 10;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(0);
  });

  it('keeps an existing lock even when a closer enemy appears', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const locked = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const closer = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.target = { kind: 'unit', id: 2 };
    a.state = 'move';
    const world = makeWorld([a, locked, closer]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'unit', id: 2 });
  });

  it('drops a lock that exceeded the break range and re-acquires', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const fleeing = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 500 + 800 });
    const fresh = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 560 });
    a.target = { kind: 'unit', id: 2 };
    a.state = 'move';
    const world = makeWorld([a, fleeing, fresh]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'unit', id: 3 });
  });

  it('sets stateEnteredTick when the state changes', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, e]);
    world.tick = 42;
    aiSystem(ctx(world));
    expect(a.state).toBe('move');
    expect(a.stateEnteredTick).toBe(42);
  });

  it('does not touch dead units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('dead');
  });

  it('does not touch stunned units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'stunned';
    a.stunTicksLeft = 5;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('stunned');
    expect(a.stunTicksLeft).toBe(4);
  });

  it('returns to idle when no target can be found', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'hold' });
    a.state = 'move';
    a.target = null;
    const world = makeWorld([a]);
    aiSystem(ctx(world));
    expect(a.state).toBe('idle');
  });

  it('targets the enemy base under advance when no units remain', () => {
    const a = spawnUnit({
      id: 1,
      side: 'player',
      typeId: 'swordsman',
      x: 2600,
      stance: 'advance',
    });
    const world = makeWorld([a]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'base', side: 'enemy' });
  });

  it('does not target the enemy base under retreat', () => {
    const a = spawnUnit({
      id: 1,
      side: 'player',
      typeId: 'swordsman',
      x: 2600,
      stance: 'retreat',
    });
    const world = makeWorld([a]);
    aiSystem(ctx(world));
    expect(a.target).toBeNull();
  });

  it('is deterministic across repeated calls on identical worlds', () => {
    const build = () => {
      const units = [
        spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 }),
        spawnUnit({ id: 2, side: 'enemy', typeId: 'archer', x: 640 }),
        spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 700 }),
      ];
      return makeWorld(units);
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 10; i++) {
      aiSystem(ctx(a));
      aiSystem(ctx(b));
    }
    expect(JSON.stringify(a.units.map((u) => u.target))).toBe(
      JSON.stringify(b.units.map((u) => u.target)),
    );
  });
});
