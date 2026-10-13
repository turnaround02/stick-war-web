/**
 * Frontline indicator geometry and histogram maths, as pure functions.
 *
 * Phaser-free on purpose: bucketing is exactly the kind of arithmetic that
 * "looks right" but is off by one at a boundary, and the project's rule is that
 * anything decidable by an assertion must live in a module a test can import.
 * `index.ts` only turns these answers into Phaser objects — the same split as
 * `hud/layout.ts` vs `hud/index.ts`.
 *
 * The indicator is the ONLY global view of the battle (spec §7.3): the camera
 * scrolls on a single axis, so without it the player cannot see where the two
 * armies are relative to each other.
 */

import type { Side, World } from '../../sim/types';

/** Screen-space rectangle, matching the HUD's shape so renderers stay similar. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Number of histogram buckets.
 *
 * 24 over a 3000px world is ~125px per bucket: fine enough to show a front line
 * shifting, coarse enough that a single straggler does not read as a wall.
 */
export const BUCKET_COUNT = 24;

export interface FrontlineMetrics {
  /** Histogram bucket count. */
  buckets: number;
  /** World width the histogram spans. */
  worldWidth: number;
  /** Fraction of the viewport width the panel occupies (spec §7.3: 40%). */
  widthFraction: number;
  /** Distance from the top edge. */
  top: number;
  /** Histogram strip height. */
  histH: number;
  /** Base health-bar height. */
  barH: number;
  /** Gap between the histogram and the bars, and between the bars. */
  gap: number;
}

export const FRONTLINE_METRICS: FrontlineMetrics = {
  buckets: BUCKET_COUNT,
  worldWidth: 3000,
  widthFraction: 0.4,
  top: 8,
  histH: 26,
  barH: 10,
  gap: 6,
};

/**
 * Per-bucket combat-unit counts for one side.
 *
 * MINERS ARE EXCLUDED. They shuttle between the base and the mine, so counting
 * them would draw two static humps (one at each end) that never move and drown
 * the actual front-line signal. The indicator is about where the ARMIES are.
 *
 * Bucket index is `floor((x - 0) / bucketWidth)`, clamped to `[0, buckets-1]`,
 * so a unit exactly on a boundary lands in the bucket that boundary OPENS (left
 * bucket), and a unit outside the world clamps to the first/last bucket instead
 * of producing an out-of-range index or NaN.
 */
export function combatUnitCounts(world: World, side: Side, metrics: FrontlineMetrics = FRONTLINE_METRICS): number[] {
  const counts = new Array<number>(metrics.buckets).fill(0);
  const bucketWidth = metrics.worldWidth / metrics.buckets;

  for (const unit of world.units) {
    if (unit.side !== side) continue;
    if (unit.state === 'dead') continue;
    // Miners are economy, not the line; see the doc comment.
    if (unit.typeId === 'miner') continue;

    let index = Math.floor(unit.x / bucketWidth);
    if (index < 0) index = 0;
    else if (index > metrics.buckets - 1) index = metrics.buckets - 1;
    counts[index]++;
  }

  return counts;
}

/**
 * Scales counts to `[0, 1]` against the tallest bucket, for bar heights.
 *
 * An all-zero histogram stays all-zero rather than dividing by zero.
 */
export function normalizeCounts(counts: readonly number[], buckets: number): number[] {
  const peak = counts.reduce((m, c) => Math.max(m, c), 0);
  const out = new Array<number>(buckets).fill(0);
  if (peak <= 0) return out;
  for (let i = 0; i < buckets && i < counts.length; i++) out[i] = counts[i] / peak;
  return out;
}

/** The top-centre panel, 40% of the viewport wide, never wider than the viewport. */
export function frontlinePanelRect(
  width: number,
  metrics: FrontlineMetrics = FRONTLINE_METRICS,
): Rect {
  const w = Math.min(width, Math.max(0, width * metrics.widthFraction));
  const h = metrics.histH + metrics.barH + metrics.gap * 2;
  return { x: (width - w) / 2, y: metrics.top, w, h };
}

/**
 * The two base health bars, at the left and right ends of the panel.
 *
 * Derived from the panel rect so they cannot drift away from the histogram they
 * belong to. Each bar is a fixed-width slot; the fill fraction comes from the
 * base's hp, computed by the renderer.
 */
export function baseBarRects(
  width: number,
  metrics: FrontlineMetrics = FRONTLINE_METRICS,
): { player: Rect; enemy: Rect } {
  const panel = frontlinePanelRect(width, metrics);
  const barW = Math.max(0, (panel.w - metrics.gap) / 2);
  const y = panel.y + metrics.histH + metrics.gap;
  return {
    player: { x: panel.x, y, w: barW, h: metrics.barH },
    enemy: { x: panel.x + barW + metrics.gap, y, w: barW, h: metrics.barH },
  };
}

/** The histogram strip inside the panel. */
export function histogramRect(
  width: number,
  metrics: FrontlineMetrics = FRONTLINE_METRICS,
): Rect {
  const panel = frontlinePanelRect(width, metrics);
  return { x: panel.x, y: panel.y, w: panel.w, h: metrics.histH };
}
