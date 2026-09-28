import { describe, it, expect } from 'vitest';
import {
  layoutPauseButton,
  pauseLabel,
  layoutTrainButtons,
  layoutStanceButtons,
  layoutSpeedButtons,
  resourceText,
  speedHeaderRight,
  trainButtonState,
  PAUSE_BUTTON,
  SPEED_BUTTON,
  type HudMetrics,
} from './layout';
import { UNITS } from '../../data/units';
import { SPEED_STEPS } from '../timestep';
import { createWorld } from '../../sim/createWorld';
import { DEFAULT_MATCH } from '../../data/levels';

const metrics: HudMetrics = {
  buttonW: 108,
  buttonH: 44,
  gap: 8,
  barHeight: 64,
};

function world() {
  return createWorld({ ...DEFAULT_MATCH, startGold: { player: 200, enemy: 200 } }, 1);
}

describe('resourceText', () => {
  it('shows gold and population against the cap', () => {
    const w = world();
    w.gold.player = 245;
    w.popUsed.player = 7;
    w.popCap.player = 60;
    expect(resourceText(w, 'player')).toBe('金币 245    人口 7/60');
  });

  it('floors fractional gold', () => {
    // Gold is an integer resource; a fractional readout looks like a bug.
    const w = world();
    w.gold.player = 199.7;
    expect(resourceText(w, 'player')).toContain('199');
    expect(resourceText(w, 'player')).not.toContain('199.7');
  });

  it('reads the requested side', () => {
    const w = world();
    w.gold.player = 100;
    w.gold.enemy = 900;
    expect(resourceText(w, 'player')).toContain('100');
    expect(resourceText(w, 'enemy')).toContain('900');
  });
});

describe('trainButtonState', () => {
  it('enables a button the player can afford', () => {
    const w = world();
    w.gold.player = 200;
    const s = trainButtonState(w, 'player', 'swordsman');
    expect(s.enabled).toBe(true);
    expect(s.reason).toBe('');
  });

  it('disables it and explains a gold shortage', () => {
    const w = world();
    w.gold.player = 10;
    const s = trainButtonState(w, 'player', 'swordsman');
    expect(s.enabled).toBe(false);
    expect(s.reason).toBe('金币不足');
  });

  it('disables it and explains a population shortage', () => {
    const w = world();
    w.gold.player = 500;
    w.popCap.player = 1;
    w.popUsed.player = 1;
    const s = trainButtonState(w, 'player', 'swordsman');
    expect(s.enabled).toBe(false);
    expect(s.reason).toBe('人口已满');
  });

  it('labels the button with the unit name and price', () => {
    const w = world();
    const s = trainButtonState(w, 'player', 'archer');
    expect(s.label).toBe(`弓箭手 ${UNITS.archer.goldCost}`);
  });

  it('reflects the state after a purchase, not a stale read', () => {
    const w = world();
    w.gold.player = UNITS.swordsman.goldCost;
    expect(trainButtonState(w, 'player', 'swordsman').enabled).toBe(true);
    w.gold.player = 0;
    expect(trainButtonState(w, 'player', 'swordsman').enabled).toBe(false);
  });
});

describe('layoutTrainButtons', () => {
  it('lays out one button per trainable type', () => {
    const rects = layoutTrainButtons(1280, 720, metrics);
    expect(rects).toHaveLength(4);
  });

  it('keeps every button inside the viewport', () => {
    const rects = layoutTrainButtons(1280, 720, metrics);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1280);
    }
  });

  it('never overlaps two buttons', () => {
    const rects = layoutTrainButtons(1280, 720, metrics);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].w);
    }
  });

  it('sits in the bottom bar', () => {
    const rects = layoutTrainButtons(1280, 720, metrics);
    for (const r of rects) {
      expect(r.y + r.h).toBeLessThanOrEqual(720);
      expect(r.y).toBeGreaterThanOrEqual(720 - metrics.barHeight);
    }
  });

  it('re-centres when the viewport changes', () => {
    const wide = layoutTrainButtons(1920, 720, metrics);
    const narrow = layoutTrainButtons(1280, 720, metrics);
    // Same relative position: the left margin scales with the width.
    expect(wide[0].x).toBeGreaterThan(narrow[0].x);
  });
});

describe('layoutStanceButtons', () => {
  it('lays out three buttons', () => {
    expect(layoutStanceButtons(1280, 720, metrics)).toHaveLength(3);
  });

  it('places them after the train buttons with no overlap', () => {
    const train = layoutTrainButtons(1280, 720, metrics);
    const stance = layoutStanceButtons(1280, 720, metrics);
    expect(stance[0].x).toBeGreaterThanOrEqual(train[train.length - 1].x + train[0].w);
  });

  it('keeps them inside the viewport', () => {
    const stance = layoutStanceButtons(1280, 720, metrics);
    for (const r of stance) {
      expect(r.x + r.w).toBeLessThanOrEqual(1280);
    }
  });
});

describe('layoutSpeedButtons', () => {
  it('lays out one button per speed step', () => {
    expect(layoutSpeedButtons(1280, metrics)).toHaveLength(SPEED_STEPS.length);
  });

  it('anchors to the right edge', () => {
    const rects = layoutSpeedButtons(1280, metrics);
    const last = rects[rects.length - 1];
    // A fixed right margin, so widening the window moves the group, not the gap.
    expect(1280 - (last.x + last.w)).toBeLessThan(40);
  });

  it('keeps them inside the viewport at a narrow width', () => {
    const rects = layoutSpeedButtons(640, metrics);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(640);
    }
  });

  it('never overlaps', () => {
    const rects = layoutSpeedButtons(1280, metrics);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].w);
    }
  });
});

describe('pause button', () => {
  it('is laid out to the left of the speed buttons', () => {
    const pause = layoutPauseButton(1280, metrics);
    const speed = layoutSpeedButtons(1280, metrics);
    expect(pause.x + pause.w).toBeLessThanOrEqual(speed[0].x);
  });

  it('never overlaps the speed group', () => {
    for (const width of [640, 1280, 1920]) {
      const pause = layoutPauseButton(width, metrics);
      const speed = layoutSpeedButtons(width, metrics);
      expect(pause.x + pause.w, `width ${width}`).toBeLessThanOrEqual(speed[0].x);
    }
  });

  it('sits inside the viewport at a narrow width', () => {
    const pause = layoutPauseButton(640, metrics);
    expect(pause.x).toBeGreaterThanOrEqual(0);
    expect(pause.x + pause.w).toBeLessThanOrEqual(640);
  });

  it('is vertically aligned with the speed buttons', () => {
    const pause = layoutPauseButton(1280, metrics);
    const speed = layoutSpeedButtons(1280, metrics);
    expect(pause.y).toBe(speed[0].y);
    expect(pause.h).toBe(speed[0].h);
  });

  /**
   * These two assert the CONSTRAINT the layout exists to satisfy, not a
   * restatement of how it computes. The earlier versions compared
   * `pause.x + pause.w <= speed[0].x`, which `layoutPauseButton` guarantees by
   * construction — it literally subtracts the width and gap — so they could not
   * fail for any positive width. They passed while the rendered button was
   * 108px wide against a 64px slot and visibly overlapped the header.
   */
  it('leaves room for the "速度" header between itself and the viewport edge', () => {
    for (const width of [640, 1280, 1920]) {
      const pause = layoutPauseButton(width, metrics);
      const headerRight = speedHeaderRight(width, metrics);
      // The header is right-aligned at headerRight, so its text must fit in the
      // space to the LEFT of the pause button.
      expect(headerRight, `width ${width}`).toBeLessThanOrEqual(pause.x);
      expect(headerRight, `width ${width}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves a gap between the pause button and the first speed button', () => {
    // A zero gap would fuse the two into one strip. Assert the actual spacing
    // rather than "does not overlap".
    for (const width of [640, 1280, 1920]) {
      const pause = layoutPauseButton(width, metrics);
      const speed = layoutSpeedButtons(width, metrics);
      expect(speed[0].x - (pause.x + pause.w), `width ${width}`).toBeGreaterThan(0);
    }
  });

  it('uses the dimensions the renderer is told to draw', () => {
    // The layout and the drawn Rectangle are separate sources of truth; this
    // pins the exported constants to the rect the layout returns. When they
    // disagreed, the button was drawn 108x44 in a 64x30 slot.
    const pause = layoutPauseButton(1280, metrics);
    expect(pause.w).toBe(PAUSE_BUTTON.w);
    expect(pause.h).toBe(PAUSE_BUTTON.h);
    const speed = layoutSpeedButtons(1280, metrics);
    expect(speed[0].w).toBe(SPEED_BUTTON.w);
    expect(speed[0].h).toBe(SPEED_BUTTON.h);
  });

  it('reads Pause while running and Resume while paused', () => {
    expect(pauseLabel(false)).toBe('暂停');
    expect(pauseLabel(true)).toBe('继续');
  });
});
