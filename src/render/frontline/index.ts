/**
 * The frontline indicator: a top-centre strip with a unit-distribution
 * histogram and both base health bars.
 *
 * Shaped like `createHud` on purpose — `sync` / `layout` / `destroy` — so the
 * scene holds it the same way. All geometry comes from `layout.ts`, which is
 * testable; this file only turns those answers into Phaser objects (spec §7.3.1).
 *
 * It is the ONLY global view of the battle: the camera scrolls on a single axis,
 * so without it the player cannot see where the two armies sit relative to each
 * other.
 */

import Phaser from 'phaser';
import {
  baseBarRects,
  combatUnitCounts,
  frontlinePanelRect,
  histogramRect,
  normalizeCounts,
  FRONTLINE_METRICS,
} from './layout';
import type { World } from '../../sim/types';

const BG_COLOR = 0x141821;
const BG_ALPHA = 0.72;
const PLAYER_COLOR = 0x3f7fd0;
const ENEMY_COLOR = 0xd05a3f;
const BAR_BG_COLOR = 0x000000;
const BAR_BG_ALPHA = 0.5;
const DEPTH = 950;

export interface Frontline {
  sync(world: World): void;
  layout(width: number): void;
  destroy(): void;
}

export function createFrontline(scene: Phaser.Scene): Frontline {
  const gfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);

  let width = 0;

  const drawBaseBar = (
    x: number,
    y: number,
    w: number,
    h: number,
    hp: number,
    maxHp: number,
    color: number,
  ): void => {
    gfx.fillStyle(BAR_BG_COLOR, BAR_BG_ALPHA);
    gfx.fillRect(x, y, w, h);
    const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    gfx.fillStyle(color, 0.9);
    gfx.fillRect(x, y, w * frac, h);
  };

  const drawHistogram = (world: World): void => {
    const rect = histogramRect(width, FRONTLINE_METRICS);
    const bucketW = rect.w / FRONTLINE_METRICS.buckets;

    // Draw both sides mirrored about the mid-line: player bars rise from the
    // bottom of the strip, enemy bars hang from the top, so the two armies are
    // readable at a glance without a legend.
    const midY = rect.y + rect.h / 2;

    for (const s of ['player', 'enemy'] as const) {
      const counts = combatUnitCounts(world, s);
      const norm = normalizeCounts(counts, FRONTLINE_METRICS.buckets);
      const color = s === 'player' ? PLAYER_COLOR : ENEMY_COLOR;
      for (let i = 0; i < norm.length; i++) {
        const h = (rect.h / 2 - 1) * norm[i];
        if (h <= 0) continue;
        const x = rect.x + i * bucketW;
        gfx.fillStyle(color, 0.85);
        if (s === 'player') gfx.fillRect(x + 0.5, midY - h, bucketW - 1, h);
        else gfx.fillRect(x + 0.5, midY, bucketW - 1, h);
      }
    }
  };

  return {
    sync(world: World): void {
      gfx.clear();

      const panel = frontlinePanelRect(width, FRONTLINE_METRICS);
      gfx.fillStyle(BG_COLOR, BG_ALPHA);
      gfx.fillRect(panel.x, panel.y, panel.w, panel.h);

      drawHistogram(world);

      const bars = baseBarRects(width, FRONTLINE_METRICS);
      const pb = world.bases.player;
      const eb = world.bases.enemy;
      drawBaseBar(bars.player.x, bars.player.y, bars.player.w, bars.player.h, pb.hp, pb.maxHp, PLAYER_COLOR);
      drawBaseBar(bars.enemy.x, bars.enemy.y, bars.enemy.w, bars.enemy.h, eb.hp, eb.maxHp, ENEMY_COLOR);
    },

    layout(w: number): void {
      width = w;
    },

    destroy(): void {
      gfx.destroy();
    },
  };
}

/** Exposed so the scene does not hardcode the panel geometry for hit-testing. */
export { frontlinePanelRect, FRONTLINE_METRICS };
