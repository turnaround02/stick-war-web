/**
 * The stickman rig's orientation conventions, kept free of Phaser.
 *
 * This module exists because the rig had an undocumented mismatch that shipped
 * a visible bug for three milestones: the LEG rectangles were drawn horizontally
 * (`setOrigin(0, 0.5)`, 18px wide) while every pose value in `poses.ts` was
 * written as though a leg hung straight down. A stickman therefore stood with
 * its feet stuck out in front of it.
 *
 * The mismatch was invisible to the suite because `skeleton.ts` needs a Phaser
 * scene and cannot be unit-tested in the node environment. Pulling the
 * conventions out here — where they can be asserted — is the fix for the class
 * of bug, not just this instance.
 *
 * TWO CONVENTIONS DELIBERATELY COEXIST, because the pose values were authored
 * against them and both produce correct motion:
 *
 *   LEGS hang from the hip.  Angle 0 = straight down; positive swings the foot
 *                            forward. Drawn as a TALL rectangle, pivot at the
 *                            top edge.
 *   ARMS extend from the shoulder. Angle 0 = straight forward; positive swings
 *                            the hand down. Drawn as a WIDE rectangle, pivot at
 *                            the inner end.
 *
 * `poses.ts` documents each angle set separately for this reason.
 */

/** A unit direction vector in screen space (+X right, +Y down). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Which way a limb points when its angle is 0. */
export type RestAxis = 'down' | 'forward';

export type LimbKind = 'leg' | 'arm';

const LIMB_THICKNESS = 4;

/** Leg length in px. Also the hip-to-foot drop, so it sets STICKMAN_HIP_HEIGHT. */
export const LEG_LENGTH = 18;
/** Arm length in px. */
export const ARM_LENGTH = 16;

/**
 * The rectangle size to draw each limb with.
 *
 * `leg` is TALL (a down-hanging limb) and `arm` is WIDE (a forward limb). These
 * are not interchangeable: drawing a leg as a wide rectangle is the M1 bug.
 */
export const LIMB_SIZE: Record<LimbKind, { width: number; height: number }> = {
  leg: { width: LIMB_THICKNESS, height: LEG_LENGTH },
  arm: { width: ARM_LENGTH, height: LIMB_THICKNESS },
};

/**
 * Where each limb pivots, as a Phaser origin.
 *
 * A leg pivots at its TOP (the hip); an arm at its INNER end (the shoulder).
 */
export const LIMB_ORIGIN: Record<LimbKind, { x: number; y: number }> = {
  leg: { x: 0.5, y: 0 },
  arm: { x: 0, y: 0.5 },
};

/** The direction each limb points at angle 0. */
export const LIMB_REST_AXIS: Record<LimbKind, RestAxis> = {
  leg: 'down',
  arm: 'forward',
};

/** The limb's length along its own axis, in px. */
export function limbLength(kind: LimbKind): number {
  return kind === 'leg' ? LEG_LENGTH : ARM_LENGTH;
}

/**
 * The unit direction a limb points at `angle` radians.
 *
 * A `down` limb rotates its (0, 1) rest vector; a `forward` limb rotates its
 * (1, 0) rest vector. Phaser's positive rotation is clockwise on screen, and
 * with +Y down that is a standard rotation matrix — so the same formula serves
 * both, applied to a different rest vector.
 */
export function limbDirection(kind: LimbKind, angle: number): Vec2 {
  const rest = LIMB_REST_AXIS[kind] === 'down' ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: rest.x * cos - rest.y * sin,
    y: rest.x * sin + rest.y * cos,
  };
}
