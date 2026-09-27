import { describe, it, expect } from 'vitest';
import {
  LEG_LENGTH,
  LIMB_ORIGIN,
  LIMB_REST_AXIS,
  LIMB_SIZE,
  limbDirection,
  limbLength,
} from './rig';
import { IDLE_POSE, POSE_KEYFRAMES } from './poses';

/**
 * Guards the limb orientation conventions.
 *
 * This file exists because a bug shipped in M1 and survived two milestones:
 * the legs were HORIZONTAL rectangles (`setOrigin(0, 0.5)`, 18px wide, 4px
 * tall) while every pose value assumed they hung DOWN. The result was stickmen
 * standing with their feet stuck out in front instead of under them — visible
 * to a human on every frame, invisible to the test suite, because nothing
 * tested the rig geometry.
 *
 * The assertions below are what make that failure loud.
 */

describe('limb orientation conventions', () => {
  it('legs rest along the vertical axis, arms along the horizontal', () => {
    expect(LIMB_REST_AXIS.leg).toBe('down');
    expect(LIMB_REST_AXIS.arm).toBe('forward');
  });

  it('the leg rectangle is taller than it is thick', () => {
    // Geometry must AGREE with the rest axis. A "down" limb drawn as a
    // rectangle wider than it is tall renders horizontally no matter what the
    // poses say — which is precisely the M1 bug.
    expect(LIMB_SIZE.leg.height).toBeGreaterThan(LIMB_SIZE.leg.width);
    expect(LIMB_REST_AXIS.leg === 'down').toBe(LIMB_SIZE.leg.height > LIMB_SIZE.leg.width);
  });

  it('the arm rectangle is longer than it is thick', () => {
    expect(LIMB_SIZE.arm.width).toBeGreaterThan(LIMB_SIZE.arm.height);
    expect(LIMB_REST_AXIS.arm === 'forward').toBe(LIMB_SIZE.arm.width > LIMB_SIZE.arm.height);
  });

  it('the leg pivots at its top, so it hangs from the hip', () => {
    expect(LIMB_ORIGIN.leg).toEqual({ x: 0.5, y: 0 });
  });

  it('the arm pivots at its left end, so it extends from the shoulder', () => {
    expect(LIMB_ORIGIN.arm).toEqual({ x: 0, y: 0.5 });
  });

  it('reports the leg length as the hip-to-foot distance', () => {
    // STICKMAN_HIP_HEIGHT is derived from this, and it is what puts the feet on
    // the ground line. It is only correct while the leg really does hang down.
    expect(limbLength('leg')).toBe(LEG_LENGTH);
  });
});

describe('limbDirection', () => {
  it('points a resting leg straight down', () => {
    const d = limbDirection('leg', 0);
    expect(d.y).toBeCloseTo(1, 10);
    expect(d.x).toBeCloseTo(0, 10);
  });

  it('points a resting arm straight forward', () => {
    const d = limbDirection('arm', 0);
    expect(d.x).toBeCloseTo(1, 10);
    expect(d.y).toBeCloseTo(0, 10);
  });

  it('keeps the idle legs pointing down', () => {
    for (const angle of [IDLE_POSE.legFront, IDLE_POSE.legBack]) {
      expect(limbDirection('leg', angle).y).toBeGreaterThan(0.9);
    }
  });

  it('swings the legs forward and back during a walk, never sideways', () => {
    const move = POSE_KEYFRAMES.move;
    const xs = move.map((f) => limbDirection('leg', f.pose.legFront).x);
    // The swing must be horizontal...
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
    // ...while both legs stay broadly downward throughout.
    for (const f of move) {
      expect(limbDirection('leg', f.pose.legFront).y).toBeGreaterThan(0.5);
      expect(limbDirection('leg', f.pose.legBack).y).toBeGreaterThan(0.5);
    }
  });

  it('raises the attacking arm up-and-back, then strikes down-and-forward', () => {
    const attack = POSE_KEYFRAMES.attack;
    const windup = limbDirection('arm', attack[0].pose.armFront);
    const contact = limbDirection('arm', attack[1].pose.armFront);
    // Wind-up: hand goes up (negative Y).
    expect(windup.y).toBeLessThan(0);
    // Contact: hand comes down and forward.
    expect(contact.y).toBeGreaterThan(0);
    expect(contact.x).toBeGreaterThan(0);
  });
});
