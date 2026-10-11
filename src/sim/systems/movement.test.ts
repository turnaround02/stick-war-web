import { describe, it, expect } from 'vitest';
import { movementSystem } from './movement';
import { spawnUnit } from '../spawn';
import { UNIT_TICKS } from '../../data/unitTicks';
import { createWorld } from '../createWorld';
import { step } from '../tick';
import { DEFAULT_MATCH } from '../../data/levels';
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
      player: { side: 'player', x: 550, goldLeft: 6000 },
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
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

describe('movementSystem', () => {
  it('records prevX before moving', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 900 });
    a.state = 'move';
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, e]);
    movementSystem(ctx(world));
    expect(a.prevX).toBe(500);
    expect(a.x).toBeGreaterThan(500);
  });

  it('moves an advancing unit toward the enemy', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 2000 });
    a.state = 'move';
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, e]);
    movementSystem(ctx(world));
    expect(a.x).toBeCloseTo(500 + UNIT_TICKS.swordsman.speedPerTick, 6);
  });

  it('moves an enemy toward the player (opposite direction)', () => {
    const p = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 2000, stance: 'advance' });
    e.state = 'move';
    e.target = { kind: 'unit', id: 1 };
    const world = makeWorld([p, e]);
    movementSystem(ctx(world));
    expect(e.x).toBeLessThan(2000);
  });

  it('does not move an attacking unit', () => {
    // Fixture is clear of the separation constraint (radii sum to 28) so this
    // measures movement integration, not pushing.
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 535 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, e]);
    movementSystem(ctx(world));
    expect(a.x).toBe(500);
  });

  it('stops an archer once it is within its own range', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 690 });
    archer.state = 'move';
    archer.target = { kind: 'unit', id: 2 };
    const world = makeWorld([archer, e]);
    movementSystem(ctx(world));
    // 190px away, archer range 200 -> already in range, should not advance
    expect(archer.x).toBe(500);
  });

  it('retreats toward its own base', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 1500, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    expect(a.x).toBeLessThan(1500);
  });

  it('stops retreating at the base edge', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 341, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    // base at 300, radius 40 + unit 14 = 54 -> stops at 354
    expect(a.x).toBeGreaterThanOrEqual(354 - 0.5);
  });

  it('does not move a holding unit with no target', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'hold' });
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    expect(a.x).toBe(500);
  });

  it('does not move a dead unit', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    expect(a.x).toBe(500);
  });

  it('keeps every unit finite and inside the world', () => {
    const units = Array.from({ length: 30 }, (_, i) =>
      spawnUnit({
        id: i + 1,
        side: 'player',
        typeId: 'swordsman',
        x: 500 + i * 2,
        stance: 'advance',
      }),
    );
    const world = makeWorld(units);
    for (let i = 0; i < 50; i++) movementSystem(ctx(world));
    for (const u of world.units) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(3000);
    }
  });

  it('never leaves allies overlapped after a move', () => {
    const units = Array.from({ length: 10 }, (_, i) =>
      spawnUnit({
        id: i + 1,
        side: 'player',
        typeId: 'swordsman',
        x: 500,
        stance: 'advance',
      }),
    );
    const world = makeWorld(units);
    movementSystem(ctx(world));
    const sorted = world.units.slice().sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x - sorted[i - 1].x).toBeGreaterThanOrEqual(28 - 0.5);
    }
  });

  it('is deterministic for the same input', () => {
    const build = () =>
      makeWorld([
        spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' }),
        spawnUnit({ id: 2, side: 'player', typeId: 'archer', x: 520, stance: 'advance' }),
      ]);
    const a = build();
    const b = build();
    for (let i = 0; i < 20; i++) {
      movementSystem(ctx(a));
      movementSystem(ctx(b));
    }
    expect(a.units.map((u) => u.x.toFixed(6))).toEqual(b.units.map((u) => u.x.toFixed(6)));
  });
});

describe('movementSystem — miners', () => {
  it('walks a miner toward its mine', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    m.state = 'move';
    m.stance = 'advance';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    movementSystem(ctx(world));
    expect(m.x).toBeGreaterThan(400);
  });

  it('does not move a gathering miner', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 550 });
    m.state = 'gather';
    m.stance = 'advance';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    movementSystem(ctx(world));
    expect(m.x).toBe(550);
  });

  it('walks a loaded miner back toward its base', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    m.carrying = 20;
    m.state = 'move';
    m.stance = 'advance';
    m.target = { kind: 'base', side: 'player' };
    const world = makeWorld([m]);
    movementSystem(ctx(world));
    expect(m.x).toBeLessThan(500);
  });

  it('stops a miner at the mine instead of walking past it', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 548 });
    m.state = 'move';
    m.stance = 'advance';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    for (let i = 0; i < 30; i++) movementSystem(ctx(world));
    // A miner has attackRange 0, so integrateAdvance would otherwise keep
    // walking until it sat exactly on the mine's X and then oscillate.
    expect(Math.abs(m.x - 550)).toBeLessThanOrEqual(8);
  });
});

describe('movementSystem — retreat stop point', () => {
  it('retreats to the base FRONT, not behind it', () => {
    // Behind the base would put withdrawing units in the miners' lane.
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 800, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    for (let i = 0; i < 200; i++) movementSystem(ctx(world));
    // base 300 + BASE_RADIUS 40 + swordsman 14 = 354
    expect(a.x).toBeGreaterThan(300);
    expect(a.x).toBeCloseTo(354, 0);
  });

  it('mirrors for the enemy side', () => {
    const a = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 2200, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    for (let i = 0; i < 200; i++) movementSystem(ctx(world));
    expect(a.x).toBeCloseTo(2646, 0);
  });
});

describe('the full mining loop (end to end)', () => {
  it('walks out, mines, walks home, and banks', () => {
    // This is the test that proves the loops actually CLOSE. It runs the real
    // tick pipeline — no hand-rolled movement — so it exercises aiSystem's
    // miner branch, movementSystem's mine targeting, economySystem's gather
    // and banking, in the order the real game runs them.
    const world = createWorld(
      {
        ...DEFAULT_MATCH,
        startGold: { player: 200, enemy: 0 },
        startMiners: { player: 1, enemy: 0 },
        initialUnits: { player: [], enemy: [] },
        initialStance: 'hold',
      },
      1,
    );

    const startGold = world.gold.player;
    for (let i = 0; i < 600; i++) step(world, []);

    // One round trip is ~252 ticks, so two must have completed inside 600.
    expect(world.gold.player).toBeGreaterThanOrEqual(startGold + 20);
    expect(world.mines.player.goldLeft).toBeLessThan(6000);
  });

  it('leaves the miner idle when the seam runs dry', () => {
    const world = createWorld(
      {
        ...DEFAULT_MATCH,
        startGold: { player: 0, enemy: 0 },
        startMiners: { player: 1, enemy: 0 },
        initialUnits: { player: [], enemy: [] },
        initialStance: 'hold',
      },
      1,
    );
    world.mines.player.goldLeft = 0;

    for (let i = 0; i < 600; i++) step(world, []);

    const miner = world.units.find((u) => u.typeId === 'miner');
    expect(miner).toBeDefined();
    // Must not sit in 'gather' looping an animation that yields nothing.
    expect(miner!.state).not.toBe('gather');
  });
});
