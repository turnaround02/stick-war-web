import { describe, it, expect } from 'vitest';
import { cleanupSystem } from './cleanup';
import { spawnUnit } from '../spawn';
import { createWorld } from '../createWorld';
import { step } from '../tick';
import { DEFAULT_MATCH } from '../../data/levels';
import type { MatchConfig, TickContext, Unit, World } from '../types';

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
    waves: [],
    aiProfile: 'none',
    winCondition: 'annihilation',
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });

describe('cleanupSystem — removal', () => {
  it('removes units marked dead', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(0);
  });

  it('keeps living units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(1);
  });

  it('removes units whose hp reached zero even if state was not set', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    a.hp = 0;
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(0);
  });

  it('removes several dead units at once', () => {
    const units = [1, 2, 3].map((id) => {
      const u = spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 100 * id });
      u.state = 'dead';
      u.hp = 0;
      return u;
    });
    const world = makeWorld(units);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(0);
  });

  it("clears a dead unit from any other unit's target reference", () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 130 });
    b.state = 'dead';
    b.hp = 0;
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, b]);
    cleanupSystem(ctx(world));
    expect(a.target).toBeNull();
  });
});

describe('cleanupSystem — outcome', () => {
  it('declares a player win when the enemy base falls', () => {
    // The player must still have a unit: only units deal damage, so a base
    // cannot fall while its attacker has been wiped. Giving the player a
    // survivor is the only way this premise can hold.
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    const world = makeWorld([a]);
    world.bases.enemy.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('declares a player loss when the player base falls', () => {
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 400 });
    const world = makeWorld([e]);
    world.bases.player.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  // Review Focus #4
  it('resolves both bases falling at once as a player loss', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 400 });
    const world = makeWorld([a, e]);
    world.bases.player.hp = 0;
    world.bases.enemy.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  it('treats a wiped army as a loss even if the enemy base also fell', () => {
    // Precedence: no units left is a defeat regardless of base hp, so that
    // base-less harness matchups can always reach a verdict.
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 400 });
    const world = makeWorld([e]);
    world.bases.enemy.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  it('declares a win when the enemy has no units left', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('declares a loss when the player has no units left', () => {
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 100 });
    const world = makeWorld([e]);
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  it('does not declare anything when both sides still have units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 200 });
    const world = makeWorld([a, b]);
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('ongoing');
  });

  it('does not re-decide an already-decided outcome', () => {
    const world = makeWorld([]);
    world.outcome = 'playerWin';
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('does not throw on a completely empty world', () => {
    const world = makeWorld([]);
    expect(() => cleanupSystem(ctx(world))).not.toThrow();
    // Both sides empty is a mutual wipe -> loss for the player.
    expect(world.outcome).toBe('playerLose');
  });

  it('removes spent projectiles', () => {
    const world = makeWorld([]);
    world.projectiles.push({
      id: 1,
      side: 'player',
      x: 10,
      prevX: 10,
      target: { kind: 'unit', id: 99 },
      attackerType: 'archer',
      damage: 1,
      ticksToImpact: 0,
    });
    cleanupSystem(ctx(world));
    expect(world.projectiles).toHaveLength(0);
  });
});

/**
 * The level-1 shape: the enemy has no economy and no starting units, so its
 * entire force arrives as scripted waves. "Enemy units == 0" is therefore TRUE
 * on tick 1, and without this guard the level was won before it began.
 */
function scriptedMatch(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'scripted-probe',
    startMiners: { player: 3, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    enemyAi: 'scripted',
    waves: [{ atTick: 150, units: ['swordsman', 'swordsman'] }],
    ...over,
  };
}

describe('cleanupSystem — scripted waves', () => {
  it('does NOT declare a win on tick 1 when enemy units are all still in waves', () => {
    const world = createWorld(scriptedMatch(), 1);
    step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('stays ongoing across many ticks while a wave is still due', () => {
    const world = createWorld(scriptedMatch(), 1);
    for (let i = 0; i < 100; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('declares a win once every wave has spawned AND been killed', () => {
    // waveIndex == waves.length means nothing more is due, so an empty enemy
    // field IS annihilation. Built directly rather than by running the wave
    // system, so this test isolates the cleanup rule from wave spawning.
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 2600 });
    e.state = 'dead';
    e.hp = 0;
    const world = makeWorld([spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 100 }), e]);
    world.waves = [{ atTick: 1, units: ['swordsman'] }];
    world.waveIndex = 1;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('never declares a win by annihilation when waves are endless', () => {
    // Endless mode: there is always another wave, so "the enemy is out of
    // units" is never a victory — endless can only be LOST.
    const world = createWorld(scriptedMatch({ endless: true, waves: [] }), 1);
    for (let i = 0; i < 30; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('still loses when the player is wiped, even mid-waves', () => {
    // The guard must only weaken the ENEMY-wiped condition, never the player's.
    const world = createWorld(scriptedMatch(), 1);
    step(world, []);
    for (const u of world.units) {
      if (u.side === 'player') {
        u.state = 'dead';
        u.hp = 0;
      }
    }
    step(world, []);
    expect(world.outcome).toBe('playerLose');
  });

  it('still wins on an enemy base falling, waves or not', () => {
    const world = createWorld(scriptedMatch(), 1);
    world.bases.enemy.hp = 0;
    step(world, []);
    expect(world.outcome).toBe('playerWin');
  });
});
