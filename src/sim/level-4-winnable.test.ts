import { describe, it, expect } from 'vitest';
import { runMatch } from './harness';
import { LEVEL_4 } from '../data/levels';
import { createWorld } from './createWorld';
import { decideCommands } from './tactic';
import { PLAYER_REFERENCE, profileFor } from './ai-profile';
import { step } from './tick';

const SEEDS = [1, 7, 99, 4242, 20260926];

/**
 * Replays the REAL decision path (tactical layer on both sides, AI commands
 * consumed first — the M4b ordering lesson) and counts every train order the
 * ENEMY issues. Evidence of "the AI actually built X", which match survivors
 * cannot show (a giant that died still proves the build happened).
 *
 * Same helper as level-3's; kept local so each level's ledger stays readable.
 */
function enemyTrainLedger(seed: number): Record<string, number> {
  const world = createWorld(LEVEL_4, seed);
  const enemy = profileFor('level-4')!;
  const built: Record<string, number> = {};
  for (let t = 0; t <= 400 * 30 && world.outcome === 'ongoing'; t++) {
    if (t % 30 === 0) {
      const cmds = [
        ...decideCommands(world, 'enemy', enemy),
        ...decideCommands(world, 'player', PLAYER_REFERENCE),
      ];
      for (const c of cmds) {
        if (c.kind === 'train' && c.side === 'enemy') built[c.typeId] = (built[c.typeId] ?? 0) + 1;
      }
      step(world, cmds);
    } else {
      step(world, []);
    }
  }
  return built;
}

/**
 * "Can win level 4" as a deterministic assertion.
 *
 * The 16-pop legion finale: both sides field every unit type and the enemy's
 * buildOrder places a giant THIRD, so its early-mid shield carries a 400-gold
 * anchor. Duration pinned at the swept 236s (5 seeds identical).
 */
describe('level 4 — the reference player wins the legion battle', () => {
  for (const seed of SEEDS) {
    it(`wins on seed ${seed}`, () => {
      const r = runMatch(LEVEL_4, seed, 'reference');
      expect(r.outcome, `seed ${seed}: ${JSON.stringify(r)}`).toBe('playerWin');
    });
  }

  it('wins by DESTROYING the base, not by clearing the field', () => {
    const r = runMatch(LEVEL_4, 1, 'reference');
    expect(r.baseHp.enemy).toBe(0);
  });

  it('lands inside the 3-6 minute target', () => {
    const r = runMatch(LEVEL_4, 1, 'reference');
    const seconds = r.ticks / 30;
    expect(seconds, `took ${seconds.toFixed(0)}s`).toBeGreaterThanOrEqual(180);
    expect(seconds, `took ${seconds.toFixed(0)}s`).toBeLessThanOrEqual(360);
  });

  it('takes the duration the economy was swept for', () => {
    // Pins the measured value (500/5, giant-mid buildOrder): 236s on all 5
    // seeds. Sweep history lives in the LEVEL_4 comment in data/levels.ts.
    const r = runMatch(LEVEL_4, 1, 'reference');
    expect(Math.round(r.ticks / 30)).toBe(236);
  });

  it('lets the player hold 16 population', () => {
    // The legion premise: the finale is fought at 16 pop, not 12.
    const r = runMatch(LEVEL_4, 1, 'reference');
    expect(r.survivors.player).toBe(16);
  });

  it('the enemy ACTUALLY builds a giant (M6.4 lesson: no silent no-ops)', () => {
    // The buildOrder places the giant third precisely so this assertion can
    // hold; a buildOrder the AI never reaches is a decorative string.
    const built = enemyTrainLedger(1);
    expect(built.giant, `enemy trained: ${JSON.stringify(built)}`).toBeGreaterThanOrEqual(1);
  });

  it('the enemy fields spearmen too (full-legion claim)', () => {
    // The level's identity is "every unit type on the field" — assert the
    // spearman slot of the buildOrder is actually reached.
    const built = enemyTrainLedger(1);
    expect(built.spearman, `enemy trained: ${JSON.stringify(built)}`).toBeGreaterThanOrEqual(1);
  });

  it('can also be LOST', () => {
    const r = runMatch(LEVEL_4, 1, 'none');
    expect(r.outcome).toBe('playerLose');
  });

  it('is deterministic for a given seed', () => {
    expect(runMatch(LEVEL_4, 7, 'reference')).toEqual(runMatch(LEVEL_4, 7, 'reference'));
  });
});
