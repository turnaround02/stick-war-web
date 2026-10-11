import { describe, it, expect } from 'vitest';
import { LEVELS, LEVEL_ENDLESS } from '../data/levels';
import { createWorld } from './createWorld';
import { step } from './tick';
import { decideCommands } from './tactic';
import { PLAYER_REFERENCE } from './ai-profile';
import { hashWorld } from './hash';

describe('LEVEL_ENDLESS — shape (spec §8.4.4)', () => {
  it('is the last level in the campaign', () => {
    expect(LEVELS[LEVELS.length - 1]).toBe(LEVEL_ENDLESS);
  });

  it('is endless with no scripted table', () => {
    expect(LEVEL_ENDLESS.endless).toBe(true);
    expect(LEVEL_ENDLESS.waves).toEqual([]);
  });

  it('gives the player an economy to fight with', () => {
    expect(LEVEL_ENDLESS.startMiners.player).toBeGreaterThan(0);
    expect(LEVEL_ENDLESS.startGold.player).toBeGreaterThan(0);
  });

  it('has no enemy economy — its force comes from waves', () => {
    expect(LEVEL_ENDLESS.enemyAi).toBe('scripted');
    expect(LEVEL_ENDLESS.startMiners.enemy).toBe(0);
  });

  it('uses the default win condition', () => {
    // Endless can only be LOST. The endless flag is what suppresses an
    // annihilation win (see cleanup.ts), not the win condition.
    expect(LEVEL_ENDLESS.winCondition ?? 'annihilation').toBe('annihilation');
  });
});

describe('LEVEL_ENDLESS — the match only ever ends in defeat', () => {
  it('cannot be won by clearing the field', () => {
    const world = createWorld(LEVEL_ENDLESS, 1);
    for (let i = 0; i < 600; i++) step(world, []);
    expect(world.outcome).not.toBe('playerWin');
  });

  it('eventually defeats a passive player', () => {
    const world = createWorld(LEVEL_ENDLESS, 1);
    for (let t = 0; t < 60000 && world.outcome === 'ongoing'; t++) step(world, []);
    expect(world.outcome).toBe('playerLose');
  });

  it('defeats the reference player too, at some wave', () => {
    // Endless is designed to be survivable for a while and then not. If the
    // reference player never lost, the escalation would be too weak to be a
    // difficulty curve at all.
    const world = createWorld(LEVEL_ENDLESS, 1);
    for (let t = 0; t < 90000 && world.outcome === 'ongoing'; t++) {
      step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
    }
    expect(world.outcome).toBe('playerLose');
  });

  it('lasts more than a few waves before losing', () => {
    // The other failure mode: a curve so steep the mode is over immediately.
    const world = createWorld(LEVEL_ENDLESS, 1);
    for (let t = 0; t < 90000 && world.outcome === 'ongoing'; t++) {
      step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
    }
    expect(world.waveIndex, 'should survive several waves').toBeGreaterThanOrEqual(5);
  });

  it('loses at the wave the budget slope was swept for', () => {
    // Pins the MEASURED value, not just a band. A band would still pass if a
    // future change quietly moved the loss from wave 8 to wave 13, and the
    // comment on endlessWaveBudget would then be lying about what it does.
    // (Pinning the exact value is what caught two bad sweeps during M4b.)
    const world = createWorld(LEVEL_ENDLESS, 1);
    for (let t = 0; t < 90000 && world.outcome === 'ongoing'; t++) {
      step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
    }
    expect(world.waveIndex).toBe(8);
  });
});

describe('endless determinism', () => {
  it('produces byte-identical worlds for the same seed', () => {
    const run = () => {
      const world = createWorld(LEVEL_ENDLESS, 4242);
      for (let t = 0; t < 4000; t++) {
        step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
      }
      return hashWorld(world);
    };
    expect(run()).toBe(run());
  });

  it('simulates identically regardless of seed, because nothing consumes rngState', () => {
    // `rngState` is seeded into the world and hashed, but NOTHING in the sim
    // calls nextRandom - so two seeds produce different hashes yet identical
    // gameplay. That is worth pinning: if a future change starts consuming the
    // PRNG, this test SHOULD fail, and the response is to decide whether the new
    // randomness is wanted (and hash its results) - not to delete the test.
    const fingerprint = (seed: number) => {
      const world = createWorld(LEVEL_ENDLESS, seed);
      for (let t = 0; t < 4000; t++) {
        step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
      }
      return {
        outcome: world.outcome,
        waveIndex: world.waveIndex,
        tick: world.tick,
        units: world.units
          .map((u) => `${u.id}:${u.side}:${u.typeId}:${u.x.toFixed(4)}:${u.hp}`)
          .join('|'),
      };
    };
    expect(fingerprint(1)).toEqual(fingerprint(999));
  });
});
