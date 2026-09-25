import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { DEFAULT_MATCH } from '../data/levels';
import { BASE_HP, POP_CAP, WORLD_WIDTH } from '../data/constants';

describe('createWorld', () => {
  it('starts at tick 0 with no outcome', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    expect(world.tick).toBe(0);
    expect(world.outcome).toBe('ongoing');
  });

  it('stores the seed in rngState', () => {
    expect(createWorld(DEFAULT_MATCH, 4242).rngState).toBe(4242);
  });

  it('creates both bases at full hp', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    expect(world.bases.player.hp).toBe(BASE_HP);
    expect(world.bases.enemy.hp).toBe(BASE_HP);
    expect(world.bases.player.maxHp).toBe(BASE_HP);
  });

  it('creates one mine per side with gold', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    expect(world.mines.player.goldLeft).toBeGreaterThan(0);
    expect(world.mines.enemy.goldLeft).toBeGreaterThan(0);
  });

  it('starts with no units when startMiners is 0', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    expect(world.units).toHaveLength(0);
  });

  it('spawns the requested starting miners on the correct side', () => {
    const config = {
      ...DEFAULT_MATCH,
      startMiners: { player: 3, enemy: 1 },
    };
    const world = createWorld(config, 1);

    const playerMiners = world.units.filter((u) => u.side === 'player' && u.typeId === 'miner');
    const enemyMiners = world.units.filter((u) => u.side === 'enemy' && u.typeId === 'miner');

    expect(playerMiners).toHaveLength(3);
    expect(enemyMiners).toHaveLength(1);
  });

  it('assigns unique unit ids', () => {
    const config = { ...DEFAULT_MATCH, startMiners: { player: 4, enemy: 4 } };
    const world = createWorld(config, 1);
    const ids = world.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(world.nextUnitId).toBeGreaterThan(Math.max(...ids));
  });

  it('keeps every unit inside the world bounds', () => {
    const config = { ...DEFAULT_MATCH, startMiners: { player: 10, enemy: 10 } };
    const world = createWorld(config, 1);
    for (const unit of world.units) {
      expect(unit.x).toBeGreaterThanOrEqual(0);
      expect(unit.x).toBeLessThanOrEqual(WORLD_WIDTH);
    }
  });

  it('initialises prevX equal to x so interpolation has no first-frame jump', () => {
    const config = { ...DEFAULT_MATCH, startMiners: { player: 2, enemy: 0 } };
    const world = createWorld(config, 1);
    for (const unit of world.units) {
      expect(unit.prevX).toBe(unit.x);
    }
  });

  it('counts starting units against the population cap', () => {
    const config = { ...DEFAULT_MATCH, startMiners: { player: 3, enemy: 0 } };
    const world = createWorld(config, 1);
    expect(world.popUsed.player).toBe(3);
    expect(world.popUsed.player).toBeLessThanOrEqual(POP_CAP);
  });

  it('produces identical worlds for identical seeds', () => {
    const a = createWorld(DEFAULT_MATCH, 777);
    const b = createWorld(DEFAULT_MATCH, 777);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not throw when a side has zero units', () => {
    const config = { ...DEFAULT_MATCH, startMiners: { player: 0, enemy: 0 } };
    expect(() => createWorld(config, 1)).not.toThrow();
  });
});
