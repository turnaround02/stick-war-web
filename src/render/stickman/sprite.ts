/**
 * Phaser sprite builder for the static pose.
 *
 * Replaces the skeletal stickman ONLY for `idle` and `stunned` states when
 * the user's renderer preference is `sprite`. Walk / gather / attack / death
 * continue to use the existing skeletal animation (Q2: hybrid renderer).
 *
 * The sprite image is loaded from `public/sprites/<typeId>.png` at BootScene
 * preload time. If the texture is missing (e.g. `make-sprites` was not run),
 * the fallback is the skeleton — the game must never show a blank unit.
 *
 * Iron rule #4: this module READS sim state (via the caller) but never writes
 * back. Iron rule #7: the decision "use sprite vs skeleton" is in switch.ts
 * (pure, tested); this module only builds the Phaser object.
 */

import Phaser from 'phaser';
import type { UnitTypeId } from '../../data/units';

/**
 * The texture key for a given unit type.
 * The BootScene loads each sprite with this key.
 */
export function spriteKey(typeId: UnitTypeId): string {
  return `sprite-${typeId}`;
}

export interface SpriteStickman {
  /** The Phaser Sprite to add to the scene. */
  obj: Phaser.GameObjects.Sprite;
  /** Set the facing direction (+1 right, -1 left) by flipping. */
  setFacing(dir: 1 | -1): void;
  /** Position on the ground. `groundY` is the world-space ground line. */
  setPosition(x: number, groundY: number): void;
  destroy(): void;
}

/**
 * Creates a sprite-based stickman for the given unit type.
 *
 * The sprite is anchored at its feet: Phaser's `setOrigin(0.5, 1)` places the
 * origin at the bottom-centre of the image, so `setPosition(x, groundY)`
 * puts the feet exactly on the ground line. No hip-height offset needed.
 *
 * @param scene    The owning Phaser scene.
 * @param typeId   The unit type.
 * @param groundY  The world-space Y of the ground line.
 * @returns A SpriteStickman, or `null` if the texture is not loaded.
 */
export function createSpriteStickman(
  scene: Phaser.Scene,
  typeId: UnitTypeId,
  groundY: number,
): SpriteStickman | null {
  const key = spriteKey(typeId);
  if (!scene.textures.get(key)) {
    return null; // texture not loaded — caller falls back to skeleton
  }

  // Depth matches the stickman containers (Phaser's default 0): both are
  // created during update(), so both land above the ground line and below
  // the selection marker (depth 6) and particles (depth 8).
  const sprite = scene.add.sprite(0, groundY, key).setOrigin(0.5, 1); // anchor at feet

  return {
    obj: sprite,
    setFacing(dir: 1 | -1) {
      // The art faces right by default; flip horizontally for left.
      sprite.setFlipX(dir === -1);
    },
    setPosition(x: number, gy: number) {
      sprite.setPosition(x, gy);
    },
    destroy() {
      sprite.destroy();
    },
  };
}
