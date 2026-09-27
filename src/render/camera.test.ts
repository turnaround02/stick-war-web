import { describe, it, expect } from 'vitest';
import {
  clampZoom,
  clampScrollX,
  maxScrollX,
  minScrollX,
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

/**
 * Phaser cameras have originX = 0.5, so `scrollX` is NOT the left world edge
 * once the camera is zoomed. `Camera.preRender` computes
 * `worldView.x = scrollX + W/2 - (W/z)/2`, and Phaser's own `clampX` uses the
 * band [(W/z - W)/2, (W/z - W)/2 + worldWidth - W/z].
 *
 * These tests encode THAT band. Getting it wrong is not cosmetic: a limit
 * smaller than Phaser's leaves the far end of the battlefield unreachable, so
 * the enemy base can never be seen when zoomed out.
 */
describe('scroll band matches Phaser origin-0.5 cameras', () => {
  it('is zero at 1x, where scrollX IS the left edge', () => {
    expect(minScrollX(1280, 1)).toBe(0);
  });

  it('is positive when zoomed out, because the camera overhangs the origin', () => {
    // (1280/0.6 - 1280)/2 = (2133.33 - 1280)/2 = 426.67
    expect(minScrollX(1280, 0.6)).toBeCloseTo(426.67, 1);
  });

  it('is negative when zoomed in', () => {
    // (1280/1.2 - 1280)/2 = (1066.67 - 1280)/2 = -106.67
    expect(minScrollX(1280, 1.2)).toBeCloseTo(-106.67, 1);
  });

  it('lets the camera reach the far edge of the world at 0.6x', () => {
    // Phaser allows up to 1293.33 here. A limit of 866.67 (worldWidth minus
    // visible width, ignoring the origin) would stop 426px short, leaving the
    // enemy base at x=2700 permanently off screen.
    const max = maxScrollX(WORLD_WIDTH, 1280, 0.6);
    expect(max).toBeCloseTo(1293.33, 1);
    // The rightmost world pixel reachable must be the world edge.
    const rightmostVisible = max - minScrollX(1280, 0.6) + 1280 / 0.6;
    expect(rightmostVisible).toBeCloseTo(WORLD_WIDTH, 1);
  });

  it('lets the camera reach the near edge of the world at 0.6x', () => {
    const min = minScrollX(1280, 0.6);
    const leftmostVisible = min - min;
    expect(leftmostVisible).toBeCloseTo(0, 1);
  });

  it('covers the whole world at 1x', () => {
    expect(maxScrollX(WORLD_WIDTH, 1280, 1)).toBe(WORLD_WIDTH - 1280);
  });

  it('never returns a max below the min', () => {
    expect(maxScrollX(500, 1280, 1)).toBeGreaterThanOrEqual(minScrollX(1280, 1));
    expect(maxScrollX(500, 1280, 0.6)).toBeGreaterThanOrEqual(minScrollX(1280, 0.6));
  });
});

describe('clampScrollX', () => {
  it('keeps a valid scroll unchanged', () => {
    expect(clampScrollX(500, WORLD_WIDTH, 1280, 1)).toBe(500);
  });

  it('clamps at the left edge at 1x', () => {
    expect(clampScrollX(-100, WORLD_WIDTH, 1280, 1)).toBe(0);
  });

  it('clamps at the right edge at 1x', () => {
    expect(clampScrollX(99999, WORLD_WIDTH, 1280, 1)).toBe(maxScrollX(WORLD_WIDTH, 1280, 1));
  });

  it('clamps to the zoom-dependent band, not to zero', () => {
    // At 0.6x a scroll of 100 is below the origin offset, so it must be raised.
    expect(clampScrollX(100, WORLD_WIDTH, 1280, 0.6)).toBeCloseTo(minScrollX(1280, 0.6), 1);
    expect(clampScrollX(99999, WORLD_WIDTH, 1280, 0.6)).toBeCloseTo(
      maxScrollX(WORLD_WIDTH, 1280, 0.6),
      1,
    );
  });

  it('allows a small negative scroll when zoomed in', () => {
    // At 1.2x the camera legitimately overhangs the origin, so -50 is valid.
    expect(clampScrollX(-50, WORLD_WIDTH, 1280, 1.2)).toBe(-50);
  });
});

describe('edge scroll', () => {
  it('has a margin narrower than the viewport', () => {
    expect(EDGE_SCROLL_MARGIN).toBeGreaterThan(0);
    expect(EDGE_SCROLL_MARGIN).toBeLessThan(200);
  });
});
