import { describe, it, expect } from 'vitest';
import {
  confirmPanelRect,
  confirmButtonRects,
  confirmTitle,
  confirmYesLabel,
  confirmNoLabel,
  CONFIRM_LAYOUT,
} from './layout';

describe('confirmPanelRect', () => {
  it('is centred', () => {
    const r = confirmPanelRect(1280, 720);
    expect(r.x + r.w / 2).toBeCloseTo(640, 0);
    expect(r.y + r.h / 2).toBeCloseTo(360, 0);
  });

  it('stays inside small viewports', () => {
    for (const [w, h] of [[640, 480], [320, 240]] as const) {
      const r = confirmPanelRect(w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
    }
  });
});

describe('confirmButtonRects', () => {
  it('places the two buttons side by side without overlap', () => {
    const { yes, no } = confirmButtonRects(1280, 720);
    expect(yes.x + yes.w).toBeLessThanOrEqual(no.x);
  });

  it('keeps both buttons inside the panel', () => {
    const panel = confirmPanelRect(1280, 720);
    const { yes, no } = confirmButtonRects(1280, 720);
    for (const b of [yes, no]) {
      expect(b.x).toBeGreaterThanOrEqual(panel.x);
      expect(b.x + b.w).toBeLessThanOrEqual(panel.x + panel.w);
      expect(b.y + b.h).toBeLessThanOrEqual(panel.y + panel.h);
    }
  });

  it('has a clickable size', () => {
    const { yes } = confirmButtonRects(1280, 720);
    expect(yes.w).toBeGreaterThan(60);
    expect(yes.h).toBeGreaterThan(28);
  });
});

describe('confirm copy', () => {
  it('warns that the running match is discarded', () => {
    expect(confirmTitle()).toContain('丢失');
  });

  it('labels the safe and destructive actions distinctly', () => {
    expect(confirmYesLabel()).toBe('确认');
    expect(confirmNoLabel()).toBe('取消');
  });

  it('button width fits the layout constant', () => {
    expect(CONFIRM_LAYOUT.buttonW).toBeGreaterThan(60);
  });
});
