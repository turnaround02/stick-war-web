import Phaser from 'phaser';
import type { Projectile } from '../sim/types';

const ARROW_COLOR = 0xd8dde3;
const ARROW_LENGTH = 10;

/** Vertical offset above the ground line at which arrows fly. */
export const ARROW_HEIGHT_ABOVE_GROUND = 40;

export interface ProjectileLayer {
  /** Redraws every arrow. Called once per render frame with the current alpha. */
  sync(projectiles: Projectile[], alpha: number): void;
  /** Re-anchors the layer after a viewport resize. */
  setGroundY(groundY: number): void;
}

/**
 * Draws arrows as short line segments.
 *
 * Without a visible arrow a player cannot understand why their archer appears
 * to be shooting while nothing takes damage — the shot is still in flight. The
 * projectile's position is interpolated exactly like a unit's, so the arrow
 * glides rather than stepping.
 */
export function createProjectileLayer(scene: Phaser.Scene): ProjectileLayer {
  const graphics = scene.add.graphics();
  graphics.setDepth(5);

  return {
    setGroundY(groundY: number): void {
      graphics.setY(groundY - ARROW_HEIGHT_ABOVE_GROUND);
    },

    sync(projectiles: Projectile[], alpha: number): void {
      graphics.clear();
      graphics.lineStyle(2, ARROW_COLOR, 1);

      for (const p of projectiles) {
        const x = p.prevX + (p.x - p.prevX) * alpha;
        const dir = p.side === 'player' ? 1 : -1;
        graphics.lineBetween(x - dir * ARROW_LENGTH, 0, x + dir * ARROW_LENGTH, 0);
      }
    },
  };
}
