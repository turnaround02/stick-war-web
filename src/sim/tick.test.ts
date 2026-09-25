import { describe, it, expect } from 'vitest';
import { TICK_SYSTEMS, step } from './tick';
import { createWorld } from './createWorld';
import { DEFAULT_MATCH } from '../data/levels';

describe('TICK_SYSTEMS order', () => {
  it('runs exactly six systems', () => {
    expect(TICK_SYSTEMS).toHaveLength(6);
  });

  it('runs them in the documented order (spec §6.1)', () => {
    // economy -> commands -> ai -> movement -> combat -> cleanup
    expect(TICK_SYSTEMS.map((s) => s.name)).toEqual([
      'economySystem',
      'commandsSystem',
      'aiSystem',
      'movementSystem',
      'combatSystem',
      'cleanupSystem',
    ]);
  });
});

describe('step', () => {
  it('advances the tick counter by one', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    step(world, []);
    expect(world.tick).toBe(1);
    step(world, []);
    expect(world.tick).toBe(2);
  });

  it('does not throw when both sides have zero units', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    expect(world.units).toHaveLength(0);
    expect(() => {
      for (let i = 0; i < 10; i++) step(world, []);
    }).not.toThrow();
    expect(world.tick).toBe(10);
  });

  it('does not throw when only one side has units', () => {
    const world = createWorld(
      { ...DEFAULT_MATCH, startMiners: { player: 5, enemy: 0 } },
      1,
    );
    expect(() => {
      for (let i = 0; i < 10; i++) step(world, []);
    }).not.toThrow();
  });

  it('is deterministic: same seed and same commands produce identical worlds', () => {
    const runOnce = () => {
      const world = createWorld({ ...DEFAULT_MATCH, startMiners: { player: 3, enemy: 3 } }, 999);
      for (let i = 0; i < 120; i++) step(world, []);
      return JSON.stringify(world);
    };
    expect(runOnce()).toBe(runOnce());
  });

  it('keeps every unit x a finite number inside the world', () => {
    const world = createWorld({ ...DEFAULT_MATCH, startMiners: { player: 6, enemy: 6 } }, 3);
    for (let i = 0; i < 60; i++) step(world, []);
    for (const unit of world.units) {
      expect(Number.isFinite(unit.x)).toBe(true);
      expect(unit.x).toBeGreaterThanOrEqual(0);
      expect(unit.x).toBeLessThanOrEqual(DEFAULT_MATCH.worldWidth);
    }
  });

  it('leaves outcome ongoing during a quiet skirmish', () => {
    const world = createWorld(DEFAULT_MATCH, 1);
    for (let i = 0; i < 300; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });
});
