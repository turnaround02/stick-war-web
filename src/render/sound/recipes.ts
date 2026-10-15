/**
 * WebAudio synthesis recipes for the six SFX kinds (spec §7.4, §13 Q14, M5c).
 *
 * Each entry is a *description*, not an `AudioContext` graph: it is the
 * pure, constant data the thin `AudioManager` renderer (in `sfx.ts`) turns
 * into oscillators / noise buffers / biquad filters / gains. Keeping the
 * recipes in a separate pure module means the "what do the six sounds look
 * like" decision is inspectable, diffable, and testable without a browser,
 * while `sfx.ts` stays thin and Phaser-independent.
 *
 * Recipe parameters are *tuning knobs*, not assertion targets: the tests
 * in `detect.test.ts` pin the *detection* behaviour (events, cap, priority),
 * never the timbre. If a future designer wants to retune a recipe, that
 * is a spec amendment (spec §10.2 risk #8: "必要时可替换"), not a code bug.
 */

import type { SfxKind } from './detect';

export interface SfxRecipe {
  /**
   * The synthesis voice. `sine`/`square`/`sawtooth`/`triangle` map to an
   * `OscillatorNode` `type`; `noise` maps to a white-noise `AudioBufferSourceNode`.
   */
  voice: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  /**
   * Start / end frequency in Hz. Equal → steady tone. A drop
   * (`start` > `end`) is a frequency sweep, the classic "impact" signature
   * for melee hits.
   */
  startHz: number;
  endHz: number;
  /**
   * Length of the sweep in seconds. 0 means "no sweep, hold `startHz`".
   */
  sweepSec: number;
  /**
   * Overall envelope length in seconds. The gain node is held at
   * `peakGain` for `attackSec`, then linearly falls to 0 by `durSec`.
   */
  attackSec: number;
  durSec: number;
  /** Peak gain. Values above ~0.3 tend to clip when many sounds overlap;
   *  the per-tick cap in `detect.ts` bounds overlap, but the gain is the
   *  final guard against a single-voice clip. */
  peakGain: number;
  /**
   * Low-pass cutoff in Hz. `null` = no filter. Keeps the timbre dull on
   * impact sounds so a "swing" noise does not read as a piercing "ding".
   */
  lowpassHz: number | null;
  /**
   * Optional LFO: a slow sine modulates the gain at `lfoHz` with depth
   * `lfoDepth` (0..1 of peakGain) over the full `durSec`. Used for the
   * base-damage "rattle".
   */
  lfo?: { hz: number; depth: number };
}

/**
 * The six recipes (spec §13 Q14 + M5c §C).
 *
 * Ordering follows `PRIORITY` in `detect.ts` so a reader scanning this file
 * sees the most-impactful sounds first:
 *   hit → swing → death → base → training → gold
 */
export const SFX_RECIPES: Record<SfxKind, SfxRecipe> = {
  // A hit is the load-bearing impact: a low thump with a quick pitch drop
  // reads as "bone/wood". 120→60 Hz is the classic "wood knock" band.
  hit: {
    voice: 'sine',
    startHz: 120,
    endHz: 60,
    sweepSec: 0.12,
    attackSec: 0.005,
    durSec: 0.12,
    peakGain: 0.28,
    lowpassHz: 2000,
  },

  // A swing is a short noise "whoosh" — the air displacement of the blade.
  // Noise through a low-pass at 800 Hz reads as "swish", not "clang".
  swing: {
    voice: 'noise',
    startHz: 0, // ignored for noise voice; present for shape.
    endHz: 0,
    sweepSec: 0,
    attackSec: 0.005,
    durSec: 0.08,
    peakGain: 0.14,
    lowpassHz: 800,
  },

  // Death is the same thump family as `hit` but lower and longer, with a
  // touch more gain — "something heavy hit the ground".
  death: {
    voice: 'sine',
    startHz: 80,
    endHz: 40,
    sweepSec: 0.18,
    attackSec: 0.008,
    durSec: 0.2,
    peakGain: 0.3,
    lowpassHz: 1200,
  },

  // Base damage: a low rumble with a wobble (LFO) so it reads as "structure
  // groaning" rather than a single thump. This is the one recipe that
  // deliberately uses the LFO option.
  base: {
    voice: 'noise',
    startHz: 0,
    endHz: 0,
    sweepSec: 0,
    attackSec: 0.01,
    durSec: 0.4,
    peakGain: 0.22,
    lowpassHz: 150,
    lfo: { hz: 6, depth: 0.4 },
  },

  // Training complete: a single muffled "thud" as the new unit appears.
  // 300 Hz low-pass keeps it "dull" so it is not confused with a hit.
  training: {
    voice: 'sine',
    startHz: 180,
    endHz: 120,
    sweepSec: 0.1,
    attackSec: 0.005,
    durSec: 0.18,
    peakGain: 0.16,
    lowpassHz: 300,
  },

  // Gold credit: a bright two-step "ding". Square wave has lots of upper
  // harmonics; the 1200→2000 rise reads as "coin up" rather than "alarm".
  gold: {
    voice: 'square',
    startHz: 1200,
    endHz: 2000,
    sweepSec: 0.15,
    attackSec: 0.003,
    durSec: 0.15,
    peakGain: 0.09, // square is louder per gain; keep it low.
    lowpassHz: 6000,
  },
};

/**
 * The ordered list of SFX kinds, in `PRIORITY` order. Used by the renderer
 * to decide which voices to build up front when the `AudioContext` is
 * unlocked; also a stable key set for any future tests that enumerate the
 * recipe table.
 */
export const SFX_KINDS: readonly SfxKind[] = [
  'hit',
  'swing',
  'death',
  'base',
  'training',
  'gold',
];
