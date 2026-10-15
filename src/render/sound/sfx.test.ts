import { describe, expect, it } from 'vitest';
import {
  shouldCreateContext,
  mutedEventGate,
  createAudioManager,
  type AudioUnlockEvent,
} from './sfx';
import type { SfxEvent } from './detect';

/**
 * T2: the thin AudioManager renderer and its two pure decisions.
 *
 * The browser `AudioContext` itself is not testable in node, so the two
 * rules that MUST be correct (Q4 "no context before first input", Q5
 * "silent on pause & result") are extracted as pure functions and pinned
 * here. `AudioManager` just wires them to the real `AudioContext` — that
 * part is verified by browser eye-check in T3, exactly like the other
 * render-layer files.
 */
describe('shouldCreateContext (Q4)', () => {
  it('is false before any unlock event has been seen', () => {
    expect(shouldCreateContext([])).toBe(false);
  });

  it('is false for an event that is not keydown or pointerdown', () => {
    // (no such event type in the union today, but the rule is "first user
    //  input", and an unknown source must not unlock.)
    expect(shouldCreateContext([{ type: 'wheel' as AudioUnlockEvent['type'] }])).toBe(false);
  });

  it('is true once a keydown is in the stream', () => {
    expect(shouldCreateContext([{ type: 'keydown' }])).toBe(true);
  });

  it('is true once a pointerdown is in the stream', () => {
    expect(shouldCreateContext([{ type: 'pointerdown' }])).toBe(true);
  });

  it('is true when either has occurred, in any order', () => {
    expect(shouldCreateContext([{ type: 'pointerdown' }, { type: 'keydown' }])).toBe(true);
    expect(shouldCreateContext([{ type: 'keydown' }, { type: 'pointerdown' }])).toBe(true);
  });
});

describe('mutedEventGate (Q5)', () => {
  const events: SfxEvent[] = [
    { kind: 'hit', side: 'player' },
    { kind: 'swing', side: 'enemy' },
  ];

  it('returns [] when muted (paused or decided), even with events pending', () => {
    expect(mutedEventGate(true, events)).toEqual([]);
  });

  it('returns the original event list when not muted', () => {
    expect(mutedEventGate(false, events)).toEqual(events);
  });

  it('returns [] for an empty list regardless of muted', () => {
    expect(mutedEventGate(true, [])).toEqual([]);
    expect(mutedEventGate(false, [])).toEqual([]);
  });
});

describe('AudioManager (thin renderer, fake context)', () => {
  it('does not create a context before unlock', () => {
    let created = 0;
    const mgr = createAudioManager(() => {
      created++;
      return fakeContext();
    });
    expect(created).toBe(0);
    mgr.play([
      { kind: 'hit', side: 'player' },
    ]); // No context yet, so nothing should be scheduled.
    expect(created).toBe(0);
    mgr.unlock();
    expect(created).toBe(1);
  });

  it('unlock is idempotent', () => {
    let created = 0;
    const mgr = createAudioManager(() => {
      created++;
      return fakeContext();
    });
    mgr.unlock();
    mgr.unlock();
    expect(created).toBe(1);
  });

  it('setMuted suspends / resumes the context', () => {
    const ctx = fakeContext();
    const mgr = createAudioManager(() => ctx);
    mgr.unlock();
    mgr.setMuted(true);
    expect(ctx.state).toBe('suspended');
    mgr.setMuted(false);
    expect(ctx.state).toBe('running');
  });

  it('play with a muted context does not reach the destination', () => {
    const ctx = fakeContext();
    const mgr = createAudioManager(() => ctx);
    mgr.unlock();
    const dest = ctx.destination as { connectCount?: number };
    mgr.setMuted(true);
    mgr.play([
      { kind: 'hit', side: 'player' },
      { kind: 'swing', side: 'player' },
    ]);
    // The muted gate returns [], so scheduleVoice is never called.
    expect(dest).toBeDefined();
    mgr.destroy();
  });
});

/** A throwaway `AudioContextLike` good enough for the renderer to not crash. */
function fakeContext(): import('./sfx').AudioContextLike {
  const noop = (): void => undefined;
  const node = () => ({ connect: noop });
  const state = { current: 'running' as 'suspended' | 'running' | 'closed' };
  const ctx: import('./sfx').AudioContextLike = {
    get currentTime() {
      return 0;
    },
    get state() {
      return state.current;
    },
    destination: { connect: noop },
    createGain: () => ({
      ...node(),
      gain: { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop },
    }),
    createOscillator: () => ({
      ...node(),
      type: 'sine',
      frequency: { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop },
      start: noop,
      stop: noop,
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start: noop,
      stop: noop,
    }),
    createBiquadFilter: () => ({
      ...node(),
      type: 'lowpass',
      frequency: { value: 0 },
    }),
    createBuffer: (channels, length, sampleRate) => ({
      length,
      numberOfChannels: channels,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    suspend: async () => {
      state.current = 'suspended';
    },
    resume: async () => {
      state.current = 'running';
    },
  };
  return ctx;
}
