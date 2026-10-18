import { describe, it, expect } from 'vitest';
import {
  menuPanelRect,
  menuRows,
  menuAuxRect,
  canResetProgress,
  resumeLevelIndex,
  MENU_LAYOUT,
} from './layout';
import { LEVELS, LAST_CAMPAIGN_INDEX } from '../../data/levels';

describe('menuPanelRect', () => {
  it('is centred', () => {
    const r = menuPanelRect(1280, 720);
    expect(r.x + r.w / 2).toBeCloseTo(640, 0);
    expect(r.y + r.h / 2).toBeCloseTo(360, 0);
  });

  it('stays inside small viewports', () => {
    for (const [w, h] of [[640, 480], [320, 240]] as const) {
      const r = menuPanelRect(w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
    }
  });
});

describe('menuRows', () => {
  it('lists every level in LEVELS order', () => {
    const rows = menuRows(1280, 720, 3);
    expect(rows.map((r) => r.levelIndex)).toEqual([0, 1, 2, 3]);
    expect(rows[3]!.endless).toBe(true);
    expect(rows[0]!.endless).toBe(false);
  });

  it('always unlocks level 1', () => {
    expect(menuRows(1280, 720, 0)[0]!.enabled).toBe(true);
  });

  it('gates each level behind the save progress', () => {
    const rows = menuRows(1280, 720, 1);
    expect(rows[0]!.enabled).toBe(true);
    expect(rows[1]!.enabled).toBe(true);
    expect(rows[2]!.enabled).toBe(false);
    expect(rows[3]!.enabled).toBe(false);
  });

  it('unlocks endless only after the last campaign level is beaten', () => {
    // furthestLevel is capped at LAST_CAMPAIGN_INDEX on a win, so reaching
    // endless means reaching that cap.
    const rows = menuRows(1280, 720, LAST_CAMPAIGN_INDEX);
    expect(rows[LAST_CAMPAIGN_INDEX]!.enabled).toBe(true);
    expect(rows[rows.length - 1]!.enabled).toBe(false);
  });

  it('never lets rows overlap or leave the panel', () => {
    for (const [w, h] of [[1280, 720], [800, 600], [640, 480]] as const) {
      const panel = menuPanelRect(w, h);
      const rows = menuRows(w, h, 3);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.rect.y, `${w}x${h} row ${i}`).toBeGreaterThanOrEqual(
          rows[i - 1]!.rect.y + rows[i - 1]!.rect.h,
        );
      }
      for (const row of rows) {
        expect(row.rect.x).toBeGreaterThanOrEqual(panel.x);
        expect(row.rect.x + row.rect.w).toBeLessThanOrEqual(panel.x + panel.w);
        expect(row.rect.y).toBeGreaterThanOrEqual(panel.y);
      }
    }
  });

  it('labels rows from the i18n table', () => {
    const rows = menuRows(1280, 720, 3);
    expect(rows[0]!.label).toBe('第一关');
    expect(rows[rows.length - 1]!.label).toBe('无尽模式');
  });
});

describe('menuAuxRect', () => {
  it('sits below the last row', () => {
    const rows = menuRows(1280, 720, 0);
    const aux = menuAuxRect(1280, 720);
    const last = rows[rows.length - 1]!;
    expect(aux.y).toBeGreaterThanOrEqual(last.rect.y + last.rect.h);
  });

  it('stays inside the panel horizontally', () => {
    const panel = menuPanelRect(1280, 720);
    const aux = menuAuxRect(1280, 720);
    expect(aux.x).toBeGreaterThanOrEqual(panel.x);
    expect(aux.x + aux.w).toBeLessThanOrEqual(panel.x + panel.w);
  });
});

describe('canResetProgress', () => {
  it('offers nothing to reset on a fresh save', () => {
    expect(canResetProgress(0, 0)).toBe(false);
  });

  it('offers the reset once any progress exists', () => {
    expect(canResetProgress(1, 0)).toBe(true);
    expect(canResetProgress(0, 5)).toBe(true);
  });
});

describe('resumeLevelIndex', () => {
  it('matches the BootScene rule: furthest level, capped at the last campaign', () => {
    expect(resumeLevelIndex(0)).toBe(0);
    expect(resumeLevelIndex(2)).toBe(2);
    // A save somehow at the endless index must resume into the last CAMPAIGN
    // level, not a mode the player cannot win.
    expect(resumeLevelIndex(LEVELS.length - 1)).toBe(LAST_CAMPAIGN_INDEX);
  });

  it('never returns a negative index', () => {
    expect(resumeLevelIndex(-3)).toBe(0);
  });
});

describe('MENU_LAYOUT sanity', () => {
  it('panel is wide enough for its content', () => {
    expect(MENU_LAYOUT.panelW).toBeGreaterThan(MENU_LAYOUT.auxW);
    expect(MENU_LAYOUT.rowH).toBeGreaterThan(MENU_LAYOUT.buttonH);
  });
});
