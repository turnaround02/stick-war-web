import type { UnitTypeId } from '../../data/units';

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

/**
 * Per-type visual scale.
 *
 * The giant is drawn at 1.5× the standard rig so that at 0.6× camera zoom
 * (the global-view default) it still reads as "big and strong" at a glance.
 * All other types keep 1.0.
 *
 * This is a RENDER-ONLY channel: it does not touch `bodyRadius` or any sim
 * field. The giant's sim collision is already `bodyRadius: 22` (≈44px lane);
 * the visual 1.5× makes the drawn head ≈21px wide at 1.0× camera, which at
 * 0.6× screen is ≈13px — visible but not absurd.
 */
export const VISUAL_SCALE: Record<UnitTypeId, number> = {
  miner: 1.0,
  swordsman: 1.0,
  archer: 1.0,
  spearman: 1.0,
  giant: 1.5,
  mage: 1.0,
};

/**
 * Weapon geometry per type. The default is the standard sword (16×3).
 * The giant gets a hammer: longer shaft + a chunky head block.
 */
export interface WeaponSpec {
  /** Shaft length in px (the stick part). */
  shaftLength: number;
  /** Shaft thickness in px. */
  shaftThickness: number;
  /** Head block size. `0` means no head (standard sword). */
  headWidth: number;
  headHeight: number;
}

/** Shared default weapon: a plain sword. */
export const DEFAULT_WEAPON: WeaponSpec = {
  shaftLength: 16,
  shaftThickness: 3,
  headWidth: 0,
  headHeight: 0,
};

export const WEAPON: Record<UnitTypeId, WeaponSpec> = {
  miner: DEFAULT_WEAPON,
  swordsman: DEFAULT_WEAPON,
  archer: DEFAULT_WEAPON,
  spearman: DEFAULT_WEAPON,
  giant: {
    shaftLength: 14,
    shaftThickness: 4,
    headWidth: 10,
    headHeight: 14,
  },
  mage: DEFAULT_WEAPON,
};

/**
 * The hip-to-foot drop for a unit at its visual scale.
 *
 * `LEG_LENGTH * scale` keeps the feet on the ground line for every size.
 * This is what `STICKMAN_HIP_HEIGHT` must be replaced with at the call site
 * (it was a global constant assuming scale=1).
 */
export function hipHeightFor(scale: number): number {
  return LEG_LENGTH * scale;
}
