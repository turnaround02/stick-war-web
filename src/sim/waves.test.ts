import { describe, it, expect } from 'vitest';
import { advanceWaves } from './waves';
import { createWorld } from './createWorld';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import { UNITS } from '../data/units';
import type { MatchConfig, WaveScript, World } from './types';

function level1(waves: WaveScript[]): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'test-level1',
    startMiners: { player: 3, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    enemyAi: 'scripted',
    waves,
  };
}

const enemies = (world: World) => world.units.filter((u) => u.side === 'enemy');

describe('advanceWaves — scheduling', () => {
  it('does nothing before the first wave is due', () => {
    const world = createWorld(level1([{ atTick: 100, units: ['swordsman'] }]), 1);
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(0);
    expect(world.waveIndex).toBe(0);
  });

  it('spawns a wave due at tick 0 on the first call', () => {
    const world = createWorld(level1([{ atTick: 0, units: ['swordsman', 'archer'] }]), 1);
    advanceWaves(world);
    expect(enemies(world).map((u) => u.typeId).sort()).toEqual(['archer', 'swordsman']);
    expect(world.waveIndex).toBe(1);
  });

  it('spawns a wave exactly when the tick reaches atTick, not before', () => {
    // The off-by-one that matters: a wave due at tick 5 must not appear at 4.
    const world = createWorld(level1([{ atTick: 5, units: ['swordsman'] }]), 1);
    for (let i = 0; i < 5; i++) step(world, []);
    expect(enemies(world), 'tick 4 must not have spawned it').toHaveLength(0);
    step(world, []);
    expect(enemies(world), 'tick 5 must have spawned it').toHaveLength(1);
  });

  it('advances only one wave per call, even when two are due', () => {
    // A long frame at 4x runs several ticks, but each tick's advanceWaves call
    // must still admit at most one wave — collapsing two would double the
    // enemy's local density and change the fight.
    const world = createWorld(
      level1([
        { atTick: 0, units: ['swordsman'] },
        { atTick: 0, units: ['archer'] },
      ]),
      1,
    );
    advanceWaves(world);
    expect(world.waveIndex).toBe(1);
    expect(enemies(world)).toHaveLength(1);
    advanceWaves(world);
    expect(world.waveIndex).toBe(2);
    expect(enemies(world)).toHaveLength(2);
  });

  it('does nothing once every wave has spawned', () => {
    const world = createWorld(level1([{ atTick: 0, units: ['swordsman'] }]), 1);
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(1);
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(1);
    expect(world.waveIndex).toBe(1);
  });

  it('does nothing when there are no waves at all', () => {
    const world = createWorld(level1([]), 1);
    advanceWaves(world);
    expect(world.waveIndex).toBe(0);
    expect(enemies(world)).toHaveLength(0);
    // Also drive the pipeline: an empty table must not make the tick throw.
    for (let i = 0; i < 10; i++) step(world, []);
    expect(enemies(world)).toHaveLength(0);
  });
});

describe('advanceWaves — the units it creates', () => {
  it('spawns each unit at full hp', () => {
    const world = createWorld(level1([{ atTick: 0, units: ['swordsman'] }]), 1);
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(1);
    expect(enemies(world)[0].hp).toBe(UNITS.swordsman.maxHp);
  });

  it('puts wave units on advance so they push the player', () => {
    const world = createWorld(level1([{ atTick: 0, units: ['swordsman'] }]), 1);
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(1);
    expect(enemies(world)[0].stance).toBe('advance');
  });

  it('places them on the enemy half of the field', () => {
    const world = createWorld(level1([{ atTick: 0, units: ['swordsman', 'archer'] }]), 1);
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(2);
    for (const u of enemies(world)) {
      expect(u.x).toBeGreaterThan(1500);
      expect(u.x).toBeLessThanOrEqual(world.worldWidth);
    }
  });

  it('does not spawn units for the player', () => {
    const world = createWorld(level1([{ atTick: 0, units: ['swordsman'] }]), 1);
    const before = world.units.filter((u) => u.side === 'player').length;
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(1);
    expect(world.units.filter((u) => u.side === 'player')).toHaveLength(before);
  });

  it('gives each wave unit a unique id', () => {
    const world = createWorld(
      level1([{ atTick: 0, units: ['swordsman', 'swordsman', 'archer'] }]),
      1,
    );
    advanceWaves(world);
    expect(enemies(world)).toHaveLength(3);
    const ids = world.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic across repeated runs', () => {
    const build = () => createWorld(level1([{ atTick: 0, units: ['swordsman', 'archer'] }]), 7);
    const a = build();
    const b = build();
    advanceWaves(a);
    advanceWaves(b);
    expect(enemies(a)).toHaveLength(2);
    expect(a.units.map((u) => `${u.id}:${u.typeId}:${u.x}`)).toEqual(
      b.units.map((u) => `${u.id}:${u.typeId}:${u.x}`),
    );
  });
});

describe('advanceWaves — integration', () => {
  it('runs through the real tick pipeline', () => {
    const world = createWorld(level1([{ atTick: 3, units: ['swordsman'] }]), 1);
    for (let i = 0; i < 4; i++) step(world, []);
    expect(enemies(world)).toHaveLength(1);
  });

  it('does not break the level-1 "no instant win" guard', () => {
    // Regression pairing: the wave system and the annihilation guard must hold
    // together, since either alone leaves level 1 broken.
    const world = createWorld(level1([{ atTick: 200, units: ['swordsman'] }]), 1);
    for (let i = 0; i < 100; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });
});

describe('advanceWaves — endless mode', () => {
  const endlessCfg = (over: Partial<MatchConfig> = {}): MatchConfig => ({
    ...DEFAULT_MATCH,
    levelId: 'endless-probe',
    startMiners: { player: 3, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    enemyAi: 'scripted',
    endless: true,
    waves: [],
    ...over,
  });

  it('generates a wave even when the table starts empty', () => {
    // The whole point: `waves: []` must not mean "no enemy ever".
    const world = createWorld(endlessCfg(), 1);
    for (let i = 0; i < 900; i++) step(world, []);
    expect(enemies(world).length, 'a wave should have arrived').toBeGreaterThan(0);
  });

  it('keeps generating wave after wave', () => {
    const world = createWorld(endlessCfg(), 1);
    // Wave N is due at 750*N, so after 750*6 ticks exactly 5 have spawned
    // (wave 6 is due AT 4500 and lands on the following tick).
    for (let i = 0; i < 750 * 6; i++) step(world, []);
    expect(world.waveIndex, 'five waves should have spawned').toBe(5);

    // And generation does not stop there — that is the "endless" part.
    for (let i = 0; i < 750 * 6; i++) step(world, []);
    expect(world.waveIndex, 'generation must continue').toBeGreaterThanOrEqual(10);
  });

  it('does NOT generate for a non-endless level', () => {
    // The regression that matters most: scripted levels keep their fixed table.
    const world = createWorld(endlessCfg({ endless: false, waves: [] }), 1);
    for (let i = 0; i < 3000; i++) step(world, []);
    expect(enemies(world)).toHaveLength(0);
    expect(world.waveIndex).toBe(0);
  });

  it('still respects a SCRIPTED table when not endless', () => {
    const world = createWorld(
      endlessCfg({ endless: false, waves: [{ atTick: 30, units: ['swordsman'] }] }),
      1,
    );
    for (let i = 0; i < 60; i++) step(world, []);
    expect(enemies(world)).toHaveLength(1);
    expect(world.waveIndex).toBe(1);
  });

  it('spawns endless wave units on advance', () => {
    const world = createWorld(endlessCfg(), 1);
    for (let i = 0; i < 900; i++) step(world, []);
    for (const u of enemies(world)) expect(u.stance).toBe('advance');
  });

  it('keeps the one-wave-per-call guarantee in endless', () => {
    // A 4x frame runs several ticks; each tick must still admit at most one
    // wave or the enemy's local density doubles.
    const world = createWorld(endlessCfg(), 1);
    for (let i = 0; i < 750; i++) step(world, []);
    expect(world.waveIndex).toBeLessThanOrEqual(1);
  });
});
