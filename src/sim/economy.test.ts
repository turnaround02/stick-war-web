import { describe, it, expect } from 'vitest';
import { advanceGather, tryBankGold } from './economy';
import { spawnUnit } from './spawn';
import { BASE_RADIUS, PLAYER_MINE_X } from '../data/constants';
import { UNITS } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
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
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 200, enemy: 200 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: 60, enemy: 60 },
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

/** A miner parked on its mine, mid-gather. */
function miningMiner(gatherTicksLeft = 1) {
  const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
  m.state = 'gather';
  m.gatherTicksLeft = gatherTicksLeft;
  return { m, world: makeWorld([m]) };
}

describe('advanceGather', () => {
  it('counts the gather timer down', () => {
    const { m, world } = miningMiner(5);
    advanceGather(world, m);
    expect(m.gatherTicksLeft).toBe(4);
  });

  it('loads the miner and depletes the mine when the timer expires', () => {
    const { m, world } = miningMiner(1);
    advanceGather(world, m);
    expect(m.carrying).toBe(UNITS.miner.carryCapacity);
    expect(world.mines.player.goldLeft).toBe(6000 - UNITS.miner.carryCapacity);
    expect(m.gatherTicksLeft).toBe(0);
  });

  it('never carries more than the mine holds', () => {
    const { m, world } = miningMiner(1);
    world.mines.player.goldLeft = 7;
    advanceGather(world, m);
    expect(m.carrying).toBe(7);
    expect(world.mines.player.goldLeft).toBe(0);
  });

  it('does not go negative when the mine is already empty', () => {
    const { m, world } = miningMiner(1);
    world.mines.player.goldLeft = 0;
    advanceGather(world, m);
    expect(m.carrying).toBe(0);
    expect(world.mines.player.goldLeft).toBe(0);
  });

  it('does nothing to a miner that is not gathering', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    m.state = 'move';
    const world = makeWorld([m]);
    advanceGather(world, m);
    expect(m.carrying).toBe(0);
    expect(world.mines.player.goldLeft).toBe(6000);
  });

  it('does nothing to a non-miner', () => {
    const s = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 400 });
    s.state = 'gather';
    s.gatherTicksLeft = 1;
    const world = makeWorld([s]);
    advanceGather(world, s);
    expect(s.carrying).toBe(0);
  });

  it('uses the miner own side mine', () => {
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'miner', x: 2450 });
    e.state = 'gather';
    e.gatherTicksLeft = 1;
    const world = makeWorld([e]);
    advanceGather(world, e);
    expect(world.mines.enemy.goldLeft).toBe(6000 - UNITS.miner.carryCapacity);
    expect(world.mines.player.goldLeft).toBe(6000);
  });

  it('is idempotent once the timer is already zero', () => {
    const { m, world } = miningMiner(0);
    advanceGather(world, m);
    advanceGather(world, m);
    expect(world.mines.player.goldLeft).toBe(6000);
  });
});

describe('tryBankGold', () => {
  it('banks the carried gold at the base front', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    m.carrying = 20;
    m.state = 'move';
    const world = makeWorld([m]);
    // Base front for a miner: 300 + 40 + 10 = 350.
    m.x = 300 + BASE_RADIUS + UNITS.miner.bodyRadius;
    expect(tryBankGold(world, m)).toBe(true);
    expect(world.gold.player).toBe(220);
    expect(m.carrying).toBe(0);
  });

  it('does not bank while still in transit', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 700 });
    m.carrying = 20;
    const world = makeWorld([m]);
    expect(tryBankGold(world, m)).toBe(false);
    expect(world.gold.player).toBe(200);
    expect(m.carrying).toBe(20);
  });

  it('does not bank an empty-handed miner', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 350 });
    m.carrying = 0;
    const world = makeWorld([m]);
    expect(tryBankGold(world, m)).toBe(false);
    expect(world.gold.player).toBe(200);
  });

  it('banks on the enemy side too', () => {
    const m = spawnUnit({ id: 1, side: 'enemy', typeId: 'miner', x: 0 });
    m.carrying = 20;
    const world = makeWorld([m]);
    m.x = 2700 - BASE_RADIUS - UNITS.miner.bodyRadius;
    expect(tryBankGold(world, m)).toBe(true);
    expect(world.gold.enemy).toBe(220);
  });

  it('does not bank a non-miner carrying nothing', () => {
    const s = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 350 });
    const world = makeWorld([s]);
    expect(tryBankGold(world, s)).toBe(false);
  });

  it('is idempotent: a second call banks nothing', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 350 });
    m.carrying = 20;
    const world = makeWorld([m]);
    tryBankGold(world, m);
    tryBankGold(world, m);
    expect(world.gold.player).toBe(220);
  });

  it('gather time from the derived table is what the timer uses', () => {
    expect(UNIT_TICKS.miner.gatherTime).toBe(90);
  });
});
