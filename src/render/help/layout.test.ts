import { describe, it, expect } from 'vitest';
import { helpPanelRect, helpLines, helpCloseRect, HELP_LAYOUT } from './layout';

describe('helpPanelRect', () => {
  it('is centred', () => {
    const r = helpPanelRect(1280, 720);
    expect(r.x + r.w / 2).toBeCloseTo(640, 0);
    expect(r.y + r.h / 2).toBeCloseTo(360, 0);
  });

  it('stays inside small viewports', () => {
    for (const [w, h] of [[532, 960], [320, 240]] as const) {
      const r = helpPanelRect(w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
    }
  });

  it('holds all five lines plus title and button', () => {
    const r = helpPanelRect(1280, 720);
    // 5 lines + title block + close button must fit within the panel height.
    expect(helpLines().length * HELP_LAYOUT.lineH + HELP_LAYOUT.pad * 3).toBeLessThan(r.h);
  });
});

describe('helpCloseRect', () => {
  it('sits inside the panel at its bottom', () => {
    const panel = helpPanelRect(1280, 720);
    const close = helpCloseRect(1280, 720);
    expect(close.x).toBeGreaterThanOrEqual(panel.x);
    expect(close.x + close.w).toBeLessThanOrEqual(panel.x + panel.w);
    expect(close.y + close.h).toBeLessThanOrEqual(panel.y + panel.h);
  });

  it('is clickable', () => {
    const close = helpCloseRect(1280, 720);
    expect(close.w).toBeGreaterThan(60);
    expect(close.h).toBeGreaterThan(24);
  });
});

describe('helpLines', () => {
  it('covers scroll, stance, pause, replay, and touch', () => {
    const lines = helpLines();
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('A/D');
    expect(lines[1]).toContain('Q/W/E');
    expect(lines[2]).toContain('空格');
    expect(lines[3]).toContain('R');
    expect(lines[4]).toContain('拖动');
  });

  it('every line differs from its raw key (missing i18n guard)', () => {
    for (const line of helpLines()) {
      expect(line).not.toMatch(/^help\./);
    }
  });
});
