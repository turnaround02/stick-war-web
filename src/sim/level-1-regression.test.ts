import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { decideCommands } from './tactic';
import { PLAYER_REFERENCE } from './ai-profile';
import { step } from './tick';
import { LEVEL_1 } from '../data/levels';
import type { World } from './types';

/**
 * Level 1's behaviour is FROZEN.
 *
 * M4b changes the win-condition semantics and the ranged damage path, and both
 * sit on level 1's code path. This test is the safety net that proves the
 * milestone did not disturb it.
 *
 * It fingerprints UNIT STATE ONLY, not the world hash. That distinction is
 * load-bearing: M4b adds `winCondition` to hashWorld, and adding a hashed field
 * changes EVERY hash string, so "the hash is unchanged" is not available as
 * evidence here. Unit state is what "behaviour" means.
 *
 * The values below were captured on M4a (567 tests green) and are identical
 * across all five seeds, because level 1's scripted path consumes no RNG.
 */
function unitsFingerprint(w: World): string {
  let h = 0x811c9dc5;
  const s = w.units
    .map(
      (u) =>
        `${u.id}:${u.side}:${u.typeId}:${u.x.toFixed(4)}:${u.hp}:${u.state}:${u.stance}:${
          u.target === null
            ? '-'
            : u.target.kind + (u.target.kind === 'unit' ? u.target.id : u.target.side)
        }:${u.windupTicksLeft}:${u.cooldownTicksLeft}:${u.gatherTicksLeft}:${u.carrying}`,
    )
    .join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const SEEDS = [1, 7, 99, 4242, 20260926];
const CHECKPOINTS: Record<number, string> = {
  300: 'e1f9e800',
  1500: '3a014bc5',
  3300: '2c8f6ead',
  5400: '988487fd',
  6000: '3e759661',
};

function play(seed: number): { world: World; decidedAt: number } {
  const world = createWorld(LEVEL_1, seed);
  for (let t = 1; t <= 12000; t++) {
    step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
    if (world.outcome !== 'ongoing') return { world, decidedAt: t };
  }
  return { world, decidedAt: -1 };
}

describe('level 1 is frozen (M4a golden)', () => {
  for (const seed of SEEDS) {
    it(`matches the golden unit fingerprint at every checkpoint (seed ${seed})`, () => {
      const world = createWorld(LEVEL_1, seed);
      const seen: Record<number, string> = {};
      for (let t = 1; t <= 6000; t++) {
        step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
        if (CHECKPOINTS[t] !== undefined) seen[t] = unitsFingerprint(world);
      }
      for (const [tick, expected] of Object.entries(CHECKPOINTS)) {
        expect(seen[Number(tick)], `tick ${tick} (seed ${seed})`).toBe(expected);
      }
    });
  }

  for (const seed of SEEDS) {
    it(`reaches the same verdict at the same tick (seed ${seed})`, () => {
      const { world, decidedAt } = play(seed);
      expect(world.outcome).toBe('playerWin');
      expect(decidedAt).toBe(6593);
      expect(unitsFingerprint(world)).toBe('84670d95');
    });
  }

  it('is still a level you can LOSE', () => {
    // The golden values above all describe the WINNING path. A regression test
    // that only covers the win would not notice if M4b made the level
    // unwinnable-or-unlosable.
    const world = createWorld(LEVEL_1, 1);
    for (let t = 0; t < 12000 && world.outcome === 'ongoing'; t++) step(world, []);
    expect(world.outcome).toBe('playerLose');
  });
});
