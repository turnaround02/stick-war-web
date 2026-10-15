/**
 * Thin WebAudio renderer for the six SFX (spec §7.4, M5c).
 *
 * This is the ONLY module in `render/sound/` that touches the browser audio
 * API. The two rules the spec hard-pins (Q4 "no `AudioContext` before first
 * user input", Q5 "silent on pause & result") live here as PURE functions
 * (`shouldCreateContext`, `mutedEventGate`) so they are testable in node;
 * `AudioManager` just wires them to a real `AudioContext`. The scene calls
 * `unlock()` on first key/pointer input, `setMuted()` on pause/decide, and
 * `play(events)` each tick with the `diffSfx` output.
 *
 * The `AudioContext` is created LAZILY, on the first `unlock()` — before that
 * there is no `AudioContext` at all, which is exactly what Q4 requires.
 */

import { SFX_RECIPES, type SfxRecipe } from './recipes';
import type { SfxEvent } from './detect';

/** The input events that unlock audio. Anything else (wheel, etc.) does not. */
export interface AudioUnlockEvent {
  type: 'keydown' | 'pointerdown' | (string & {});
}

/**
 * Q4: has any real user input happened yet?
 *
 * Pure and stateless: it inspects the stream of input events the scene has
 * recorded and returns whether at least one was a `keydown` or
 * `pointerdown`. The scene feeds this every frame; once it returns true the
 * `AudioContext` is (re)created exactly once.
 */
export function shouldCreateContext(events: readonly AudioUnlockEvent[]): boolean {
  return events.some((e) => e.type === 'keydown' || e.type === 'pointerdown');
}

/**
 * Q5: gate events on mute. Paused or a decided match must be silent.
 *
 * The scene sets this true when `paused` or `outcome !== 'ongoing'`. A muted
 * gate returns no events, so `play` produces no sound even if the detector
 * still reported hits.
 */
export function mutedEventGate(muted: boolean, events: readonly SfxEvent[]): SfxEvent[] {
  if (muted) return [];
  return [...events];
}

/**
 * The shape of the real `AudioContext` we use. Declared here (instead of
 * importing the DOM lib) so a test can supply a fake, and so the renderer is
 * not coupled to the exact platform type.
 */
export interface AudioContextLike {
  currentTime: number;
  state: 'suspended' | 'running' | 'closed';
  destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

interface AudioNodeLike {
  connect(dest: unknown): void;
}
interface GainNodeLike extends AudioNodeLike {
  gain: { value: number; setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void };
}
interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  frequency: { value: number; setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void };
  start(t?: number): void;
  stop(t?: number): void;
}
interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  start(t?: number): void;
  stop(t?: number): void;
}
interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  frequency: { value: number };
}
interface AudioBufferLike {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioManager {
  /** Lazily create the `AudioContext` (first user input). Idempotent. */
  unlock(): void;
  /** Q5: mute (pause/result) or unmute. Suspends/resumes the context. */
  setMuted(muted: boolean): void;
  /** Play the events `diffSfx` produced this tick. No-op while muted. */
  play(events: readonly SfxEvent[]): void;
  /** Release the `AudioContext`. */
  destroy(): void;
}

/** Factory so tests can inject a fake context. Defaults to the browser one. */
export type AudioContextFactory = () => AudioContextLike;

function defaultContextFactory(): AudioContextLike {
  // `AudioContext` is declared in the DOM lib, but the real constructor only
  // exists in a browser. We cast through `unknown` so node never touches it.
  const Ctor = (globalThis as Record<string, unknown>)['AudioContext'] as
    | (new () => AudioContextLike)
    | undefined;
  if (!Ctor) throw new Error('Web Audio is not supported in this environment');
  return new Ctor();
}

/**
 * Builds a white-noise buffer of `durationSec` seconds. Reused for every
 * "noise" recipe so we allocate it once, not once per hit.
 */
function makeNoiseBuffer(ctx: AudioContextLike, durationSec: number, sampleRate: number): AudioBufferLike {
  const length = Math.max(1, Math.floor(durationSec * sampleRate));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic-ish noise: a simple LCG keeps it reproducible across a
  // build (audio timbre is not a test target, but stability avoids a
  // per-play allocation spike).
  let seed = 0x1234abcd;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buffer;
}

function voiceOf(ctx: AudioContextLike, recipe: SfxRecipe, sampleRate: number): AudioNodeLike {
  if (recipe.voice === 'noise') {
    const src = ctx.createBufferSource();
    const maxDur = Math.max(recipe.durSec, recipe.sweepSec);
    src.buffer = makeNoiseBuffer(ctx, maxDur, sampleRate);
    return src;
  }
  const osc = ctx.createOscillator();
  osc.type = recipe.voice; // 'sine' | 'square' | 'sawtooth' | 'triangle'
  return osc;
}

/**
 * Plays one recipe. The node graph is:
 *   voice (osc|noise) -> [lowpass] -> gain (envelope) -> destination
 * and is torn down after `durSec` so no nodes leak per hit.
 */
function scheduleVoice(ctx: AudioContextLike, recipe: SfxRecipe, sampleRate: number): void {
  const start = ctx.currentTime;
  const voice = voiceOf(ctx, recipe, sampleRate);
  const gain = ctx.createGain();

  // Frequency / sweep.
  if (recipe.voice !== 'noise') {
    const freq = (voice as OscillatorNodeLike).frequency;
    freq.setValueAtTime(recipe.startHz, start);
    if (recipe.sweepSec > 0) {
      freq.linearRampToValueAtTime(recipe.endHz, start + recipe.sweepSec);
    }
  }

  let chain: AudioNodeLike = voice;

  // Low-pass dulls impact sounds so a "swing" noise does not read as a "ding".
  if (recipe.lowpassHz !== null) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = recipe.lowpassHz;
    chain.connect(filter);
    chain = filter;
  }

  chain.connect(gain);
  gain.connect(ctx.destination);

  // Envelope: hold peak for attackSec, ramp to 0 by durSec.
  const g = gain.gain;
  g.setValueAtTime(0, start);
  g.setValueAtTime(recipe.peakGain, start + recipe.attackSec);
  g.linearRampToValueAtTime(0, start + recipe.durSec);

  // Optional LFO: a slow sine on the gain depth — the base-damage "rattle".
  if (recipe.lfo) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = recipe.lfo.hz;
    lfoGain.gain.value = recipe.peakGain * recipe.lfo.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start(start);
    lfo.stop(start + recipe.durSec);
  }

  // Start and stop the voice over the full duration.
  const v = voice as OscillatorNodeLike | BufferSourceNodeLike;
  v.start(start);
  v.stop(start + recipe.durSec);
}

/**
 * The concrete renderer. Owns a lazily-created `AudioContext` and the
 * mute flag; delegates the two spec rules to the pure functions above.
 */
export function createAudioManager(
  factory: AudioContextFactory = defaultContextFactory,
): AudioManager {
  let ctx: AudioContextLike | null = null;
  let muted = false;
  let destroyed = false;

  return {
    unlock(): void {
      if (destroyed || ctx !== null) return;
      ctx = factory();
      // A context may start suspended (autoplay policy); resume it.
      void ctx.resume();
      muted = false;
    },

    setMuted(next: boolean): void {
      muted = next;
      if (ctx === null) return; // Nothing to suspend yet.
      if (next) void ctx.suspend();
      else void ctx.resume();
    },

    play(events: readonly SfxEvent[]): void {
      // Q5: silence when muted (paused / decided) even if events are pending.
      const toPlay = mutedEventGate(muted, events);
      if (ctx === null || destroyed || toPlay.length === 0) return;
      for (const ev of toPlay) {
        const recipe = SFX_RECIPES[ev.kind];
        if (!recipe) continue;
        scheduleVoice(ctx, recipe, 44100);
      }
    },

    destroy(): void {
      destroyed = true;
      if (ctx !== null) {
        void ctx.suspend();
        ctx = null;
      }
    },
  };
}
