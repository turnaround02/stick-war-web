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
  speedHeaderRight,
  speedLabel,
  trainButtonState,
  waveText,
  PAUSE_BUTTON,
  SPEED_BUTTON,
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

  // Endless wave readout, under the resource line. Hidden when empty so a
  // campaign level shows nothing (spec §13.8 Q17: the wave IS the score).
  const waveText_ = scene.add
    .text(12 + 10, 12 + 34, '', { fontFamily: FONT, fontSize: '14px', color: TEXT_DIM })
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

  /**
   * Builds a button at an EXPLICIT size.
   *
   * The size must be passed in rather than defaulted: the bottom bar's buttons
   * are 108x44 but the top-right speed/pause cluster is only 52x30 / 64x30, and
   * a Rectangle keeps whatever size it was constructed with. Defaulting to the
   * bar size while positioning from the smaller layout slot drew 108-wide rects
   * centred on 64-wide slots, so the pause button overlapped the "速度" header
   * and fused with the speed buttons.
   */
  const makeButton = (w: number, h: number, onClick: () => void): Button => {
    const rect = scene.add
      .rectangle(0, 0, w, h, BUTTON_ON)
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

  const barButton = (onClick: () => void) => makeButton(metrics.buttonW, metrics.buttonH, onClick);

  const trainButtons = TRAINABLE.map((typeId) => ({
    typeId,
    ...barButton(() => callbacks.onTrain(typeId)),
  }));

  const stanceButtons = STANCE_BUTTONS.map(({ stance, key }) => ({
    stance,
    key,
    ...barButton(() => callbacks.onStance(stance)),
  }));

  // ── Speed buttons (top-right) ─────────────────────────────────────
  const speedButtons = SPEED_STEPS.map((speed) => ({
    speed,
    ...makeButton(SPEED_BUTTON.w, SPEED_BUTTON.h, () => callbacks.onSpeedChange(speed)),
  }));

  // ── Pause button (left of the speed group) ────────────────────────
  const pauseButton = makeButton(PAUSE_BUTTON.w, PAUSE_BUTTON.h, () => callbacks.onTogglePause());
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

      // Size AND position both come from the layout rect. Setting the size here
      // rather than at construction is what makes "drawn rect != layout slot"
      // impossible: the Rectangle is resized to whatever the layout decided, so
      // the two cannot disagree even if a future edit changes a constant.
      trainRects.forEach((r, i) => {
        const b = trainButtons[i];
        b.rect.setSize(r.w, r.h);
        b.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        b.label.setPosition(r.x + r.w / 2, r.y + r.h / 2 - 7);
        b.reason.setPosition(r.x + r.w / 2, r.y + r.h / 2 + 13);
      });

      stanceRects.forEach((r, i) => {
        const b = stanceButtons[i];
        b.rect.setSize(r.w, r.h);
        b.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        b.label.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      });

      speedRects.forEach((r, i) => {
        const b = speedButtons[i];
        b.rect.setSize(r.w, r.h);
        b.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2);
        b.label.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      });

      const pr = layoutPauseButton(width, metrics);
      pauseButton.rect.setSize(pr.w, pr.h);
      pauseButton.rect.setPosition(pr.x + pr.w / 2, pr.y + pr.h / 2);
      pauseButton.label.setPosition(pr.x + pr.w / 2, pr.y + pr.h / 2);

      // The header sits just left of the pause button, from the same layout
      // data that positions the button — computing it here is what previously
      // let the text land inside the pause rectangle.
      speedHeader.setPosition(speedHeaderRight(width, metrics), pr.y + pr.h / 2);

      barBg.clear();
      barBg.fillStyle(BG_COLOR, BG_ALPHA);
      barBg.fillRect(0, height - metrics.barHeight, width, metrics.barHeight);
    },

    sync(world: World): void {
      resourceText_.setText(resourceText(world, side));
      resourceBg.clear();
      resourceBg.fillStyle(BG_COLOR, BG_ALPHA);
      resourceBg.fillRect(12, 12, resourceText_.width + 20, resourceText_.height + 16);

      const wave = waveText(world);
      waveText_.setText(wave).setVisible(wave !== '');

      for (const b of trainButtons) {
        const state = trainButtonState(world, side, b.typeId);
        b.rect.setFillStyle(state.enabled ? BUTTON_ON : BUTTON_OFF);
        b.label.setText(state.label).setColor(state.enabled ? TEXT_LIGHT : TEXT_DIM);
        b.reason.setText(state.reason);
      }

      // Stance labels are refreshed every sync, NOT cached at construction: a
      // cached label0 never followed a locale change (spec §7.5.1). The strings
      // are static, so this is a cheap setText with no visible cost.
      for (const b of stanceButtons) b.label.setText(t(b.key));
    },

    setSpeed(speed: GameSpeed): void {
      currentSpeed = speed;
      for (const b of speedButtons) {
        b.rect.setFillStyle(b.speed === currentSpeed ? BUTTON_ACTIVE : BUTTON_ON);
        // The label must be written here, not just coloured: these buttons had
        // no setText at all and rendered as empty rectangles.
        b.label.setText(speedLabel(b.speed)).setColor(TEXT_LIGHT);
      }
    },

    setPaused(paused: boolean): void {
      pauseButton.label.setText(pauseLabel(paused));
      pauseButton.rect.setFillStyle(paused ? BUTTON_ACTIVE : BUTTON_ON);
    },

    destroy(): void {
      resourceBg.destroy();
      resourceText_.destroy();
      waveText_.destroy();
      barBg.destroy();
      speedHeader.destroy();
      for (const b of [...trainButtons, ...stanceButtons, ...speedButtons, pauseButton]) {
        b.rect.destroy();
        b.label.destroy();
        b.reason.destroy();
      }
    },
  };

  // The stance buttons' labels are set by the first sync (see sync()), so they
  // follow the active locale rather than a value frozen at construction.

  // A first layout so nothing sits at (0,0) before the scene's first resize.
  hud.layout(scene.scale.width, scene.scale.height);

  return hud;
}

/** Kept for callers that want the raw unit table entry (labels come from layout). */
export { UNITS };
