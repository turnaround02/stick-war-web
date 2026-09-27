import Phaser from 'phaser';
import type { UnitTypeId } from '../../data/units';
import type { UnitState } from '../../sim/types';
import { PALETTES } from './palette';
import { poseFor } from './poses';
import { ARM_LENGTH, LEG_LENGTH, LIMB_ORIGIN, LIMB_SIZE } from './rig';

const LIMB_THICKNESS = 4;
const TORSO_LENGTH = 22;
const HEAD_RADIUS = 6;
const WEAPON_LENGTH = 16;

/**
 * Distance from the container origin (the hip) down to the feet.
 * Position a stickman at `groundY - STICKMAN_HIP_HEIGHT` to stand it on the ground.
 *
 * This is only the right number because a leg really does hang straight down
 * from the hip — see `rig.ts`. When the leg was drawn as a horizontal rectangle
 * it was 18px long but reached 0px downward, so the feet floated 18px above the
 * ground line, pointing forwards.
 */
export const STICKMAN_HIP_HEIGHT = LEG_LENGTH;

export interface Stickman {
  container: Phaser.GameObjects.Container;
  /** Applies a pose. `phase` is 0..1 through the current state. */
  apply(state: UnitState, phase: number): void;
  /** +1 faces right, -1 faces left. A horizontal flip of the whole container. */
  setFacing(dir: 1 | -1): void;
  destroy(): void;
}

/**
 * Builds a stickman from persistent Shape objects. Limbs are never recreated —
 * animation only mutates `rotation`, so there is no per-frame allocation
 * (spec §7.1).
 *
 * Structure (all coordinates relative to the hip at 0,0, +Y is down):
 *   hip ─┬─ legBack, legFront          (hang DOWN from the hip; pivot at the top)
 *        ├─ torso  (origin 0.5,1)      (extends upward)
 *        ├─ head   (above the shoulders)
 *        └─ armBack, armFront (containers at the shoulder, each holding a limb
 *           rectangle, with the front arm also holding the weapon)
 *
 * The arms are Containers rather than bare Rectangles because Phaser Shapes
 * cannot have children — the weapon must inherit the arm's rotation, which
 * requires a nested container.
 *
 * Limb size and pivot come from `rig.ts`, which is the single source of truth
 * for the two orientation conventions (legs hang down, arms point forward).
 */
export function createStickman(scene: Phaser.Scene, typeId: UnitTypeId): Stickman {
  const palette = PALETTES[typeId];
  const leg = LIMB_SIZE.leg;
  const arm = LIMB_SIZE.arm;

  // Legs: a TALL rectangle pivoting at its TOP edge, so angle 0 hangs straight
  // down from the hip and a positive angle swings the foot forward.
  const legBack = scene.add
    .rectangle(0, 0, leg.width, leg.height, palette.limb)
    .setOrigin(LIMB_ORIGIN.leg.x, LIMB_ORIGIN.leg.y);
  const legFront = scene.add
    .rectangle(0, 0, leg.width, leg.height, palette.limb)
    .setOrigin(LIMB_ORIGIN.leg.x, LIMB_ORIGIN.leg.y);

  const torso = scene.add
    .rectangle(0, 0, LIMB_THICKNESS, TORSO_LENGTH, palette.limb)
    .setOrigin(0.5, 1);

  const head = scene.add.circle(0, -TORSO_LENGTH - HEAD_RADIUS + 1, HEAD_RADIUS, palette.head);

  const shoulderY = -TORSO_LENGTH + 3;

  // Arms: a WIDE rectangle pivoting at its inner end, so angle 0 points
  // forward from the shoulder and a positive angle swings the hand down.
  const armBackLimb = scene.add
    .rectangle(0, 0, arm.width, arm.height, palette.limb)
    .setOrigin(LIMB_ORIGIN.arm.x, LIMB_ORIGIN.arm.y);
  const armBack = scene.add.container(0, shoulderY, [armBackLimb]);

  const armFrontLimb = scene.add
    .rectangle(0, 0, arm.width, arm.height, palette.limb)
    .setOrigin(LIMB_ORIGIN.arm.x, LIMB_ORIGIN.arm.y);
  const weapon = scene.add
    .rectangle(ARM_LENGTH - 2, 0, WEAPON_LENGTH, 3, palette.weapon)
    .setOrigin(0, 0.5);
  const armFront = scene.add.container(0, shoulderY, [armFrontLimb, weapon]);

  // Back-to-front draw order.
  const container = scene.add.container(0, 0, [
    armBack,
    legBack,
    legFront,
    torso,
    head,
    armFront,
  ]);

  return {
    container,
    apply(state: UnitState, phase: number): void {
      const pose = poseFor(state, phase);
      torso.setRotation(pose.torso);
      armFront.setRotation(pose.armFront);
      armBack.setRotation(pose.armBack);
      legFront.setRotation(pose.legFront);
      legBack.setRotation(pose.legBack);
      weapon.setRotation(pose.weapon);
    },
    setFacing(dir: 1 | -1): void {
      // Facing is derived from side, not stored in the sim: on a single axis
      // "player is left, enemy is right" is a constant fact.
      container.setScale(dir, 1);
    },
    destroy(): void {
      // No `fromScene` flag: this is a per-unit removal during play, not a
      // scene shutdown. Passing true would tell Phaser to skip per-child
      // cleanup it still needs to do, and to treat the scene as going away.
      container.destroy();
    },
  };
}
