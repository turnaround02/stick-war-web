import Phaser from 'phaser';
import type { UnitTypeId } from '../../data/units';
import type { UnitState } from '../../sim/types';
import { PALETTES } from './palette';
import { poseFor } from './poses';

const LIMB_THICKNESS = 4;
const TORSO_LENGTH = 22;
const HEAD_RADIUS = 6;
const ARM_LENGTH = 16;
const LEG_LENGTH = 18;
const WEAPON_LENGTH = 16;

/**
 * Distance from the container origin (the hip) down to the feet.
 * Position a stickman at `groundY - STICKMAN_HIP_HEIGHT` to stand it on the ground.
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
 *   hip ─┬─ legBack, legFront          (rotate at the hip)
 *        ├─ torso  (origin 0.5,1)      (extends upward)
 *        ├─ head   (above the shoulders)
 *        └─ armBack, armFront (containers at the shoulder, each holding a limb
 *           rectangle, with the front arm also holding the weapon)
 *
 * The arms are Containers rather than bare Rectangles because Phaser Shapes
 * cannot have children — the weapon must inherit the arm's rotation, which
 * requires a nested container.
 */
export function createStickman(scene: Phaser.Scene, typeId: UnitTypeId): Stickman {
  const palette = PALETTES[typeId];

  const legBack = scene.add
    .rectangle(0, 0, LEG_LENGTH, LIMB_THICKNESS, palette.limb)
    .setOrigin(0, 0.5);
  const legFront = scene.add
    .rectangle(0, 0, LEG_LENGTH, LIMB_THICKNESS, palette.limb)
    .setOrigin(0, 0.5);

  const torso = scene.add
    .rectangle(0, 0, LIMB_THICKNESS, TORSO_LENGTH, palette.limb)
    .setOrigin(0.5, 1);

  const head = scene.add.circle(0, -TORSO_LENGTH - HEAD_RADIUS + 1, HEAD_RADIUS, palette.head);

  const shoulderY = -TORSO_LENGTH + 3;

  const armBackLimb = scene.add
    .rectangle(0, 0, ARM_LENGTH, LIMB_THICKNESS, palette.limb)
    .setOrigin(0, 0.5);
  const armBack = scene.add.container(0, shoulderY, [armBackLimb]);

  const armFrontLimb = scene.add
    .rectangle(0, 0, ARM_LENGTH, LIMB_THICKNESS, palette.limb)
    .setOrigin(0, 0.5);
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
