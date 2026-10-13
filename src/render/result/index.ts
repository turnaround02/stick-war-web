/**
 * The result overlay: a dimmed panel with the verdict and two actions.
 *
 * Shaped like `createHud` on purpose — `sync` / `layout` / `destroy` — so the
 * scene holds it the same way and a reader who knows the HUD already knows this.
 * All geometry and copy come from `layout.ts`, which is testable; this file only
 * turns those answers into Phaser objects.
 */

import Phaser from 'phaser';
import { t } from '../../i18n';
import { shouldShowResult } from './layout';
import { resultButtonRects, resultPanelRect, resultSubtitle, resultTitle } from './layout';
import type { World } from '../../sim/types';

const FONT = 'monospace';
const TEXT_LIGHT = '#e8edf4';
const TEXT_DIM = '#9aa4b2';
const PANEL_COLOR = 0x141821;
const PANEL_ALPHA = 0.96;
const BUTTON_COLOR = 0x2f3a4a;
const OVERLAY_COLOR = 0x000000;
const OVERLAY_ALPHA = 0.6;
/** Above the HUD (900/902) and the tick label (1000). */
const OVERLAY_DEPTH = 2000;

export interface ResultOverlayCallbacks {
  onReplay(): void;
  onNextLevel(): void;
}

export interface ResultOverlay {
  /** Shows/hides and rewrites the copy. `nextLabel` is chosen by the scene. */
  sync(world: World, ticks: number, nextLabel: string, endless?: { wave: number; bestWave: number }): void;
  layout(width: number, height: number): void;
  destroy(): void;
}

export function createResultOverlay(
  scene: Phaser.Scene,
  callbacks: ResultOverlayCallbacks,
): ResultOverlay {
  const dim = scene.add
    .rectangle(0, 0, 0, 0, OVERLAY_COLOR, OVERLAY_ALPHA)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(OVERLAY_DEPTH)
    .setVisible(false);

  const panel = scene.add
    .rectangle(0, 0, 0, 0, PANEL_COLOR, PANEL_ALPHA)
    .setScrollFactor(0)
    .setDepth(OVERLAY_DEPTH + 1)
    .setVisible(false);

  const title = scene.add
    .text(0, 0, '', { fontFamily: FONT, fontSize: '34px', color: TEXT_LIGHT })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(OVERLAY_DEPTH + 2)
    .setVisible(false);

  const subtitle = scene.add
    .text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: TEXT_DIM })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(OVERLAY_DEPTH + 2)
    .setVisible(false);

  /**
   * A button at an EXPLICIT size, and `layout()` re-sizes it from the same rect
   * it positions from. The HUD shipped a bug where a button was drawn at the
   * bar size while positioned from a smaller slot, so it overlapped its
   * neighbour; sizing from one source removes that class of mistake.
   */
  const makeButton = (onClick: () => void) => {
    const rect = scene.add
      .rectangle(0, 0, 10, 10, BUTTON_COLOR)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 2)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    rect.on('pointerdown', onClick);
    const label = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '17px', color: TEXT_LIGHT })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 3)
      .setVisible(false);
    return { rect, label };
  };

  const replay = makeButton(callbacks.onReplay);
  const next = makeButton(callbacks.onNextLevel);
  replay.label.setText(t('result.replay'));

  const all = [dim, panel, title, subtitle, replay.rect, replay.label, next.rect, next.label];

  return {
    sync(world: World, ticks: number, nextLabel: string, endless?: { wave: number; bestWave: number }): void {
      const visible = shouldShowResult(world);
      for (const o of all) o.setVisible(visible);
      if (!visible) return;

      title.setText(resultTitle(world.outcome));
      subtitle.setText(resultSubtitle(world.levelId, ticks, endless));
      next.label.setText(nextLabel);
    },

    layout(width: number, height: number): void {
      dim.setSize(width, height);

      const p = resultPanelRect(width, height);
      panel.setPosition(p.x + p.w / 2, p.y + p.h / 2);
      panel.setSize(p.w, p.h);

      title.setPosition(p.x + p.w / 2, p.y + 54);
      subtitle.setPosition(p.x + p.w / 2, p.y + 96);

      const b = resultButtonRects(width, height);
      for (const [btn, r] of [
        [replay, b.replay],
        [next, b.next],
      ] as const) {
        btn.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        btn.rect.setSize(r.w, r.h);
        btn.label.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      }
    },

    destroy(): void {
      for (const o of all) o.destroy();
    },
  };
}
