import { describe, it, expect } from 'vitest';
import { CONTACT_PHASE, POSE_KEYFRAMES, attackPhase } from './poses';
import { UNIT_TICKS } from '../../data/unitTicks';

/**
 * The attack animation must put the blade-contact keyframe on the SAME tick the
 * damage is applied (spec §7.1, called a hard constraint there).
 *
 * The bug this guards: `BattleScene.phaseOf` divided by the WINDUP alone, so
 * phase reached 1.0 on the damage tick while CONTACT_PHASE sat at 0.5 — the
 * visible strike landed halfway through the windup and the blow connected half
 * a windup later, with the arm already recovering. It also froze the pose at
 * 1.0 for the whole cooldown, since `windupTicksLeft` is 0 throughout it.
 *
 * The M2 acceptance item for this was a MANUAL check ("放慢观察"), so nothing
 * failed when it was wrong. These tests are that check, automated.
 */

const SWORDSMAN = UNIT_TICKS.swordsman; // windup 8, cooldown 30

describe('attackPhase', () => {
  it('starts at 0 when the windup begins', () => {
    expect(attackPhase(SWORDSMAN.windup, 0, SWORDSMAN.windup, SWORDSMAN.attackCooldown)).toBe(0);
  });

  it('reaches exactly CONTACT_PHASE on the tick the damage lands', () => {
    // releaseStrike runs when windupTicksLeft hits 0, and sets cooldown to full.
    const phase = attackPhase(0, SWORDSMAN.attackCooldown, SWORDSMAN.windup, SWORDSMAN.attackCooldown);
    expect(phase).toBeCloseTo(CONTACT_PHASE, 10);
  });

  it('is still short of CONTACT_PHASE on the tick BEFORE the strike', () => {
    const phase = attackPhase(1, 0, SWORDSMAN.windup, SWORDSMAN.attackCooldown);
    expect(phase).toBeLessThan(CONTACT_PHASE);
  });

  it('is past CONTACT_PHASE once the recovery begins', () => {
    const phase = attackPhase(0, SWORDSMAN.attackCooldown - 1, SWORDSMAN.windup, SWORDSMAN.attackCooldown);
    expect(phase).toBeGreaterThan(CONTACT_PHASE);
  });

  it('reaches 1 at the end of the cooldown', () => {
    expect(attackPhase(0, 0, SWORDSMAN.windup, SWORDSMAN.attackCooldown)).toBeCloseTo(1, 10);
  });

  it('never decreases across a whole attack cycle', () => {
    // A pose that jumps backwards reads as a glitch. Walk the real sequence:
    // windup counts down, then the strike sets cooldown, then cooldown counts.
    const { windup, attackCooldown: cd } = SWORDSMAN;
    const phases: number[] = [];
    for (let w = windup; w > 0; w--) phases.push(attackPhase(w, 0, windup, cd));
    for (let c = cd; c >= 0; c--) phases.push(attackPhase(0, c, windup, cd));

    for (let i = 1; i < phases.length; i++) {
      expect(phases[i], `phase went backwards at step ${i}`).toBeGreaterThanOrEqual(phases[i - 1]);
    }
  });

  it('stays within [0, 1] across the cycle', () => {
    const { windup, attackCooldown: cd } = SWORDSMAN;
    for (let w = windup; w >= 0; w--) {
      const p = attackPhase(w, 0, windup, cd);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    for (let c = cd; c >= 0; c--) {
      const p = attackPhase(0, c, windup, cd);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('holds the contact pose rather than dividing by zero when timings are degenerate', () => {
    // A unit with no windup and no cooldown must not produce NaN.
    expect(Number.isFinite(attackPhase(0, 0, 0, 0))).toBe(true);
    expect(attackPhase(0, 0, 0, 0)).toBe(CONTACT_PHASE);
  });

  it('works for every unit that can attack', () => {
    for (const typeId of ['swordsman', 'archer', 'spearman'] as const) {
      const t = UNIT_TICKS[typeId];
      const contact = attackPhase(0, t.attackCooldown, t.windup, t.attackCooldown);
      expect(contact, `${typeId} contact phase`).toBeCloseTo(CONTACT_PHASE, 10);
    }
  });
});

describe('CONTACT_PHASE', () => {
  it('sits strictly between the raise and the recovery', () => {
    expect(CONTACT_PHASE).toBeGreaterThan(0);
    expect(CONTACT_PHASE).toBeLessThan(1);
  });

  it('matches the attack keyframe that is labelled as the contact moment', () => {
    // The constant and the keyframe array must not drift apart.
    const hasContactFrame = POSE_KEYFRAMES.attack.some(
      (f) => Math.abs(f.atPhase - CONTACT_PHASE) < 1e-9,
    );
    expect(hasContactFrame).toBe(true);
  });
});
