import { describe, it, expect } from 'vitest';
import { shouldIgnoreClick, CLICK_GUARD } from './clickGuard';
import { FRONTLINE_METRICS, frontlinePanelRect } from './frontline/layout';

const W = 1000;
const H = 600;

describe('shouldIgnoreClick', () => {
  it('ignores the bottom HUD bar', () => {
    expect(shouldIgnoreClick(500, H - 10, W, H)).toBe(true);
  });

  it('ignores the top-left resource corner', () => {
    expect(shouldIgnoreClick(10, 20, W, H)).toBe(true);
  });

  it('ignores the top-right speed/pause corner', () => {
    expect(shouldIgnoreClick(W - 10, 20, W, H)).toBe(true);
  });

  it('ignores the top-CENTRE frontline indicator', () => {
    // The indicator is top-centre and 40% wide. The old guard only reserved
    // left/right 240px, so a click here leaked through and (de)selected units.
    const panel = frontlinePanelRect(W, FRONTLINE_METRICS).rect;
    const cx = panel.x + panel.w / 2;
    expect(shouldIgnoreClick(cx, panel.y + 5, W, H)).toBe(true);
  });

  it('does NOT ignore the middle of the battlefield', () => {
    expect(shouldIgnoreClick(500, 300, W, H)).toBe(false);
  });

  it('does NOT ignore a point just below the indicator', () => {
    const panel = frontlinePanelRect(W, FRONTLINE_METRICS).rect;
    // A pixel below the panel is playable field, not indicator.
    expect(shouldIgnoreClick(panel.x + panel.w / 2, panel.y + panel.h + 20, W, H)).toBe(false);
  });

  it('does NOT ignore a point left of the indicator but right of the corner', () => {
    const panel = frontlinePanelRect(W, FRONTLINE_METRICS).rect;
    // Between the reserved corner (240) and the panel's left edge.
    const x = CLICK_GUARD.cornerW + 1;
    if (x < panel.x) expect(shouldIgnoreClick(x, 20, W, H)).toBe(false);
  });

  it('reserves the indicator even when the viewport is narrow', () => {
    const narrowW = 400;
    const panel = frontlinePanelRect(narrowW, FRONTLINE_METRICS).rect;
    expect(shouldIgnoreClick(panel.x + panel.w / 2, panel.y + 5, narrowW, H)).toBe(true);
  });

  it('still ignores the corners when the panel would overlap them', () => {
    // Very narrow: the panel is small, corners remain reserved.
    expect(shouldIgnoreClick(10, 20, 300, H)).toBe(true);
    expect(shouldIgnoreClick(290, 20, 300, H)).toBe(true);
  });
});

/**
 * M13b — the bottom reserve must follow the bottom bar's squeeze ladder.
 *
 * The old guard reserved a fixed 64px. At narrow widths the bar stacks to two
 * rows (116px), so clicks in the 64–116px band ABOVE the bottom edge landed on
 * real buttons but were treated as battlefield clicks — the exact failure mode
 * M8 fixed for the top-right cluster, repeating for the bottom bar.
 */
describe('bottom reserve follows the squeeze ladder (M13b)', () => {
  it('reserves the taller two-row bar on a narrow viewport', () => {
    // 532px stacks the bar to 116px; 70px above the bottom edge is INSIDE it.
    expect(shouldIgnoreClick(266, 960 - 70, 532, 960)).toBe(true);
  });

  it('still leaves the battlefield above the tall bar clickable', () => {
    expect(shouldIgnoreClick(266, 960 - 117, 532, 960)).toBe(false);
  });

  it('keeps the 64px reserve on a desktop viewport', () => {
    expect(shouldIgnoreClick(500, 720 - 64, 1280, 720)).toBe(true);
    expect(shouldIgnoreClick(500, 720 - 65, 1280, 720)).toBe(false);
  });
});
