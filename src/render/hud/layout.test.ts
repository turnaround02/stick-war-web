import { describe, it, expect } from 'vitest';
import {
  layoutPauseButton,
  layoutMenuButton,
  menuLabel,
  pauseLabel,
  speedLabel,
  layoutTrainButtons,
  layoutStanceButtons,
  layoutSpeedButtons,
  resourceText,
  speedHeaderRight,
  trainButtonState,
  waveText,
  bottomBarLayout,
  bottomBarHeight,
  compactTrainLabel,
  PAUSE_BUTTON,
  MENU_BUTTON,
  SPEED_BUTTON,
  STANCE_BUTTONS,
  type HudMetrics,
} from './layout';
import { UNITS } from '../../data/units';
import { SPEED_STEPS } from '../timestep';
import { createWorld } from '../../sim/createWorld';
import { DEFAULT_MATCH } from '../../data/levels';
import { t } from '../../i18n';
import { shouldIgnoreClick } from '../clickGuard';

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

describe('waveText', () => {
  it('is empty for a non-endless match', () => {
    // Scripted/campaign levels have no wave SCORE; showing a wave number there
    // would imply a meaning the mode does not have.
    const w = world();
    w.endless = false;
    expect(waveText(w)).toBe('');
  });

  it('shows the current wave for an endless match', () => {
    const w = world();
    w.endless = true;
    w.waveIndex = 8;
    expect(waveText(w)).toContain('8');
    expect(waveText(w)).toContain('波次');
  });

  it('shows wave 0 before the first wave has spawned', () => {
    const w = world();
    w.endless = true;
    w.waveIndex = 0;
    expect(waveText(w)).toContain('0');
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
    expect(rects).toHaveLength(6);
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

  it('has a real translation for every stance button key', () => {
    // The renderer writes each stance label from t(key) on every sync (the
    // cached-label0 defect meant a locale change never reached these buttons).
    // The Phaser HUD is untestable, so guard the mechanism here: every key must
    // resolve to something other than itself.
    for (const { key } of STANCE_BUTTONS) {
      expect(t(key), `missing translation for ${key}`).not.toBe(key);
    }
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

  it('never overlaps the speed group', () => {    for (const width of [640, 1280, 1920]) {
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
      const menu = layoutMenuButton(width, metrics);
      const headerRight = speedHeaderRight(width, metrics);
      // The header is right-aligned at headerRight, so its text must fit in the
      // space to the LEFT of the MENU button (the cluster's leftmost button).
      expect(headerRight, `width ${width}`).not.toBeNull();
      expect(headerRight!, `width ${width}`).toBeLessThanOrEqual(menu.x);
      expect(headerRight!, `width ${width}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns null for the header on a narrow viewport instead of overlapping (M8b)', () => {
    // At 532px the header sat at menu.x - gap ≈ 259, INSIDE the 240px resource
    // reserve and under the menu button's label — three texts on one spot, seen
    // live on the deployed site. The layout must refuse, not misplace.
    expect(speedHeaderRight(532, metrics)).toBeNull();
    expect(speedHeaderRight(600, metrics)).toBeNull();
    // Comfortably wide viewports still get one.
    expect(speedHeaderRight(1024, metrics)).not.toBeNull();
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

describe('in-game menu button (M8)', () => {
  it('sits to the LEFT of the pause button on the same row', () => {
    for (const width of [640, 1280, 1920]) {
      const menu = layoutMenuButton(width, metrics);
      const pause = layoutPauseButton(width, metrics);
      expect(menu.x + menu.w, `width ${width}`).toBeLessThanOrEqual(pause.x);
      expect(menu.y, `width ${width}`).toBe(pause.y);
      expect(menu.h, `width ${width}`).toBe(pause.h);
    }
  });

  it('leaves a positive gap to the pause button', () => {
    for (const width of [640, 1280, 1920]) {
      const menu = layoutMenuButton(width, metrics);
      const pause = layoutPauseButton(width, metrics);
      expect(pause.x - (menu.x + menu.w), `width ${width}`).toBeGreaterThan(0);
    }
  });

  it('stays inside the viewport at narrow widths', () => {
    const menu = layoutMenuButton(640, metrics);
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.w).toBeLessThanOrEqual(640);
  });

  it('uses the dimensions the renderer is told to draw', () => {
    const menu = layoutMenuButton(1280, metrics);
    expect(menu.w).toBe(MENU_BUTTON.w);
    expect(menu.h).toBe(MENU_BUTTON.h);
  });

  it('is labeled 菜单', () => {
    expect(menuLabel()).toBe('菜单');
  });

  it('remains inside the click-guard reserved top-right region', () => {
    // The guard reserves the right 240px of the top strip; the menu button is
    // the leftmost of the top-right cluster, so a click on it must be ignored
    // by unit selection rather than treated as a battlefield click.
    const menu = layoutMenuButton(1280, metrics);
    // Click at the menu button's left edge — the point furthest from the
    // reserved corner. If even THAT is reserved, the whole button is.
    expect(shouldIgnoreClick(menu.x + 2, menu.y + 2, 1280, 720)).toBe(true);
  });
});

describe('speedLabel', () => {
  it('labels every speed the game offers', () => {
    // The buttons were rendered as three BLANK rectangles: `setSpeed` only ever
    // set the fill colour, so no code path called setText on their labels. The
    // layout had a pauseLabel helper and no speedLabel counterpart, which is
    // exactly how the gap went unnoticed.
    for (const speed of SPEED_STEPS) {
      expect(speedLabel(speed), `speed ${speed}`).toBe(`${speed}x`);
    }
  });

  it('produces a distinct label per speed', () => {
    const labels = SPEED_STEPS.map(speedLabel);
    expect(new Set(labels).size).toBe(SPEED_STEPS.length);
  });

  it('never returns an empty label', () => {
    for (const speed of SPEED_STEPS) expect(speedLabel(speed).length).toBeGreaterThan(0);
  });
});

/**
 * M13b — the bottom-bar squeeze ladder.
 *
 * Before M13b the bottom bar was a fixed 1036px row (9 × 108 + 8 × 8) centred
 * on the viewport: below ~1052px it overflowed BOTH edges symmetrically, and
 * the miner, swordsman, hold and retreat buttons were physically off-screen.
 * Seen live at 718px — the deployed README screenshot shows only 5 of the 9
 * buttons, so the player could not train miners or order a retreat.
 *
 * The ladder (every threshold DERIVED from rowWidth + padding, never a bare
 * constant next to the row math it must track):
 *   ≥ 1068  single row, full-size buttons (byte-identical to pre-M13b)
 *   ≥ 720   single row, squeezed buttons, two-line labels (compact)
 *   < 720   two stacked rows (train below, stance above), squeezed buttons
 */
describe('bottomBarLayout — the squeeze ladder (M13b)', () => {
  it('keeps the full single row at desktop widths', () => {
    const bl = bottomBarLayout(1280, metrics);
    expect(bl.rows).toBe(1);
    expect(bl.buttonW).toBe(108);
    expect(bl.buttonH).toBe(44);
    expect(bl.barHeight).toBe(metrics.barHeight);
    expect(bl.compact).toBe(false);
  });

  it('squeezes the single row before stacking it', () => {
    const bl = bottomBarLayout(1000, metrics);
    expect(bl.rows).toBe(1);
    expect(bl.buttonW).toBe(100);
    expect(bl.barHeight).toBe(metrics.barHeight);
    expect(bl.compact).toBe(true);
  });

  it('stacks two rows below the single-row floor', () => {
    const bl = bottomBarLayout(719, metrics);
    expect(bl.rows).toBe(2);
    expect(bl.buttonW).toBe(107);
    expect(bl.barHeight).toBe(2 * 44 + 8 + 2 * 10);
    expect(bl.compact).toBe(true);
  });

  it('squeezed two-row buttons fit the evidence viewport (532px)', () => {
    const bl = bottomBarLayout(532, metrics);
    expect(bl.rows).toBe(2);
    expect(bl.buttonW).toBe(76);
  });

  it('floors the button width instead of shrinking to nothing', () => {
    expect(bottomBarLayout(250, metrics).buttonW).toBe(32);
  });
});

describe('bottom bar fits every viewport (M13b — the bug)', () => {
  // Widths where the old layout put buttons off-screen or right at the edge,
  // including both live-evidence widths (532 and 718).
  const widths = [1280, 1068, 1000, 718, 600, 532, 414, 375, 360];

  for (const width of widths) {
    it(`keeps all 9 buttons inside a ${width}px viewport`, () => {
      const train = layoutTrainButtons(width, 720, metrics);
      const stance = layoutStanceButtons(width, 720, metrics);
      expect(train).toHaveLength(6);
      expect(stance).toHaveLength(3);
      for (const r of [...train, ...stance]) {
        expect(r.x, `left edge at ${width}`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `right edge at ${width}`).toBeLessThanOrEqual(width);
      }
    });

    it(`never overlaps buttons at ${width}px`, () => {
      const train = layoutTrainButtons(width, 720, metrics);
      for (let i = 1; i < train.length; i++) {
        expect(train[i].x).toBeGreaterThanOrEqual(train[i - 1].x + train[i - 1].w);
      }
      const stance = layoutStanceButtons(width, 720, metrics);
      for (let i = 1; i < stance.length; i++) {
        expect(stance[i].x).toBeGreaterThanOrEqual(stance[i - 1].x + stance[i - 1].w);
      }
    });
  }
});

describe('two-row geometry (M13b)', () => {
  it('stacks stance above train with a gap, inside a taller bar', () => {
    const train = layoutTrainButtons(532, 960, metrics);
    const stance = layoutStanceButtons(532, 960, metrics);
    // Train is the BOTTOM row: the most-used buttons sit closest to the edge.
    expect(stance[0].y + stance[0].h).toBeLessThanOrEqual(train[0].y);
    // Both rows sit inside the taller bar, and the bar inside the viewport.
    expect(train[0].y).toBeGreaterThanOrEqual(960 - 116);
    expect(train[0].y + train[0].h).toBeLessThanOrEqual(960);
    expect(stance[0].y).toBeGreaterThanOrEqual(960 - 116);
    // Same button size in both rows.
    expect(stance[0].w).toBe(train[0].w);
    expect(stance[0].h).toBe(train[0].h);
  });

  it('keeps the desktop row layout byte-identical (fingerprint)', () => {
    // (1280 − 1036) / 2 = 122; y = 720 − 64/2 − 44/2 = 666. The wide layout is
    // frozen the same way level 1's fingerprint is: the squeeze must only
    // ever change behaviour BELOW the single-row floor.
    expect(layoutTrainButtons(1280, 720, metrics)[0]).toEqual({ x: 122, y: 666, w: 108, h: 44 });
    expect(layoutStanceButtons(1280, 720, metrics)[0]).toEqual({
      x: 122 + 6 * 108 + 6 * 8,
      y: 666,
      w: 108,
      h: 44,
    });
  });

  it('reports the bar height the renderer and the guard must both use', () => {
    expect(bottomBarHeight(1280, metrics)).toBe(64);
    expect(bottomBarHeight(1000, metrics)).toBe(64);
    expect(bottomBarHeight(532, metrics)).toBe(116);
  });
});

describe('compactTrainLabel (M13b)', () => {
  it('splits name and price onto two lines when enabled', () => {
    expect(compactTrainLabel('archer', true, '')).toEqual({ line1: '弓箭手', line2: `${UNITS.archer.goldCost}` });
  });

  it('replaces the price with the reason when disabled', () => {
    // A disabled button has no useful price to show twice; the reason is what
    // tells the player what to fix (trainButtonState's own contract).
    expect(compactTrainLabel('swordsman', false, '金币不足')).toEqual({ line1: '剑士', line2: '金币不足' });
  });
});
