/**
 * Endless-mode wave generation (spec §8.4.4).
 *
 * Wave N arrives 25 seconds after wave N-1 and is built from a gold budget that
 * grows linearly. Difficulty comes from the BUDGET ALONE — there is no HP or
 * attack multiplier. That was the original design, but measurement killed it:
 * with the budget alone the reference player already loses at wave 8, because
 * the enemy's force is free while the player pays for every replacement out of
 * a fixed income. A multiplier would only make an inevitable loss arrive sooner.
 *
 * DETERMINISTIC BY CONSTRUCTION. No PRNG, no Math.random: the composition is a
 * fixed ladder, so wave 12 is wave 12 on every machine and every run. That is
 * what lets "the player survives N waves" be an assertion rather than a
 * distribution. `sim/rng.ts` exists but is deliberately unused.
 */

import { toTicks } from '../data/constants';
import { UNITS, type UnitTypeId } from '../data/units';
import type { WaveScript } from './types';

/** Seconds between waves. */
export const ENDLESS_WAVE_INTERVAL_SECONDS = 25;

/**
 * Gold budget for a 1-based wave number (spec §8.4.4).
 *
 * The slope is MEASURED, not assumed. Swept by driving LEVEL_ENDLESS through the
 * real tick pipeline with the reference player, five seeds (all identical, since
 * endless generation uses no PRNG):
 *
 *   seed 1 / 7 / 99 / 4242 / 20260926  ->  playerLose at WAVE 8 (225s)
 *
 * That matches the earlier standalone probe, which predicted wave 8 before the
 * mode existed — two independent estimates agreeing, so the slope was left
 * alone rather than tuned to hit spec §8.4.4's original "wave 12-15" claim.
 * That claim was an estimate, not a measurement, and has been corrected in the
 * spec.
 *
 * Note the direction if this ever needs changing: a STEEPER slope (bigger
 * second coefficient) kills the player EARLIER, not later, because the enemy's
 * force is free while the player pays for every replacement.
 */
export function endlessWaveBudget(n: number): number {
  return 100 + 60 * n;
}

/**
 * Which unit types a wave may draw from, as a ladder.
 *
 * Progressive rather than all-at-once: wave 1 being pure swordsmen gives the
 * player something to learn against, and each later stage adds one new problem
 * (ranged, then anti-heavy). A purely random mix would make the curve
 * illegible AND irreproducible.
 */
export const ENDLESS_COMPOSITION_STAGES: readonly { fromWave: number; pool: UnitTypeId[] }[] = [
  { fromWave: 1, pool: ['swordsman'] },
  { fromWave: 4, pool: ['swordsman', 'archer'] },
  { fromWave: 7, pool: ['swordsman', 'archer', 'spearman'] },
];

/** The unit pool available at a given wave. */
function poolFor(n: number): UnitTypeId[] {
  let pool = ENDLESS_COMPOSITION_STAGES[0].pool;
  for (const stage of ENDLESS_COMPOSITION_STAGES) {
    if (n >= stage.fromWave) pool = stage.pool;
  }
  return pool;
}

/**
 * Spends a wave's budget on its available units.
 *
 * Cycles the pool in order rather than picking randomly, so the composition is
 * a deterministic function of the wave number. Buying stops when nothing in the
 * pool is affordable, which leaves a small remainder — that is fine, and it is
 * why the tests assert "never over budget" rather than "exactly on budget".
 */
function composeWave(n: number): UnitTypeId[] {
  const pool = poolFor(n);
  let remaining = endlessWaveBudget(n);
  const units: UnitTypeId[] = [];

  // A hard iteration cap: the budget is finite, so this always terminates, but
  // a guard means a future zero-cost unit cannot spin forever.
  for (let i = 0; i < 500; i++) {
    const affordable = pool.filter((t) => UNITS[t].goldCost <= remaining);
    if (affordable.length === 0) break;
    // Round-robin by position so the mix stays even as the wave grows.
    const pick = affordable[i % affordable.length];
    remaining -= UNITS[pick].goldCost;
    units.push(pick);
  }

  return units;
}

/** The wave for a 1-based wave number. */
export function endlessWaveAt(n: number): WaveScript {
  return {
    atTick: toTicks(ENDLESS_WAVE_INTERVAL_SECONDS * n),
    units: composeWave(n),
  };
}
