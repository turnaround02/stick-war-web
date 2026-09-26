/**
 * Camera maths, kept free of Phaser so the clamping rules are testable.
 *
 * The one subtlety: the right-hand scroll limit depends on the current zoom.
 * At 0.6x a 1280px viewport shows 2133 world px, so the camera may only travel
 * 867px before the world's edge would come into view. Using a fixed limit
 * would expose empty space whenever the player zoomed out.
 */

import { WORLD_WIDTH } from '../data/constants';

/** Spec §7.2. */
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 1.2;

/** How close to a viewport edge the pointer must be to scroll, in px. */
export const EDGE_SCROLL_MARGIN = 40;

/** Zoom clamped to the allowed band. */
export function clampZoom(zoom: number): number {
  if (zoom < MIN_ZOOM) return MIN_ZOOM;
  if (zoom > MAX_ZOOM) return MAX_ZOOM;
  return zoom;
}

/** The largest scrollX that still keeps the world covering the viewport. */
export function maxScrollX(worldWidth: number, viewportWidth: number, zoom: number): number {
  const visible = viewportWidth / (zoom > 0 ? zoom : 1);
  return Math.max(0, worldWidth - visible);
}

/** Scroll clamped to [0, maxScrollX]. */
export function clampScrollX(
  x: number,
  worldWidth: number,
  viewportWidth: number,
  zoom: number,
): number {
  const max = maxScrollX(worldWidth, viewportWidth, zoom);
  if (x < 0) return 0;
  if (x > max) return max;
  return x;
}

/** Default world width, re-exported so callers need one import. */
export { WORLD_WIDTH };
