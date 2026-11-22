import { describe, it, expect } from 'vitest';
import { shouldUseSprite, SPRITE_STATES } from './switch';
import type { UnitState } from '../../sim/types';

/**
 * The renderer switch is the ONLY rule deciding sprite vs skeleton (iron rule
 * #7: it lives in a Phaser-free module precisely so it can be asserted here).
 * These tests pin the contract: sprite preference replaces the STATIC poses
 * only, and the skeleton is never lost as a fallback.
 */

const ALL_STATES: readonly UnitState[] = [
  'idle',
  'move',
  'gather',
  'attack',
  'stunned',
  'dead',
];

describe('shouldUseSprite', () => {
  it('uses the sprite for idle when the preference is sprite', () => {
    expect(shouldUseSprite('sprite', 'idle')).toBe(true);
  });

  it('uses the sprite for stunned when the preference is sprite', () => {
    // A stunned unit is standing still, so a static portrait is honest.
    expect(shouldUseSprite('sprite', 'stunned')).toBe(true);
  });

  it('falls back to the skeleton for move (needs the walk cycle)', () => {
    expect(shouldUseSprite('sprite', 'move')).toBe(false);
  });

  it('falls back to the skeleton for gather (needs the walk cycle)', () => {
    expect(shouldUseSprite('sprite', 'gather')).toBe(false);
  });

  it('falls back to the skeleton for attack (needs the swing)', () => {
    expect(shouldUseSprite('sprite', 'attack')).toBe(false);
  });

  it('falls back to the skeleton for dead', () => {
    expect(shouldUseSprite('sprite', 'dead')).toBe(false);
  });

  it('NEVER uses a sprite when the preference is skeleton, in any state', () => {
    for (const state of ALL_STATES) {
      expect(shouldUseSprite('skeleton', state)).toBe(false);
    }
  });

  it('uses a sprite for exactly the states in SPRITE_STATES when pref is sprite', () => {
    for (const state of ALL_STATES) {
      expect(shouldUseSprite('sprite', state)).toBe(SPRITE_STATES.has(state));
    }
  });

  it('SPRITE_STATES contains only static poses (no locomotion, no attack)', () => {
    expect(SPRITE_STATES.has('idle')).toBe(true);
    expect(SPRITE_STATES.has('stunned')).toBe(true);
    expect(SPRITE_STATES.has('move')).toBe(false);
    expect(SPRITE_STATES.has('gather')).toBe(false);
    expect(SPRITE_STATES.has('attack')).toBe(false);
    expect(SPRITE_STATES.has('dead')).toBe(false);
  });
});
