import { describe, it, expect } from 'vitest';
import { combatSystem } from './combat';
import { spawnUnit } from '../spawn';
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

function ctx(world: World): TickContext {
  return { world, commands: [] };
}

/** A swordsman adjacent to an enemy, mid-attack with the given windup left. */
function duel(windupLeft = 0) {
  const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
  const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 525 });
  a.state = 'attack';
  a.target = { kind: 'unit', id: 2 };
  a.windupTicksLeft = windupLeft;
  return { a, b, world: makeWorld([a, b]) };
}

describe('combatSystem — melee', () => {
  it('does not damage while the windup is still running', () => {
    const { a, b, world } = duel(3);
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    expect(b.hp).toBe(hpBefore);
    expect(a.windupTicksLeft).toBe(2);
  });

  it('strikes on the tick the windup reaches zero', () => {
    const { b, world } = duel(1);
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    // swordsman 25 vs swordsman armour 5, no bonus -> 20
    expect(b.hp).toBe(hpBefore - 20);
  });

  it('starts the cooldown after striking', () => {
    const { a, world } = duel(1);
    combatSystem(ctx(world));
    expect(a.cooldownTicksLeft).toBe(UNIT_TICKS.swordsman.attackCooldown);
  });

  it('records damage in the attacker side stats', () => {
    const { world } = duel(1);
    combatSystem(ctx(world));
    expect(world.stats.player.damageDealt).toBe(20);
  });

  // Review Focus #1
  it('misses when the target left the attack range before the strike', () => {
    const { a, b, world } = duel(1);
    b.x = a.x + 999; // walked away during the windup
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    expect(b.hp).toBe(hpBefore);
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('does not re-open the windup after missing', () => {
    const { a, b, world } = duel(1);
    b.x = a.x + 999;
    combatSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(0);
    expect(a.cooldownTicksLeft).toBeGreaterThan(0);
  });

  it('misses when the target died during the windup', () => {
    const { b, world } = duel(1);
    b.state = 'dead';
    b.hp = 0;
    combatSystem(ctx(world));
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('never strikes a target on the same side', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const friend = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 520 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    a.windupTicksLeft = 1;
    const world = makeWorld([a, friend]);
    combatSystem(ctx(world));
    expect(friend.hp).toBe(150);
  });

  it('applies the light-armour bonus against an archer', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const archer = spawnUnit({ id: 2, side: 'enemy', typeId: 'archer', x: 525 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    a.windupTicksLeft = 1;
    const world = makeWorld([a, archer]);
    combatSystem(ctx(world));
    // 25 x1.5 = 37.5, archer armour 0 -> 37.5. The starting HP comes from the
    // data table rather than a literal: balance changes to maxHp must not break
    // a test about the DAMAGE FORMULA.
    const bonus = UNITS.swordsman.bonusVs.light ?? 1;
    const expected = UNITS.swordsman.attack * bonus - UNITS.archer.armor;
    expect(archer.hp).toBeCloseTo(UNITS.archer.maxHp - expected, 10);
  });

  it('damages the enemy base when that is the target', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2670 });
    a.state = 'attack';
    a.target = { kind: 'base', side: 'enemy' };
    a.windupTicksLeft = 1;
    const world = makeWorld([a]);
    combatSystem(ctx(world));
    // 25 - base armour 10 = 15
    expect(world.bases.enemy.hp).toBe(3000 - 15);
    expect(world.stats.player.damageDealt).toBe(15);
  });

  it('marks a unit dead when hp reaches zero', () => {
    const { b, world } = duel(1);
    b.hp = 5;
    combatSystem(ctx(world));
    expect(b.state).toBe('dead');
  });

  it("marks dead rather than removing — removal is cleanup's job", () => {
    const { b, world } = duel(1);
    b.hp = 5;
    combatSystem(ctx(world));
    expect(world.units).toHaveLength(2);
  });

  it('does not let a dead unit strike', () => {
    const { a, b, world } = duel(1);
    a.state = 'dead';
    a.hp = 0;
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    expect(b.hp).toBe(hpBefore);
  });

  it('ticks down the cooldown each call', () => {
    const { a, world } = duel(1);
    combatSystem(ctx(world));
    const after = a.cooldownTicksLeft;
    combatSystem(ctx(world));
    expect(a.cooldownTicksLeft).toBe(after - 1);
  });

  it('does not start a windup while on cooldown', () => {
    const { a, world } = duel(0);
    a.cooldownTicksLeft = 10;
    combatSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(0);
  });
});

describe('combatSystem — ranged', () => {
  it('spawns a projectile instead of dealing instant damage', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 650 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));

    expect(world.projectiles).toHaveLength(1);
    expect(target.hp).toBe(150); // nothing has landed yet
    expect(world.projectiles[0].ticksToImpact).toBeGreaterThan(0);
  });

  it('computes impact ticks from distance and projectile speed', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));
    // 200px at 400px/s = 0.5s = 15 ticks
    expect(world.projectiles[0].ticksToImpact).toBe(15);
  });

  it('lands the projectile and deals damage when the timer expires', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world)); // fires
    const hpBefore = target.hp;
    const ticks = world.projectiles[0].ticksToImpact;
    for (let i = 0; i < ticks; i++) combatSystem(ctx(world));

    // archer 18 vs swordsman armour 5 -> 13
    expect(target.hp).toBe(hpBefore - 13);
    expect(world.projectiles).toHaveLength(0);
  });

  // Review Focus #5
  it('drops a projectile whose target died in flight', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));
    target.state = 'dead';
    target.hp = 0;
    for (let i = 0; i < 40; i++) combatSystem(ctx(world));

    expect(world.projectiles).toHaveLength(0);
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('moves the projectile toward the target each tick', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));
    const x0 = world.projectiles[0].x;
    combatSystem(ctx(world));
    expect(world.projectiles[0].x).toBeGreaterThan(x0);
  });

  it('never produces a zero-tick projectile for a non-zero distance', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 501 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);
    combatSystem(ctx(world));
    expect(world.projectiles[0].ticksToImpact).toBeGreaterThanOrEqual(1);
  });
});

describe('combatSystem — safety', () => {
  it('does nothing on an empty world', () => {
    expect(() => combatSystem(ctx(makeWorld([])))).not.toThrow();
  });

  it('does nothing for a unit with no target', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    a.state = 'attack';
    a.target = null;
    expect(() => combatSystem(ctx(makeWorld([a])))).not.toThrow();
  });

  it('does nothing for a miner', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 510 });
    m.state = 'attack';
    m.target = { kind: 'unit', id: 2 };
    m.windupTicksLeft = 1;
    const world = makeWorld([m, e]);
    combatSystem(ctx(world));
    expect(e.hp).toBe(150);
  });
});

describe('combatSystem — mine targets', () => {
  it('does not damage anything when a unit is locked onto a mine', () => {
    // A mine is a navigation destination, not a combat target. If a unit ever
    // ends up locked onto one, the strike must be a no-op rather than damage
    // resolved against a phantom unit id.
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 550 });
    a.state = 'attack';
    a.target = { kind: 'mine', side: 'player' };
    // releaseStrike runs only on the tick a windup reaches zero.
    a.windupTicksLeft = 1;
    const world = makeWorld([a]);
    // A live mine, so isTargetAlive does not short-circuit the strike and the
    // mine-handling path is genuinely reached.
    world.mines.player.goldLeft = 6000;

    expect(() => combatSystem(ctx(world))).not.toThrow();
    expect(world.units).toHaveLength(1);
    expect(a.hp).toBe(150);
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('does not damage the mine either', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 550 });
    a.state = 'attack';
    a.target = { kind: 'mine', side: 'player' };
    a.windupTicksLeft = 1;
    const world = makeWorld([a]);
    world.mines.player.goldLeft = 6000;

    combatSystem(ctx(world));
    expect(world.mines.player.goldLeft).toBe(6000);
    expect(world.projectiles).toHaveLength(0);
  });

  it('consumes the cooldown so the unit does not re-strike every tick', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 550 });
    a.state = 'attack';
    a.target = { kind: 'mine', side: 'player' };
    a.windupTicksLeft = 1;
    const world = makeWorld([a]);
    world.mines.player.goldLeft = 6000;

    combatSystem(ctx(world));
    expect(a.cooldownTicksLeft).toBe(UNIT_TICKS.swordsman.attackCooldown);
  });
});