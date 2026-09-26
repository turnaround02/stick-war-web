import { describe, it, expect } from 'vitest';
import { runScenario } from './harness';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import type { Scenario } from './harness';
import type { MatchConfig } from './types';

/**
 * spec §11 M2 acceptance, as executable criteria.
 *
 * Deliberately does NOT assert who wins. Which side wins is a BALANCE
 * question — that is what the harness matrix is for. M2 only has to prove the
 * mechanics are correct and reproducible.
 */

const clash: Scenario = {
  name: 'acceptance clash',
  player: { swordsman: 6, archer: 3 },
  enemy: { swordsman: 6, archer: 3 },
};

describe('M2 acceptance 1: units engage automatically', () => {
  it('produces first blood within 400 ticks from a 600px gap', () => {
    const config: MatchConfig = {
      ...DEFAULT_MATCH,
      startMiners: { player: 0, enemy: 0 },
      initialUnits: {
        player: ['swordsman', 'swordsman'],
        enemy: ['swordsman', 'swordsman'],
      },
    };
    const world = createWorld(config, 1);

    // Pull the sides 600px apart, then let them advance.
    world.units.forEach((u, i) => {
      u.stance = 'advance';
      if (u.side === 'player') u.x = 1000 + i * 30;
      else u.x = 1600 + i * 30;
      u.prevX = u.x;
    });

    let firstBloodTick = -1;
    for (let t = 0; t < 400 && world.outcome === 'ongoing'; t++) {
      step(world, []);
      if (world.stats.player.damageDealt + world.stats.enemy.damageDealt > 0) {
        firstBloodTick = t;
        break;
      }
    }

    expect(firstBloodTick).toBeGreaterThanOrEqual(0);
    expect(firstBloodTick).toBeLessThan(400);
  });
});

describe('M2 acceptance 2: fights finish cleanly', () => {
  it('reaches a verdict within 6000 ticks', () => {
    const r = runScenario(clash, 20260926);
    expect(r.ticks).toBeLessThanOrEqual(6000);
    expect(['player', 'enemy']).toContain(r.winner);
  });

  it('leaves no allies overlapped', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runScenario(clash, seed);
      expect(r.finalOverlapViolations, `seed ${seed}`).toBe(0);
    }
  });
});

describe('M2 acceptance 3: results are reproducible', () => {
  it('produces byte-identical hashes for the same seed', () => {
    const a = runScenario(clash, 424242);
    const b = runScenario(clash, 424242);
    expect(a.hash).toBe(b.hash);
    expect(a.ticks).toBe(b.ticks);
    expect(a.survivors).toEqual(b.survivors);
    expect(a.damageDealt).toEqual(b.damageDealt);
  });

  it('produces different hashes for different seeds', () => {
    // Not guaranteed in principle, but with 9 units a collision would signal
    // that the seed is not actually reaching the simulation.
    const a = runScenario(clash, 1);
    const b = runScenario(clash, 999999);
    expect(a.hash).not.toBe(b.hash);
  });

  it('is stable across many consecutive runs', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 5; i++) hashes.add(runScenario(clash, 77).hash);
    expect(hashes.size).toBe(1);
  });

  it('hashes identically after a step-by-step replay', () => {
    // The strongest form: drive the sim manually and confirm the hash matches
    // the harness's, proving the harness adds no hidden state.
    const config: MatchConfig = {
      ...DEFAULT_MATCH,
      startMiners: { player: 0, enemy: 0 },
      initialUnits: {
        player: ['archer', 'swordsman'],
        enemy: ['archer', 'swordsman'],
      },
    };
    const manual = createWorld(config, 5150);
    for (let i = 0; i < 900 && manual.outcome === 'ongoing'; i++) step(manual, []);

    const viaHarness = runScenario(
      { name: 'replay', player: { swordsman: 1, archer: 1 }, enemy: { swordsman: 1, archer: 1 } },
      5150,
      900,
    );

    // Same roster and seed must reach the same state by either route.
    expect(hashWorld(manual)).toBe(viaHarness.hash);
  });
});
