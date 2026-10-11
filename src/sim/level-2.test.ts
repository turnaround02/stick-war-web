import { describe, it, expect } from 'vitest';
import { LEVEL_1, LEVEL_2, LEVELS } from '../data/levels';
import { createWorld } from './createWorld';
import { step } from './tick';

describe('LEVEL_2 — shape (spec §8.4.3)', () => {
  it('is a symmetric economy level with no waves', () => {
    expect(LEVEL_2.enemyAi).toBe('economy');
    expect(LEVEL_2.waves).toEqual([]);
    expect(LEVEL_2.endless).toBe(false);
  });

  it('gives BOTH sides the same economy', () => {
    expect(LEVEL_2.startMiners).toEqual({ player: 3, enemy: 3 });
    expect(LEVEL_2.startGold).toEqual({ player: 200, enemy: 200 });
    expect(LEVEL_2.mineGold).toEqual(LEVEL_1.mineGold);
    expect(LEVEL_2.popCap).toEqual({ player: 60, enemy: 60 });
  });

  it('requires the enemy base to fall', () => {
    // The whole point of level 2: the enemy rebuilds, so "out of units" is not
    // a terminal state and the base is the objective.
    expect(LEVEL_2.winCondition).toBe('base');
  });

  it('has a 1500 HP enemy base', () => {
    expect(LEVEL_2.baseHp.enemy).toBe(1500);
    expect(LEVEL_2.baseHp.player).toBe(3000);
  });

  it('names its own enemy profile', () => {
    expect(LEVEL_2.enemyProfile).toBe('level-2');
  });

  it('starts neither side with an army', () => {
    expect(LEVEL_2.initialUnits?.player ?? []).toEqual([]);
    expect(LEVEL_2.initialUnits?.enemy ?? []).toEqual([]);
  });
});

describe('LEVELS registry', () => {
  it('lists the campaign levels in play order', () => {
    // Level 1, level 2, then endless. Endless is last on purpose: it is entered
    // from level 2's result screen and has no "next level" of its own.
    expect(LEVELS.slice(0, 2)).toEqual([LEVEL_1, LEVEL_2]);
    expect(LEVELS).toHaveLength(3);
  });

  it('has unique level ids', () => {
    const ids = LEVELS.map((l) => l.levelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every level can be built and stepped without throwing', () => {
    for (const level of LEVELS) {
      const world = createWorld(level, 1);
      expect(() => {
        for (let i = 0; i < 300 && world.outcome === 'ongoing'; i++) step(world, []);
      }).not.toThrow();
    }
  });
});

describe('LEVEL_2 — the annihilation rule is gone', () => {
  it('does not end just because the enemy field is empty at t=0', () => {
    const world = createWorld(LEVEL_2, 1);
    for (let i = 0; i < 30; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('does not end when the enemy army is wiped but its base stands', () => {
    const world = createWorld(LEVEL_2, 1);
    // Give the enemy time to build, then delete everything it owns.
    for (let i = 0; i < 1200; i++) step(world, []);
    for (const u of world.units) {
      if (u.side === 'enemy') {
        u.state = 'dead';
        u.hp = 0;
      }
    }
    world.trainingQueue.enemy.length = 0;
    step(world, []);
    expect(world.outcome, 'the base must fall, not the army').toBe('ongoing');
  });

  it('DOES end when the enemy base falls', () => {
    const world = createWorld(LEVEL_2, 1);
    step(world, []);
    world.bases.enemy.hp = 0;
    step(world, []);
    expect(world.outcome).toBe('playerWin');
  });
});
