import { describe, it, expect } from 'vitest';
import { runMatch } from './harness';
import { LEVEL_1 } from '../data/levels';

/**
 * "Can win level N" as a deterministic assertion.
 *
 * Both sides are driven by the same tactical layer with different profiles, so
 * a level being winnable is a property of its DATA, not of a human's reflexes.
 * The reference player must beat the standard enemy; if a future balance change
 * makes a level impossible, this goes red instead of being discovered by a
 * player who cannot finish the game.
 *
 * Spec §11 puts M4's acceptance at "能完整打赢和打输关卡 1 与关卡 2" — win AND
 * lose. A level that cannot be lost is not a level, so both directions are
 * asserted.
 */
const SEEDS = [1, 7, 99, 4242, 20260926];

describe('level 1 — the reference player wins', () => {
  for (const seed of SEEDS) {
    it(`wins on seed ${seed}`, () => {
      const r = runMatch(LEVEL_1, seed, 'reference');
      expect(r.outcome, `seed ${seed}: ${JSON.stringify(r)}`).toBe('playerWin');
    });
  }

  it('wins the same way every time for a given seed', () => {
    const a = runMatch(LEVEL_1, 7, 'reference');
    const b = runMatch(LEVEL_1, 7, 'reference');
    expect(a).toEqual(b);
  });
});

describe('level 1 — a passive player loses', () => {
  it('loses on every seed', () => {
    // Spec §11 requires the level to be LOSABLE, not just winnable, and a
    // player who issues no orders at all is the clearest way to show that the
    // waves are a real threat rather than scenery. The assertion is weak by
    // construction (a do-nothing player can hardly win) — it is here to pin
    // that the WAVES are what end the match, which the reference-player win
    // cannot show on its own.
    for (const seed of SEEDS) {
      const r = runMatch(LEVEL_1, seed, 'none');
      expect(r.outcome, `seed ${seed}: ${JSON.stringify(r)}`).toBe('playerLose');
      expect(r.survivors.player, `seed ${seed}`).toBe(0);
    }
  });

  it('loses to the waves, not to a timeout', () => {
    // A draw (running out of ticks) would also be "not a win", so assert the
    // loss is a real wipe inside the tick budget.
    const r = runMatch(LEVEL_1, 1, 'none');
    expect(r.ticks).toBeLessThan(6000);
    expect(r.survivors.player).toBe(0);
  });
});

describe('level 1 — the outcome is not an artefact of a single shape', () => {
  it('takes a plausible amount of game time to win', () => {
    // A win in a handful of ticks would mean the level collapsed rather than
    // played out — the exact failure the "no instant win" guard exists to stop.
    const r = runMatch(LEVEL_1, 1, 'reference');
    expect(r.ticks).toBeGreaterThan(30 * 30);
  });

  it('gets at least three waves deep before the match ends', () => {
    // The reference player reaches the enemy base and destroys it, which can
    // legitimately happen before the final wave spawns — so this asserts the
    // level actually escalates, not that every wave fires.
    const r = runMatch(LEVEL_1, 1, 'reference');
    expect(r.wavesSpawned).toBeGreaterThanOrEqual(3);
  });

  it('spawns waves against a passive player before the level ends', () => {
    // A passive player is wiped early, so the schedule does not run to the end —
    // that is correct, not a scheduling bug. This just confirms waves are the
    // thing that kills them. The full schedule is asserted in level-1.test.ts.
    const r = runMatch(LEVEL_1, 1, 'none');
    expect(r.wavesSpawned).toBeGreaterThanOrEqual(1);
    expect(r.outcome).toBe('playerLose');
  });
});
