import { describe, it, expect } from 'vitest';
import { commandsSystem } from './commands';
import { spawnUnit } from '../spawn';
import type { Command, TickContext, Unit, World } from '../types';

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
    gold: { player: 500, enemy: 500 },
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

const ctx = (world: World, commands: Command[]): TickContext => ({ world, commands });

describe('commandsSystem — train', () => {
  it('queues a unit and deducts gold', () => {
    const world = makeWorld();
    commandsSystem(ctx(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]));
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(world.gold.player).toBe(400);
  });

  it('silently ignores an unaffordable order', () => {
    const world = makeWorld();
    world.gold.player = 0;
    commandsSystem(ctx(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]));
    expect(world.trainingQueue.player).toHaveLength(0);
    expect(world.gold.player).toBe(0);
  });

  it('routes the order to the requested side only', () => {
    const world = makeWorld();
    commandsSystem(ctx(world, [{ kind: 'train', side: 'enemy', typeId: 'archer' }]));
    expect(world.trainingQueue.enemy).toHaveLength(1);
    expect(world.trainingQueue.player).toHaveLength(0);
    expect(world.gold.enemy).toBe(420);
  });

  it('applies several orders in the same tick', () => {
    const world = makeWorld();
    commandsSystem(
      ctx(world, [
        { kind: 'train', side: 'player', typeId: 'miner' },
        { kind: 'train', side: 'player', typeId: 'miner' },
      ]),
    );
    expect(world.trainingQueue.player).toHaveLength(2);
    expect(world.gold.player).toBe(400);
  });

  it('does nothing with no commands', () => {
    const world = makeWorld();
    commandsSystem(ctx(world, []));
    expect(world.trainingQueue.player).toHaveLength(0);
    expect(world.gold.player).toBe(500);
  });
});

describe('commandsSystem — AI profile gate', () => {
  it("does not run the tactical layer when the profile is 'none'", () => {
    // A scripted level's enemy has no economy, so a tactical layer would only
    // queue orders it can never afford. More importantly it must not touch the
    // enemy's stance either.
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 2600 });
    const world = makeWorld([e]);
    world.aiProfile = 'none';
    world.tick = 0;
    commandsSystem(ctx(world, []));
    expect(world.trainingQueue.enemy).toHaveLength(0);
    expect(e.stance).toBe('hold');
  });

  it("runs it when the profile is 'standard'", () => {
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 2600 });
    const world = makeWorld([e]);
    world.aiProfile = 'standard';
    world.tick = 0;
    commandsSystem(ctx(world, []));
    // It has gold and no miners, so it buys a miner first.
    expect(world.trainingQueue.enemy.map((o) => o.typeId)).toContain('miner');
  });

  it('still applies player commands when the AI profile is none', () => {
    const world = makeWorld();
    world.aiProfile = 'none';
    commandsSystem(ctx(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]));
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(world.trainingQueue.enemy).toHaveLength(0);
  });

  it('runs whichever profile the world names, not a hardcoded one', () => {
    // Before the registry the enemy profile was hardcoded, so a level could not
    // have its own settings and a true mirror match was untestable.
    const world = makeWorld([]);
    world.aiProfile = 'level-2';
    world.tick = 0;
    world.gold.enemy = 500;
    commandsSystem(ctx(world, []));
    expect(world.trainingQueue.enemy.length).toBeGreaterThan(0);
  });
});

describe('commandsSystem — setStance', () => {
  it('sets the stance on the named units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, b]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(a.stance).toBe('retreat');
    expect(b.stance).toBe('hold');
  });

  it('sets several units at once', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, b]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1, 2], stance: 'advance' },
    ]));
    expect(a.stance).toBe('advance');
    expect(b.stance).toBe('advance');
  });

  it('refuses to command the other side units', () => {
    // The AI and the player share this command type (spec §9.1), so the side
    // field must be enforced or one side could puppeteer the other.
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 500 });
    const world = makeWorld([e]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(e.stance).toBe('hold');
  });

  it('ignores unknown unit ids', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const world = makeWorld([a]);
    expect(() =>
      commandsSystem(ctx(world, [
        { kind: 'setStance', side: 'player', unitIds: [999], stance: 'retreat' },
      ])),
    ).not.toThrow();
    expect(a.stance).toBe('hold');
  });

  it('ignores dead units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(a.stance).toBe('hold');
  });

  it('applies to every unit when the whole army is listed', () => {
    const units = [1, 2, 3].map((id) =>
      spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 400 + id * 40 }),
    );
    const world = makeWorld(units);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1, 2, 3], stance: 'advance' },
    ]));
    for (const u of units) expect(u.stance).toBe('advance');
  });

  it('handles train and stance in the same tick', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const world = makeWorld([a]);
    commandsSystem(ctx(world, [
      { kind: 'train', side: 'player', typeId: 'miner' },
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(a.stance).toBe('retreat');
  });

  it('does not let an empty id list touch anything', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const world = makeWorld([a]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [], stance: 'retreat' },
    ]));
    expect(a.stance).toBe('hold');
  });
});
