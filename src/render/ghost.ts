import Phaser from 'phaser';
import { createStickman, STICKMAN_HIP_HEIGHT, type Stickman } from './stickman/skeleton';
import type { UnitTypeId } from '../data/units';

/** How long the death animation plays, in ms. */
const GHOST_LIFETIME_MS = 400;

/**
 * A death animation that lives entirely in the render layer.
 *
 * The sim removes a dead unit on the same tick it dies (spec §6.6), so the
 * renderer cannot animate the real unit. Instead syncStickmen notices the
 * disappearance and spawns one of these at the last known position, using the
 * palette it was already rendering with.
 *
 * Keeping this out of the sim is deliberate: a death animation is pure
 * presentation, and giving the sim a `dying` state would make the harness's
 * "how long did the fight last" measurement ambiguous.
 */
export function spawnGhost(
  scene: Phaser.Scene,
  x: number,
  groundY: number,
  typeId: UnitTypeId,
  facing: 1 | -1,
): void {
  const stickman: Stickman = createStickman(scene, typeId);
  stickman.setFacing(facing);
  stickman.container.setPosition(x, groundY - STICKMAN_HIP_HEIGHT);
  stickman.container.setDepth(-1);
  stickman.apply('dead', 0);

  scene.tweens.add({
    targets: stickman.container,
    alpha: 0,
    y: stickman.container.y + 6,
    duration: GHOST_LIFETIME_MS,
    ease: 'Quad.easeOut',
    onComplete: () => stickman.destroy(),
  });
}
