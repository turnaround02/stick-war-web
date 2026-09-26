import { describe, it, expect } from 'vitest';
import {
  clampZoom,
  clampScrollX,
  maxScrollX,
  MIN_ZOOM,
  MAX_ZOOM,
  EDGE_SCROLL_MARGIN,
} from './camera';
import { WORLD_WIDTH } from '../data/constants';

describe('clampZoom', () => {
  it('keeps zoom inside the allowed band', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
  });

  it('clamps below the minimum', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
  });

  it('clamps above the maximum', () => {
    expect(clampZoom(5)).toBe(MAX_ZOOM);
  });

  it('uses the spec band of 0.6x to 1.2x', () => {
    expect(MIN_ZOOM).toBe(0.6);
    expect(MAX_ZOOM).toBe(1.2);
  });
});

describe('maxScrollX', () => {
  it('is the world width minus the visible width', () => {
    // At 1x a 1280px viewport sees 1280px of world, leaving 1720px to scroll.
    expect(maxScrollX(WORLD_WIDTH, 1280, 1)).toBe(WORLD_WIDTH - 1280);
  });

  it('shrinks as the camera zooms out', () => {
    const wide = maxScrollX(WORLD_WIDTH, 1280, 0.6);
    const narrow = maxScrollX(WORLD_WIDTH, 1280, 1.2);
    expect(wide).toBeLessThan(narrow);
  });

  it('never goes negative', () => {
    expect(maxScrollX(500, 1280, 1)).toBe(0);
  });

  it('is exactly right at 0.6x', () => {
    // 1280 / 0.6 = 2133.33 world px visible; 3000 - 2133.33 = 866.67
    expect(maxScrollX(WORLD_WIDTH, 1280, 0.6)).toBeCloseTo(866.67, 1);
  });
});

describe('clampScrollX', () => {
  it('keeps a valid scroll unchanged', () => {
    expect(clampScrollX(500, WORLD_WIDTH, 1280, 1)).toBe(500);
  });

  it('clamps at the left edge', () => {
    expect(clampScrollX(-100, WORLD_WIDTH, 1280, 1)).toBe(0);
  });

  it('clamps at the right edge', () => {
    expect(clampScrollX(99999, WORLD_WIDTH, 1280, 1)).toBe(maxScrollX(WORLD_WIDTH, 1280, 1));
  });

  it('respects the zoom when clamping', () => {
    // At 0.6x the right limit is much smaller, so a value valid at 1x is not.
    expect(clampScrollX(1500, WORLD_WIDTH, 1280, 0.6)).toBeCloseTo(866.67, 1);
    expect(clampScrollX(1500, WORLD_WIDTH, 1280, 1.2)).toBe(1500);
  });
});

describe('edge scroll', () => {
  it('has a margin narrower than the viewport', () => {
    expect(EDGE_SCROLL_MARGIN).toBeGreaterThan(0);
    expect(EDGE_SCROLL_MARGIN).toBeLessThan(200);
  });
});
