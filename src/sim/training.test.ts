import { describe, it, expect } from 'vitest';
import { canQueue, queueUnit, advanceTrainingQueue, findSpawnX } from './training';
import { spawnUnit } from './spawn';
import { BASE_RADIUS, POP_CAP } from '../data/constants';
import { UNITS } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import type { Unit, World } from './types';

function makeWorld(units: Unit[] = []): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 100,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 550, goldLeft: 6000 },
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 200, enemy: 200 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: POP_CAP, enemy: POP_CAP },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    waves: [],
    aiProfile: 'none',
    winCondition: 'annihilation',
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

describe('canQueue', () => {
  it('allows a queue when gold and population both permit it', () => {
    const world = makeWorld();
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: true });
  });

  it('rejects when gold is short', () => {
    const world = makeWorld();
    world.gold.player = 50; // swordsman costs 100
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: false, reason: 'gold' });
  });

  it('accepts when gold is exactly enough', () => {
    const world = makeWorld();
    world.gold.player = 100;
    expect(canQueue(world, 'player', 'swordsman').ok).toBe(true);
  });

  it('rejects when population would exceed the cap', () => {
    const world = makeWorld();
    world.popCap.player = 2;
    world.popUsed.player = 2;
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: false, reason: 'pop' });
  });

  it('counts units already queued against the cap', () => {
    // Otherwise a player could queue 60 units at pop 59 and only find out on
    // the 60th spawn.
    const world = makeWorld();
    world.popCap.player = 2;
    world.popUsed.player = 1;
    world.trainingQueue.player.push({ typeId: 'swordsman', ticksLeft: 100 });
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: false, reason: 'pop' });
  });

  it('reports gold before population when both are short', () => {
    const world = makeWorld();
    world.gold.player = 0;
    world.popCap.player = 0;
    expect(canQueue(world, 'player', 'swordsman').reason).toBe('gold');
  });

  it('checks the requested side gold, not the other side', () => {
    const world = makeWorld();
    world.gold.player = 0;
    world.gold.enemy = 500;
    expect(canQueue(world, 'enemy', 'swordsman').ok).toBe(true);
    expect(canQueue(world, 'player', 'swordsman').ok).toBe(false);
  });
});

describe('queueUnit', () => {
  it('deducts gold immediately and enqueues', () => {
    const world = makeWorld();
    expect(queueUnit(world, 'player', 'swordsman')).toBe(true);
    expect(world.gold.player).toBe(100);
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(world.trainingQueue.player[0].ticksLeft).toBe(UNIT_TICKS.swordsman.trainTime);
  });

  it('refuses and leaves gold untouched when short', () => {
    const world = makeWorld();
    world.gold.player = 10;
    expect(queueUnit(world, 'player', 'swordsman')).toBe(false);
    // Review Focus #2: a rejected order must not silently eat the gold.
    expect(world.gold.player).toBe(10);
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('refuses at the population cap without touching gold', () => {
    const world = makeWorld();
    world.popCap.player = 1;
    world.popUsed.player = 1;
    expect(queueUnit(world, 'player', 'swordsman')).toBe(false);
    expect(world.gold.player).toBe(200);
  });

  it('allows several orders in a row while gold lasts', () => {
    const world = makeWorld();
    world.gold.player = 250;
    expect(queueUnit(world, 'player', 'swordsman')).toBe(true); // 150 left
    expect(queueUnit(world, 'player', 'swordsman')).toBe(true); // 50 left
    expect(queueUnit(world, 'player', 'swordsman')).toBe(false); // short
    expect(world.gold.player).toBe(50);
    expect(world.trainingQueue.player).toHaveLength(2);
  });

  it('queues miners too', () => {
    const world = makeWorld();
    expect(queueUnit(world, 'player', 'miner')).toBe(true);
    expect(world.gold.player).toBe(150);
  });
});

describe('advanceTrainingQueue', () => {
  it('counts the head order down', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'swordsman');
    advanceTrainingQueue(world, 'player');
    expect(world.trainingQueue.player[0].ticksLeft).toBe(UNIT_TICKS.swordsman.trainTime - 1);
  });

  it('spawns the unit when the head order completes', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'swordsman');
    world.trainingQueue.player[0].ticksLeft = 1;
    const before = world.units.length;
    advanceTrainingQueue(world, 'player');
    expect(world.units.length).toBe(before + 1);
    expect(world.units[world.units.length - 1].typeId).toBe('swordsman');
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('spawns on the correct side', () => {
    const world = makeWorld();
    queueUnit(world, 'enemy', 'archer');
    world.trainingQueue.enemy[0].ticksLeft = 1;
    advanceTrainingQueue(world, 'enemy');
    const spawned = world.units[world.units.length - 1];
    expect(spawned.side).toBe('enemy');
    expect(spawned.x).toBeGreaterThan(2000);
  });

  it('advances only one order per tick', () => {
    const world = makeWorld();
    world.gold.player = 500;
    queueUnit(world, 'player', 'swordsman');
    queueUnit(world, 'player', 'swordsman');
    world.trainingQueue.player[0].ticksLeft = 1;
    world.trainingQueue.player[1].ticksLeft = 5;
    advanceTrainingQueue(world, 'player');
    expect(world.units).toHaveLength(1);
    expect(world.trainingQueue.player[0].ticksLeft).toBe(5);
  });

  it('does nothing with an empty queue', () => {
    const world = makeWorld();
    expect(() => advanceTrainingQueue(world, 'player')).not.toThrow();
    expect(world.units).toHaveLength(0);
  });

  it('spawns at full hp', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'swordsman');
    world.trainingQueue.player[0].ticksLeft = 1;
    advanceTrainingQueue(world, 'player');
    expect(world.units[world.units.length - 1].hp).toBe(UNITS.swordsman.maxHp);
  });

  it('gives a new miner the hold stance', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'miner');
    world.trainingQueue.player[0].ticksLeft = 1;
    advanceTrainingQueue(world, 'player');
    const spawned = world.units[world.units.length - 1];
    // Miners default to hold so a freshly trained one does not walk into the
    // fight before the player has told it to mine.
    expect(spawned.stance).toBe('hold');
  });
});

describe('findSpawnX', () => {
  it('places a unit outside the base front', () => {
    const world = makeWorld();
    const x = findSpawnX(world, 'player', 'swordsman');
    expect(x).toBeGreaterThanOrEqual(300 + BASE_RADIUS + UNITS.swordsman.bodyRadius);
  });

  it('moves further out when the spot is taken', () => {
    const world = makeWorld();
    const first = findSpawnX(world, 'player', 'swordsman');
    world.units.push(spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: first }));
    const second = findSpawnX(world, 'player', 'swordsman');
    expect(second).toBeGreaterThan(first);
  });

  it('keeps searching past a dense cluster', () => {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) {
      world.units.push(
        spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 360 + i * 2 }),
      );
    }
    const x = findSpawnX(world, 'player', 'swordsman');
    for (const u of world.units) {
      expect(Math.abs(u.x - x)).toBeGreaterThan(UNITS.swordsman.bodyRadius * 2 - 0.5);
    }
  });

  it('mirrors for the enemy side', () => {
    const world = makeWorld();
    const x = findSpawnX(world, 'enemy', 'swordsman');
    expect(x).toBeLessThanOrEqual(2700 - BASE_RADIUS - UNITS.swordsman.bodyRadius);
  });

  it('never places a unit off the map', () => {
    const world = makeWorld();
    for (let i = 0; i < 80; i++) {
      world.units.push(
        spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 360 + i * 1 }),
      );
    }
    const x = findSpawnX(world, 'player', 'swordsman');
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(world.worldWidth);
  });
});
