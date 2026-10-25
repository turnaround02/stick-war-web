import { describe, it, expect } from 'vitest';
import { runMatch } from './harness';
import { LEVEL_3 } from '../data/levels';
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
 */
function enemyTrainLedger(seed: number): Record<string, number> {
  const world = createWorld(LEVEL_3, seed);
  const enemy = profileFor('level-3')!;
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
 * "Can win level 3" as a deterministic assertion.
 *
 * Same structure as level-winnable.test.ts: the reference player must beat
 * the level-3 enemy on all 5 seeds, the match must end by destroying the
 * base (winCondition: 'base'), and the duration must land in the 3–6 min
 * window with the exact measured value pinned.
 */

describe('level 3 — the reference player wins', () => {
  for (const seed of SEEDS) {
    it(`wins on seed ${seed}`, () => {
      const r = runMatch(LEVEL_3, seed, 'reference');
      expect(r.outcome, `seed ${seed}: ${JSON.stringify(r)}`).toBe('playerWin');
    });
  }

  it('wins by DESTROYING the base, not by clearing the field', () => {
    const r = runMatch(LEVEL_3, 1, 'reference');
    expect(r.baseHp.enemy).toBe(0);
  });

  it('lands inside the 3-6 minute target', () => {
    const r = runMatch(LEVEL_3, 1, 'reference');
    const seconds = r.ticks / 30;
    expect(seconds, `took ${seconds.toFixed(0)}s`).toBeGreaterThanOrEqual(180);
    expect(seconds, `took ${seconds.toFixed(0)}s`).toBeLessThanOrEqual(360);
  });

  it('takes the duration the enemy profile was swept for', () => {
    // Pins the measured value, not just the window. Re-swept 2026-10-25 when
    // the enemy economy was buffed (startGold 300 / 5 miners) to afford the
    // 400-gold giant: 280s → 192s on all 5 seeds (history in levels.ts).
    const r = runMatch(LEVEL_3, 1, 'reference');
    expect(Math.round(r.ticks / 30)).toBe(192);
  });

  it('lets the player hold 12 population, not 8', () => {
    // The reason this re-sweep happened: the cap was binding from the ramp.
    // 12 = 2 giants (6 pop) + 6 miners, a structure 8 could not hold.
    const r = runMatch(LEVEL_3, 1, 'reference');
    expect(r.survivors.player).toBe(12);
  });

  it('the enemy ACTUALLY builds a giant (M6.4 lesson: no silent no-ops)', () => {
    // M6.4 shipped a buildOrder change that was a no-op because the enemy
    // could never afford the giant. The economy was re-swept to fix that, so
    // this assertion is the point of the whole re-sweep: replay the real path
    // with a train-command ledger and require giant ≥ 1 in the enemy orders.
    const built = enemyTrainLedger(1);
    expect(built.giant, `enemy trained: ${JSON.stringify(built)}`).toBeGreaterThanOrEqual(1);
  });

  it('can also be LOST', () => {
    const r = runMatch(LEVEL_3, 1, 'none');
    expect(r.outcome).toBe('playerLose');
  });

  it('is deterministic for a given seed', () => {
    expect(runMatch(LEVEL_3, 7, 'reference')).toEqual(runMatch(LEVEL_3, 7, 'reference'));
  });
});
