import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  resultButtonRects,
  resultPanelRect,
  resultSubtitle,
  resultTitle,
  shouldShowResult,
} from './layout';
import { createWorld } from '../../sim/createWorld';
import { DEFAULT_MATCH } from '../../data/levels';

const world = (outcome: 'ongoing' | 'playerWin' | 'playerLose') => {
  const w = createWorld({ ...DEFAULT_MATCH, levelId: 'level-1' }, 1);
  w.outcome = outcome;
  return w;
};

describe('shouldShowResult', () => {
  it('hides while the match is ongoing', () => {
    expect(shouldShowResult(world('ongoing'))).toBe(false);
  });

  it('shows on a win', () => {
    expect(shouldShowResult(world('playerWin'))).toBe(true);
  });

  it('shows on a loss', () => {
    expect(shouldShowResult(world('playerLose'))).toBe(true);
  });
});

describe('resultTitle', () => {
  it('says victory on a win and defeat on a loss', () => {
    expect(resultTitle('playerWin')).toBe('胜利');
    expect(resultTitle('playerLose')).toBe('失败');
  });

  it('does not claim victory for an undecided match', () => {
    expect(resultTitle('ongoing')).not.toBe('胜利');
  });
});

describe('formatDuration', () => {
  it('formats ticks as mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(30)).toBe('0:01');
    expect(formatDuration(30 * 65)).toBe('1:05');
    expect(formatDuration(30 * 169)).toBe('2:49');
  });

  it('pads seconds to two digits', () => {
    expect(formatDuration(30 * 61)).toBe('1:01');
  });

  it('rolls over into minutes, not seconds', () => {
    expect(formatDuration(30 * 60)).toBe('1:00');
    expect(formatDuration(30 * 120)).toBe('2:00');
  });

  it('never shows a negative time', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('resultSubtitle', () => {
  it('names the level and the duration', () => {
    const s = resultSubtitle('level-1', 30 * 169);
    expect(s).toContain('2:49');
    expect(s).toContain('第一关');
  });

  it('falls back to the raw id for an unknown level', () => {
    expect(resultSubtitle('mystery', 0)).toContain('mystery');
  });
});

describe('resultPanelRect', () => {
  it('is centred horizontally', () => {
    const r = resultPanelRect(1280, 720);
    expect(r.x + r.w / 2).toBeCloseTo(640, 0);
  });

  it('is centred vertically', () => {
    const r = resultPanelRect(1280, 720);
    expect(r.y + r.h / 2).toBeCloseTo(360, 0);
  });

  it('stays inside the viewport', () => {
    for (const [w, h] of [[1280, 720], [800, 600], [1920, 1080], [640, 480]] as const) {
      const r = resultPanelRect(w, h);
      expect(r.x, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `${w}x${h}`).toBeLessThanOrEqual(w);
      expect(r.y + r.h, `${w}x${h}`).toBeLessThanOrEqual(h);
    }
  });

  it('has a usable size', () => {
    const r = resultPanelRect(1280, 720);
    expect(r.w).toBeGreaterThan(200);
    expect(r.h).toBeGreaterThan(100);
  });

  it('shrinks rather than overflowing a tiny viewport', () => {
    const r = resultPanelRect(240, 200);
    expect(r.x + r.w).toBeLessThanOrEqual(240);
    expect(r.y + r.h).toBeLessThanOrEqual(200);
  });
});

describe('resultButtonRects', () => {
  it('never overlaps the two buttons', () => {
    for (const [w, h] of [[1280, 720], [800, 600], [640, 480], [1920, 1080]] as const) {
      const { replay, next } = resultButtonRects(w, h);
      const overlap = replay.x < next.x + next.w && next.x < replay.x + replay.w;
      expect(overlap, `buttons overlap at ${w}x${h}`).toBe(false);
    }
  });

  it('puts both buttons inside the panel', () => {
    const panel = resultPanelRect(1280, 720);
    const { replay, next } = resultButtonRects(1280, 720);
    for (const b of [replay, next]) {
      expect(b.x).toBeGreaterThanOrEqual(panel.x);
      expect(b.x + b.w).toBeLessThanOrEqual(panel.x + panel.w);
      expect(b.y + b.h).toBeLessThanOrEqual(panel.y + panel.h);
    }
  });

  it('keeps both buttons inside the viewport at small sizes', () => {
    const { replay, next } = resultButtonRects(640, 480);
    for (const b of [replay, next]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(640);
      expect(b.y + b.h).toBeLessThanOrEqual(480);
    }
  });

  it('has a clickable size', () => {
    const { replay } = resultButtonRects(1280, 720);
    expect(replay.w).toBeGreaterThan(60);
    expect(replay.h).toBeGreaterThan(28);
  });

  it('sits below the panel centre, leaving room for the text', () => {
    const panel = resultPanelRect(1280, 720);
    const { replay } = resultButtonRects(1280, 720);
    expect(replay.y).toBeGreaterThan(panel.y + panel.h / 2);
  });
});
