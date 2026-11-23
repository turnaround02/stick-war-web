import { describe, it, expect } from 'vitest';
import { frameIndexFor, attackFrameIndex, FRAMES_PER_STRIP, ATTACK_CONTACT_FRAME } from './anim';
import { CONTACT_PHASE } from './poses';
import { UNIT_TICKS } from '../../data/unitTicks';

/**
 * The strip player's two contracts, pinned as pure arithmetic (iron rule #7):
 *
 * 1. Walk: phase → frame uniformly, wrapping at the cycle end.
 * 2. Attack: CONTACT_PHASE lands on the strike frame — the sprite twin of the
 *    skeletal rig's "blade connects on the damage tick" rule (M2's lesson,
 *    spec §7.1's hard constraint).
 */
describe('frameIndexFor (walk/gather)', () => {
  it('maps phase 0 to frame 0', () => {
    expect(frameIndexFor(0)).toBe(0);
  });

  it('maps the cycle quarters to successive frames', () => {
    expect(frameIndexFor(0.25)).toBe(1);
    expect(frameIndexFor(0.5)).toBe(3);
    expect(frameIndexFor(0.75)).toBe(4);
  });

  it('wraps phase 1 (cycle end) back to frame 0', () => {
    expect(frameIndexFor(1)).toBe(0);
    expect(frameIndexFor(0.999999)).toBe(5);
  });

  it('clamps garbage phases to the valid strip', () => {
    expect(frameIndexFor(-2)).toBe(0);
    expect(frameIndexFor(17)).toBe(0); // 17 % 1 = 0 → frame 0
    expect(frameIndexFor(NaN)).toBe(0);
  });

  it('every frame index stays on the strip for a dense phase sweep', () => {
    for (let i = 0; i < 1000; i++) {
      const idx = frameIndexFor(i / 1000);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(FRAMES_PER_STRIP);
    }
  });
});

describe('attackFrameIndex', () => {
  // Swordsman: windup 8 ticks (0.25s→7.5→8), cooldown 30 (1.0s).
  const t = UNIT_TICKS.swordsman;

  it('starts on the raise frames (0..2) during the windup', () => {
    expect(attackFrameIndex(t.windup, 0, t.windup, t.attackCooldown)).toBe(0);
    // Halfway through the windup.
    expect(attackFrameIndex(Math.ceil(t.windup / 2), 0, t.windup, t.attackCooldown)).toBe(1);
  });

  it('pins CONTACT_PHASE to the strike frame (the damage tick)', () => {
    // windupTicksLeft === 0 is the tick the strike lands (combatSystem applies
    // damage and sets the cooldown on exactly this tick).
    expect(attackFrameIndex(0, t.attackCooldown, t.windup, t.attackCooldown)).toBe(ATTACK_CONTACT_FRAME);
    expect(ATTACK_CONTACT_FRAME).toBe(3);
  });

  it('plays the follow-through (3..5) during recovery, never the raise frames', () => {
    // Early recovery: just past the strike.
    expect(attackFrameIndex(0, t.attackCooldown - 1, t.windup, t.attackCooldown)).toBeGreaterThanOrEqual(3);
    // Late recovery: the final third of the cooldown reaches frame 5.
    expect(attackFrameIndex(0, 1, t.windup, t.attackCooldown)).toBe(5);
  });

  it('degenerate no-windup unit keeps the contact frame', () => {
    expect(attackFrameIndex(0, 0, 0, 0)).toBe(ATTACK_CONTACT_FRAME);
  });

  it('every index stays on the strip across the full cycle', () => {
    for (let w = 0; w <= t.windup; w++) {
      expect(attackFrameIndex(w, 0, t.windup, t.attackCooldown)).toBeLessThan(FRAMES_PER_STRIP);
    }
    for (let c = 0; c <= t.attackCooldown; c++) {
      expect(attackFrameIndex(0, c, t.windup, t.attackCooldown)).toBeLessThan(FRAMES_PER_STRIP);
    }
  });

  it('CONTACT_PHASE stays 0.5 — the attack strip was generated for a mid-strike', () => {
    expect(CONTACT_PHASE).toBe(0.5);
  });
});
