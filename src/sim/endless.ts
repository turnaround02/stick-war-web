/**
 * Endless-mode wave generation (spec §8.4.4).
 *
 * PLACEHOLDER: Task 3 replaces the body with the real budget formula and
 * composition ladder. This stub exists so the wave-plumbing task can be
 * verified independently of the generation rules.
 */

import { toTicks } from '../data/constants';
import type { WaveScript } from './types';

/** Every 25 seconds. */
const WAVE_INTERVAL_SECONDS = 25;

/** The wave for a 1-based wave number. */
export function endlessWaveAt(n: number): WaveScript {
  return {
    atTick: toTicks(WAVE_INTERVAL_SECONDS * n),
    units: ['swordsman', 'swordsman'],
  };
}
