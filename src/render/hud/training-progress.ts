/**
 * Training-queue progress readout, kept free of Phaser so it is unit-testable.
 *
 * The queue is serial, so the head order is the only one making progress —
 * "when does my next unit appear" is fully answered by the head's `ticksLeft`
 * against its total training time. This module derives the label and the
 * 0..1 fraction; `hud/index.ts` only turns the answers into objects.
 *
 * Render reads sim state read-only (iron rule #4): nothing here mutates.
 */

import { TICKS_PER_SEC } from '../../data/constants';
import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { t } from '../../i18n';
import type { Side, World } from '../../sim/types';

export interface TrainingProgress {
  /** False when the queue is empty — the bar should not be drawn at all. */
  visible: boolean;
  /** e.g. `剑士 0:03` — the unit being trained and its remaining time. */
  label: string;
  /** 0..1 completion of the head order. 0 = just ordered, 1 = about to spawn. */
  fraction: number;
}

/**
 * Seconds as `m:ss`, matching the result overlay's duration format.
 *
 * Duplicated from `result/layout.ts` on purpose: that module is overlay copy,
 * this one is HUD copy. Sharing would couple two unrelated readouts.
 */
function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The head of the player's training queue, or `visible: false`.
 *
 * The fraction counts DOWN through the head's remaining ticks so the bar fills
 * toward "spawns now": `1 - ticksLeft / trainTime`. A just-ordered unit sits at
 * 0 and grows to 1 the tick it appears.
 */
export function trainingProgress(world: World, side: Side): TrainingProgress {
  const head = world.trainingQueue[side][0];
  if (!head) return { visible: false, label: '', fraction: 0 };

  const totalTicks = UNIT_TICKS[head.typeId].trainTime;
  const remainingSec = head.ticksLeft / TICKS_PER_SEC;
  const fraction = totalTicks > 0 ? 1 - head.ticksLeft / totalTicks : 1;

  return {
    visible: true,
    label: `${t(UNITS[head.typeId].nameKey)} ${formatSeconds(remainingSec)}`,
    fraction: Math.min(1, Math.max(0, fraction)),
  };
}

/** Rect for the progress bar, under the resource panel's top-left block. */
export interface TrainingBarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fixed HUD geometry for the training bar. */
export const TRAINING_BAR = { x: 22, y: 66, w: 180, h: 10 } as const;

/** The bar's rect, clamped so it can never run off a narrow viewport. */
export function trainingBarRect(width: number): TrainingBarRect {
  return {
    x: TRAINING_BAR.x,
    y: TRAINING_BAR.y,
    w: Math.max(0, Math.min(TRAINING_BAR.w, width - TRAINING_BAR.x - 12)),
    h: TRAINING_BAR.h,
  };
}
