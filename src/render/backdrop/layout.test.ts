import { describe, it, expect } from 'vitest';
import {
  backdropPlan,
  silhouettePoints,
  FAR_LAYER,
  NEAR_LAYER,
  HORIZON_FRAC,
  SILHOUETTE_HEIGHT_FRAC,
} from './layout';

describe('backdropPlan', () => {
  it('spans the sky from 0 to the horizon with no gaps', () => {
    const plan = backdropPlan(720, 480);
    expect(plan.sky[0]!.y0).toBe(0);
    expect(plan.sky[plan.sky.length - 1]!.y1).toBe(480);
    for (let i = 1; i < plan.sky.length; i++) {
      expect(plan.sky[i]!.y0).toBe(plan.sky[i - 1]!.y1);
    }
  });

  it('spans the ground from the horizon to the viewport bottom with no gaps', () => {
    const plan = backdropPlan(720, 480);
    expect(plan.ground[0]!.y0).toBe(480);
    expect(plan.ground[plan.ground.length - 1]!.y1).toBe(720);
    for (let i = 1; i < plan.ground.length; i++) {
      expect(plan.ground[i]!.y0).toBe(plan.ground[i - 1]!.y1);
    }
  });

  it('keeps the horizon inside the viewport for extreme heights', () => {
    // A very short viewport: horizon frac 0.52 of 100 = 52; ground span 48.
    const plan = backdropPlan(100, 52);
    expect(plan.ground[plan.ground.length - 1]!.y1).toBe(100);
  });

  it('never produces negative band heights', () => {
    const plan = backdropPlan(960, 500);
    for (const band of [...plan.sky, ...plan.ground]) {
      expect(band.y1).toBeGreaterThanOrEqual(band.y0);
    }
  });
});

describe('silhouettePoints', () => {
  it('covers the visible world plus one tile of margin on each side', () => {
    const pts = silhouettePoints(FAR_LAYER, 500, 0, 0.25);
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    expect(minX).toBeLessThanOrEqual(-FAR_LAYER.tileWidth);
    expect(maxX).toBeGreaterThanOrEqual(3000 + FAR_LAYER.tileWidth);
  });

  it('shifts by the parallax factor as scrollX grows', () => {
    const at0 = silhouettePoints(FAR_LAYER, 500, 0, 0.25);
    const at1000 = silhouettePoints(FAR_LAYER, 500, 1000, 0.25);
    // The skyline pattern is periodic; compare the first peak x shift.
    expect(at1000[0]!.x).not.toBe(at0[0]!.x);
    // The far layer moves at 25% of camera speed: a 1000px scroll shifts the
    // pattern by 250px modulo the tile width.
    const shift = (at1000[0]!.x - at0[0]!.x) % FAR_LAYER.tileWidth;
    const expected = (-1000 * 0.25) % FAR_LAYER.tileWidth;
    expect(shift).toBeCloseTo(expected, 0);
  });

  it('heights never exceed the silhouette area', () => {
    const pts = silhouettePoints(NEAR_LAYER, 500, 300, 0.5);
    const maxH = 500 * SILHOUETTE_HEIGHT_FRAC;
    for (const p of pts) {
      expect(p.h).toBeLessThanOrEqual(maxH + 1);
      expect(p.h).toBeGreaterThanOrEqual(0);
    }
  });

  it('scroll 0 puts the pattern at its unshifted position', () => {
    const pts = silhouettePoints(FAR_LAYER, 500, 0, 0.25);
    // First tile starts at -tileWidth (the margin tile), so the first point
    // x should be negative.
    expect(pts[0]!.x).toBeLessThan(0);
  });

  it('the horizon fraction constant matches the battlefield ground fraction', () => {
    // HORIZON_FRAC (0.52) must sit ABOVE the units' ground line (2/3 ≈ 0.667):
    // silhouettes are backdrop, units walk on the ground line in front.
    expect(HORIZON_FRAC).toBeLessThan(2 / 3);
  });
});
