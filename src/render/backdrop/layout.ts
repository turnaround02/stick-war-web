/**
 * Battlefield backdrop geometry and palette, kept free of Phaser.
 *
 * The M12 follow-up to "UI 太简陋": the battlefield was a flat `#1a1d24` with
 * one ground line. This module defines a DUSK scene drawn as programmatic
 * layers — sky gradient bands, a far mountain silhouette, a near hill
 * silhouette, and a layered ground — all derived from the viewport so the
 * scene only turns the answers into Graphics calls.
 *
 * Parallax: the two silhouette layers scroll at a fraction of camera speed.
 * Their X offsets are computed HERE (pure) from the camera scrollX; the scene
 * applies them as Graphics x-translation.
 *
 * Everything is a silhouette or flat band ON PURPOSE: units must stay the
 * highest-contrast element on screen (spec §7.1), and silhouettes cannot
 * compete with them for attention.
 */

import { WORLD_WIDTH } from '../../data/constants';

/** Sky gradient, top → horizon. Warm dusk. */
export const SKY_BANDS: ReadonlyArray<{ color: number; heightFrac: number }> = [
  { color: 0x2b2440, heightFrac: 0.18 }, // deep violet, top
  { color: 0x4a3555, heightFrac: 0.16 },
  { color: 0x7a4a5a, heightFrac: 0.14 },
  { color: 0xb56b52, heightFrac: 0.10 }, // warm orange near the horizon
];

/** Ground palette, horizon → bottom. Cool dark to contrast the sky. */
export const GROUND_BANDS: ReadonlyArray<{ color: number; heightFrac: number }> = [
  { color: 0x3a3242, heightFrac: 0.35 }, // just below the ground line
  { color: 0x2b2635, heightFrac: 0.65 }, // deepening to the bottom
];

/** Far mountain silhouette colour (drawn over the sky, under the hills). */
export const FAR_COLOR = 0x3d3350;
/** Near hill silhouette colour. */
export const NEAR_COLOR = 0x2e2840;
/** The horizon line where ground meets sky (a fraction of viewport height). */
export const HORIZON_FRAC = 0.52;

/** How much of the camera's scrollX each layer follows (parallax factors). */
export const PARALLAX = { far: 0.25, near: 0.5 } as const;

/** A horizon-height pair for one layer: polyline peaks as x-fraction/height pairs. */
export interface SilhouetteLayer {
  /** Peak x positions as fractions of the layer's tile width. */
  peaks: ReadonlyArray<{ x: number; h: number }>;
  /** Tile width in px — the silhouette repeats every tileWidth across the world. */
  tileWidth: number;
}

/** Far mountains: tall, sparse, jagged. */
export const FAR_LAYER: SilhouetteLayer = {
  tileWidth: 900,
  peaks: [
    { x: 0.0, h: 0.55 },
    { x: 0.18, h: 0.85 },
    { x: 0.32, h: 0.45 },
    { x: 0.55, h: 0.95 },
    { x: 0.75, h: 0.5 },
    { x: 1.0, h: 0.7 },
  ],
};

/** Near hills: low, rolling, frequent. */
export const NEAR_LAYER: SilhouetteLayer = {
  tileWidth: 620,
  peaks: [
    { x: 0.0, h: 0.3 },
    { x: 0.25, h: 0.5 },
    { x: 0.5, h: 0.25 },
    { x: 0.78, h: 0.55 },
    { x: 1.0, h: 0.35 },
  ],
};

/** Height of the silhouette area, as a fraction of the horizon height. */
export const SILHOUETTE_HEIGHT_FRAC = 0.55;

export interface BackdropPlan {
  /** Sky bands, top-down: y start, y end, colour. Absolute px. */
  sky: Array<{ y0: number; y1: number; color: number }>;
  /** Ground bands, top-down. Absolute px. */
  ground: Array<{ y0: number; y1: number; color: number }>;
  /** Horizon y (== groundY of the battlefield). */
  horizon: number;
}

/**
 * Computes the static layer geometry for a viewport.
 *
 * The sky fills from 0 to the horizon; the ground fills from the horizon to
 * the bottom of the viewport (both by the band fractions of their own span).
 */
export function backdropPlan(height: number, horizon: number): BackdropPlan {
  const skySpan = horizon;
  let y = 0;
  const sky = SKY_BANDS.map((b) => {
    const y1 = Math.round(y + b.heightFrac * skySpan);
    const band = { y0: Math.round(y), y1, color: b.color };
    y = y1;
    return band;
  });
  // The last sky band stretches to the horizon exactly, so no gap remains.
  sky[sky.length - 1]!.y1 = horizon;

  const groundSpan = Math.max(0, height - horizon);
  let gy = horizon;
  const ground = GROUND_BANDS.map((b) => {
    const y1 = Math.round(gy + b.heightFrac * groundSpan);
    const band = { y0: Math.round(gy), y1, color: b.color };
    gy = y1;
    return band;
  });
  ground[ground.length - 1]!.y1 = height;

  return { sky, ground, horizon };
}

/**
 * The silhouette polyline for one layer across the visible world.
 *
 * Returns absolute-x/height pairs (height above the horizon, in px). The layer
 * repeats its tile across the world; `scrollX * factor` shifts which part of
 * the repeat is visible, which is the parallax.
 */
export function silhouettePoints(
  layer: SilhouetteLayer,
  horizon: number,
  scrollX: number,
  factor: number,
): Array<{ x: number; h: number }> {
  const maxHeight = horizon * SILHOUETTE_HEIGHT_FRAC;
  const shifted = scrollX * factor;
  // Cover one tile beyond each side of the visible band so scrolling never
  // exposes a seam. The world is 3000 wide; tiles repeat across it.
  const startTile = Math.floor(shifted / layer.tileWidth) - 1;
  const endTile = Math.floor((shifted + WORLD_WIDTH) / layer.tileWidth) + 1;
  const points: Array<{ x: number; h: number }> = [];
  for (let tile = startTile; tile <= endTile; tile++) {
    for (const peak of layer.peaks) {
      const worldX = tile * layer.tileWidth + peak.x * layer.tileWidth - shifted;
      // Average neighbouring peak heights for a jagged-but-smooth skyline.
      points.push({ x: Math.round(worldX), h: Math.round(peak.h * maxHeight) });
    }
  }
  return points;
}
