import { describe, it, expect } from 'vitest';
import { runMatch } from './harness';
import { LEVEL_3 } from '../data/levels';

const SEEDS = [1, 7, 99, 4242, 20260926];

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
    // Pins the measured value, not just the window.
    const r = runMatch(LEVEL_3, 1, 'reference');
    expect(Math.round(r.ticks / 30)).toBe(281);
  });

  it('can also be LOST', () => {
    const r = runMatch(LEVEL_3, 1, 'none');
    expect(r.outcome).toBe('playerLose');
  });

  it('is deterministic for a given seed', () => {
    expect(runMatch(LEVEL_3, 7, 'reference')).toEqual(runMatch(LEVEL_3, 7, 'reference'));
  });
});
