import { describe, it, expect } from 'vitest';
import {
  layoutTrainButtons,
  layoutStanceButtons,
  layoutSpeedButtons,
  resourceText,
  trainButtonState,
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
