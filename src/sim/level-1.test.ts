import { describe, it, expect } from 'vitest';
import { LEVEL_1 } from '../data/levels';
import { createWorld } from './createWorld';
import { step } from './tick';
import { TICKS_PER_SEC } from '../data/constants';

describe('LEVEL_1 — shape (spec §8.4)', () => {
  it('is a scripted level with no enemy economy', () => {
    expect(LEVEL_1.enemyAi).toBe('scripted');
    expect(LEVEL_1.startMiners.enemy).toBe(0);
  });

  it('gives the enemy no starting army either', () => {
    // The whole enemy force is in the wave table. If this ever gains units,
    // the "no instant win" guard stops being exercised by the real level.
    expect(LEVEL_1.initialUnits?.enemy ?? []).toEqual([]);
  });

  it('gives the enemy a weaker base, as spec §8.4 says', () => {
    expect(LEVEL_1.baseHp.enemy).toBe(1500);
    expect(LEVEL_1.baseHp.player).toBe(3000);
  });

  it('gives the player miners and gold to open with', () => {
    expect(LEVEL_1.startMiners.player).toBeGreaterThan(0);
    expect(LEVEL_1.startGold.player).toBeGreaterThan(0);
  });
});

describe('LEVEL_1 — wave table', () => {
  it('has four waves', () => {
    expect(LEVEL_1.waves).toHaveLength(4);
  });

  it('schedules them at 5s, 50s, 110s and 180s', () => {
    expect(LEVEL_1.waves.map((w) => w.atTick)).toEqual(
      [5, 50, 110, 180].map((s) => s * TICKS_PER_SEC),
    );
  });

  it('matches the spec wave-1 composition exactly', () => {
    expect(LEVEL_1.waves[0].units).toEqual(['swordsman', 'swordsman']);
  });

  it('matches the spec wave-2 composition exactly', () => {
    const w = LEVEL_1.waves[1].units;
    expect(w.filter((u) => u === 'swordsman')).toHaveLength(3);
    expect(w.filter((u) => u === 'archer')).toHaveLength(1);
    expect(w).toHaveLength(4);
  });

  it('matches the spec wave-3 composition exactly', () => {
    const w = LEVEL_1.waves[2].units;
    expect(w.filter((u) => u === 'swordsman')).toHaveLength(4);
    expect(w.filter((u) => u === 'archer')).toHaveLength(2);
    expect(w.filter((u) => u === 'spearman')).toHaveLength(1);
    expect(w).toHaveLength(7);
  });

  it('has eight units in the final wave, in the spec §8.4 mix', () => {
    // Composition, not just length: a length-only assertion would pass for a
    // wave of eight miners, which is not what "8 单位混合编成" means.
    const w = LEVEL_1.waves[3].units;
    expect(w).toHaveLength(8);
    expect(w.filter((u) => u === 'swordsman')).toHaveLength(4);
    expect(w.filter((u) => u === 'archer')).toHaveLength(2);
    expect(w.filter((u) => u === 'spearman')).toHaveLength(2);
    expect(w.filter((u) => u === 'miner')).toHaveLength(0);
  });

  it('escalates: no wave is smaller than the one before', () => {
    const sizes = LEVEL_1.waves.map((w) => w.units.length);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `wave ${i + 1}`).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
  });

  it('never asks for a unit type that does not exist', () => {
    const known = new Set(['miner', 'swordsman', 'archer', 'spearman']);
    for (const w of LEVEL_1.waves) {
      for (const t of w.units) expect(known.has(t), `unknown type ${t}`).toBe(true);
    }
  });
});

describe('LEVEL_1 — through the real pipeline', () => {
  it('does not end on tick 1', () => {
    const world = createWorld(LEVEL_1, 1);
    for (let i = 0; i < 10; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('spawns wave 1 on schedule', () => {
    const world = createWorld(LEVEL_1, 1);
    for (let i = 0; i < 5 * TICKS_PER_SEC + 2; i++) step(world, []);
    expect(world.units.filter((u) => u.side === 'enemy')).toHaveLength(2);
    expect(world.waveIndex).toBe(1);
  });

  it('spawns wave 2 on schedule', () => {
    const world = createWorld(LEVEL_1, 1);
    for (let i = 0; i < 50 * TICKS_PER_SEC + 2; i++) step(world, []);
    expect(world.waveIndex).toBe(2);
    expect(world.units.filter((u) => u.side === 'enemy')).toHaveLength(6);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const world = createWorld(LEVEL_1, 20260926);
      for (let i = 0; i < 200; i++) step(world, []);
      return world.units.map((u) => `${u.id}:${u.typeId}:${u.x.toFixed(3)}`).join('|');
    };
    expect(run()).toBe(run());
  });
});
