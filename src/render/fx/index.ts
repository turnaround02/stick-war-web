import Phaser from 'phaser';
import { hitSparks, deathShatter, type ParticleSpec } from './particles';

/**
 * The particle layer: spawns short-lived Phaser rectangles from the pure
 * rules in `particles.ts` and animates them with velocity + gravity. No sim
 * coupling — the scene calls `spawnHit` / `spawnDeath` with sim-derived data,
 * everything after that plays out on screen only.
 */

const DEPTH = 8; // above units (stickmen ~5-7), below HUD (900+)

interface LiveParticle {
  obj: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  remainingMs: number;
  totalMs: number;
  baseAlpha: number;
}

export interface ParticleLayer {
  spawnHit(victimType: Parameters<typeof hitSparks>[0], x: number, y: number, seed: number): void;
  spawnDeath(victimType: Parameters<typeof deathShatter>[0], x: number, groundY: number, seed: number): void;
  /** Advances all live particles; called every frame with the frame delta. */
  update(deltaMs: number): void;
  destroy(): void;
}

export function createParticleLayer(scene: Phaser.Scene): ParticleLayer {
  const live: LiveParticle[] = [];

  const spawn = (specs: ParticleSpec[], x: number, y: number): void => {
    for (const s of specs) {
      const obj = scene.add.rectangle(x, y, s.size * 2, s.size * 2, s.color).setDepth(DEPTH);
      live.push({
        obj,
        vx: s.vx,
        vy: s.vy,
        remainingMs: s.lifetimeMs,
        totalMs: s.lifetimeMs,
        baseAlpha: 1,
      });
    }
  };

  return {
    spawnHit(victimType, x, y, seed): void {
      spawn(hitSparks(victimType, seed), x, y);
    },

    spawnDeath(victimType, x, groundY, seed): void {
      spawn(deathShatter(victimType, seed), x, groundY - 20);
    },

    update(deltaMs): void {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]!;
        p.remainingMs -= deltaMs;
        if (p.remainingMs <= 0) {
          p.obj.destroy();
          live.splice(i, 1);
          continue;
        }
        // Integrate motion; gravity pulls shards down (sparks have a small
        // upward vy that gravity turns over — the same constant serves both).
        p.vy += 0.0016 * deltaMs;
        p.obj.x += p.vx * deltaMs;
        p.obj.y += p.vy * deltaMs;
        // Fade out over the last half of the lifetime.
        const t = p.remainingMs / p.totalMs;
        p.obj.setAlpha(t < 0.5 ? t * 2 : 1);
      }
    },

    destroy(): void {
      for (const p of live) p.obj.destroy();
      live.length = 0;
    },
  };
}
