/**
 * The Phaser HUD: resource bar, command bar, speed control.
 *
 * All three are plain GameObjects with `setScrollFactor(0)` and a high depth,
 * so they stay pinned to the screen while the world scrolls under them. No DOM
 * overlay: keeping the HUD in the same coordinate space as the game means
 * resizing, scaling, and screenshots all behave predictably.
 *
 * The arithmetic lives in `layout.ts` so it can be unit-tested; this file only
 * turns those results into objects.
 */

import Phaser from 'phaser';
import { t } from '../../i18n';
import { UNITS } from '../../data/units';
import { SPEED_STEPS, type GameSpeed } from '../timestep';
import {
  layoutPauseButton,
  layoutSpeedButtons,
  layoutStanceButtons,
  layoutTrainButtons,
  pauseLabel,
  resourceText,
  trainButtonState,
  STANCE_BUTTONS,
  TRAINABLE,
  type HudMetrics,
} from './layout';
import type { Side, Stance, UnitTypeId, World } from '../../sim/types';

const FONT = 'monospace';
const TEXT_LIGHT = '#e8edf4';
const TEXT_DIM = '#6b7280';
const BG_COLOR = 0x141821;
const BG_ALPHA = 0.78;
const BUTTON_ON = 0x2f3a4a;
const BUTTON_OFF = 0x1c2028;
const BUTTON_ACTIVE = 0x3f6fd0;
const REASON_COLOR = '#e08a8a';
const BAR_DEPTH = 900;
const TEXT_DEPTH = 902;

export const HUD_METRICS: HudMetrics = { buttonW: 108, buttonH: 44, gap: 8, barHeight: 64 };

export interface Hud {
  sync(world: World): void;
  layout(width: number, height: number): void;
  /** Highlights the active speed button. */
  setSpeed(speed: GameSpeed): void;
  /** Updates the pause button's label and highlight. */
  setPaused(paused: boolean): void;
  destroy(): void;
}

export interface HudCallbacks {
  onTrain(typeId: UnitTypeId): void;
  onStance(stance: Stance): void;
  onSpeedChange(speed: GameSpeed): void;
  onTogglePause(): void;
}

/**
 * Builds the whole HUD and returns a handle that syncs it against the world.
 *
 * `sync` and `layout` are separate on purpose: `layout` runs on resize (rare,
 * and it repositions objects), while `sync` runs every frame (cheap, and it
 * only rewrites text and colours).
 */
export function createHud(
  scene: Phaser.Scene,
  side: Side,
  callbacks: HudCallbacks,
): Hud {
  const metrics = HUD_METRICS;

  // ── Resource bar (top-left) ───────────────────────────────────────
  const resourceBg = scene.add.graphics().setScrollFactor(0).setDepth(BAR_DEPTH);
  const resourceText_ = scene.add
    .text(12 + 10, 12 + 8, '', { fontFamily: FONT, fontSize: '16px', color: TEXT_LIGHT })
    .setScrollFactor(0)
    .setDepth(TEXT_DEPTH);

  // ── Bottom bar background ─────────────────────────────────────────
  const barBg = scene.add.graphics().setScrollFactor(0).setDepth(BAR_DEPTH);

  // ── Train buttons ─────────────────────────────────────────────────
  interface Button {
    rect: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    reason: Phaser.GameObjects.Text;
  }

  const makeButton = (onClick: () => void): Button => {
    const rect = scene.add
      .rectangle(0, 0, metrics.buttonW, metrics.buttonH, BUTTON_ON)
      .setScrollFactor(0)
      .setDepth(BAR_DEPTH + 1)
      .setInteractive({ useHandCursor: true });
    rect.on('pointerdown', onClick);

    const label = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: TEXT_LIGHT })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TEXT_DEPTH);
    const reason = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '10px', color: REASON_COLOR })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TEXT_DEPTH);

    return { rect, label, reason };
  };

  const trainButtons = TRAINABLE.map((typeId) => ({
    typeId,
    ...makeButton(() => callbacks.onTrain(typeId)),
  }));

  const stanceButtons = STANCE_BUTTONS.map(({ stance, key }) => ({
    stance,
    label0: t(key),
    ...makeButton(() => callbacks.onStance(stance)),
  }));

  // ── Speed buttons (top-right) ─────────────────────────────────────
  const speedButtons = SPEED_STEPS.map((speed) => ({
    speed,
    ...makeButton(() => callbacks.onSpeedChange(speed)),
  }));

  // ── Pause button (left of the speed group) ────────────────────────
  const pauseButton = makeButton(() => callbacks.onTogglePause());
  pauseButton.reason.setVisible(false);
  const speedHeader = scene.add
    .text(0, 0, t('ui.speed'), { fontFamily: FONT, fontSize: '13px', color: TEXT_LIGHT })
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(TEXT_DEPTH);

  let currentSpeed: GameSpeed = 1;

  const hud: Hud = {
    layout(width: number, height: number): void {
      const trainRects = layoutTrainButtons(width, height, metrics);
      const stanceRects = layoutStanceButtons(width, height, metrics);
      const speedRects = layoutSpeedButtons(width, metrics);

      trainRects.forEach((r, i) => {
        const b = trainButtons[i];
        b.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        b.label.setPosition(r.x + r.w / 2, r.y + r.h / 2 - 7);
        b.reason.setPosition(r.x + r.w / 2, r.y + r.h / 2 + 13);
      });

      stanceRects.forEach((r, i) => {
        const b = stanceButtons[i];
        b.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        b.label.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      });

      speedRects.forEach((r, i) => {
        const b = speedButtons[i];
        b.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        b.label.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      });

      const pr = layoutPauseButton(width, metrics);
      pauseButton.rect.setPosition(pr.x + pr.w / 2, pr.y + pr.h / 2);
      pauseButton.label.setPosition(pr.x + pr.w / 2, pr.y + pr.h / 2);

      // The header sits just left of the pause button.
      speedHeader.setPosition(pr.x - 10, pr.y + pr.h / 2);

      barBg.clear();
      barBg.fillStyle(BG_COLOR, BG_ALPHA);
      barBg.fillRect(0, height - metrics.barHeight, width, metrics.barHeight);
    },

    sync(world: World): void {
      resourceText_.setText(resourceText(world, side));
      resourceBg.clear();
      resourceBg.fillStyle(BG_COLOR, BG_ALPHA);
      resourceBg.fillRect(12, 12, resourceText_.width + 20, resourceText_.height + 16);

      for (const b of trainButtons) {
        const state = trainButtonState(world, side, b.typeId);
        b.rect.setFillStyle(state.enabled ? BUTTON_ON : BUTTON_OFF);
        b.label.setText(state.label).setColor(state.enabled ? TEXT_LIGHT : TEXT_DIM);
        b.reason.setText(state.reason);
      }
    },

    setSpeed(speed: GameSpeed): void {
      currentSpeed = speed;
      for (const b of speedButtons) {
        b.rect.setFillStyle(b.speed === currentSpeed ? BUTTON_ACTIVE : BUTTON_ON);
      }
    },

    setPaused(paused: boolean): void {
      pauseButton.label.setText(pauseLabel(paused));
      pauseButton.rect.setFillStyle(paused ? BUTTON_ACTIVE : BUTTON_ON);
    },

    destroy(): void {
      resourceBg.destroy();
      resourceText_.destroy();
      barBg.destroy();
      speedHeader.destroy();
      for (const b of [...trainButtons, ...stanceButtons, ...speedButtons, pauseButton]) {
        b.rect.destroy();
        b.label.destroy();
        b.reason.destroy();
      }
    },
  };

  // The stance buttons' labels never change; set them once.
  for (const b of stanceButtons) b.label.setText(b.label0);

  // A first layout so nothing sits at (0,0) before the scene's first resize.
  hud.layout(scene.scale.width, scene.scale.height);

  return hud;
}

/** Kept for callers that want the raw unit table entry (labels come from layout). */
export { UNITS };
