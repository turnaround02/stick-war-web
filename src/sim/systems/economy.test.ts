import { describe, it, expect } from 'vitest';
import { economySystem } from './economy';
import { spawnUnit } from '../spawn';
import { BASE_RADIUS, PLAYER_MINE_X } from '../../data/constants';
import { UNITS } from '../../data/units';
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
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });
const BASE_FRONT = 300 + BASE_RADIUS + UNITS.miner.bodyRadius; // 350

describe('economySystem — gathering', () => {
  it('starts a gather when the miner reaches its mine', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'move';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(m.state).toBe('gather');
    expect(m.gatherTicksLeft).toBe(UNIT_TICKS.miner.gatherTime);
  });

  it('does not start a gather while the miner is still walking', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 800 });
    m.state = 'move';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(m.state).toBe('move');
    expect(m.gatherTicksLeft).toBe(0);
  });

  it('sends the miner home once it has a load', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'gather';
    m.gatherTicksLeft = 1;
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(m.carrying).toBe(20);
    expect(m.target).toEqual({ kind: 'base', side: 'player' });
  });

  it('banks the load on arrival and sends the miner back out', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: BASE_FRONT });
    m.carrying = 20;
    m.state = 'move';
    m.target = { kind: 'base', side: 'player' };
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(world.gold.player).toBe(220);
    expect(m.carrying).toBe(0);
    expect(m.target).toEqual({ kind: 'mine', side: 'player' });
  });

  it('stops the miner when the seam runs dry', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'gather';
    m.gatherTicksLeft = 1;
    const world = makeWorld([m]);
    world.mines.player.goldLeft = 0;
    economySystem(ctx(world));
    expect(m.carrying).toBe(0);
    // A depleted seam must not leave the miner looping a gather animation.
    expect(m.target).not.toEqual({ kind: 'mine', side: 'player' });
  });

  it('never produces negative mine gold', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'gather';
    m.gatherTicksLeft = 1;
    const world = makeWorld([m]);
    world.mines.player.goldLeft = 5;
    economySystem(ctx(world));
    expect(world.mines.player.goldLeft).toBe(0);
    expect(m.carrying).toBe(5);
  });

  it('ignores non-miners entirely', () => {
    const s = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 400 });
    s.state = 'move';
    s.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([s]);
    economySystem(ctx(world));
    expect(s.state).toBe('move');
  });

  it('does nothing on an empty world', () => {
    expect(() => economySystem(ctx(makeWorld([])))).not.toThrow();
  });

  it('is deterministic across repeated runs', () => {
    const build = () => {
      const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
      m.state = 'gather';
      m.gatherTicksLeft = 3;
      return makeWorld([m]);
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 10; i++) {
      economySystem({ world: a, commands: [] });
      economySystem({ world: b, commands: [] });
    }
    expect(a.mines.player.goldLeft).toBe(b.mines.player.goldLeft);
    expect(a.units[0].carrying).toBe(b.units[0].carrying);
  });
});

describe('economySystem — population accounting', () => {
  it('counts living units', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    const s = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 440 });
    const e = spawnUnit({ id: 3, side: 'enemy', typeId: 'archer', x: 2600 });
    const world = makeWorld([m, s, e]);
    economySystem(ctx(world));
    expect(world.popUsed.player).toBe(2);
    expect(world.popUsed.enemy).toBe(1);
  });

  it('does not count dead units', () => {
    const alive = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 400 });
    const dead = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 440 });
    dead.state = 'dead';
    dead.hp = 0;
    const world = makeWorld([alive, dead]);
    economySystem(ctx(world));
    expect(world.popUsed.player).toBe(1);
  });

  it('recomputes from scratch so it can never drift', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    const world = makeWorld([m]);
    world.popUsed.player = 999;
    economySystem(ctx(world));
    expect(world.popUsed.player).toBe(1);
  });
});
