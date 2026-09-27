/**
 * Camera maths, kept free of Phaser so the clamping rules are testable.
 *
 * THE SUBTLETY: a Phaser camera has `originX = 0.5` (verified in
 * BaseCamera.js), so `scrollX` is NOT the left world edge once zoomed.
 * `Camera.preRender` computes
 *
 *     worldView.x = scrollX + W/2 - (W / z) / 2
 *
 * and Phaser's own `clampX` therefore uses the band
 *
 *     [ (W/z - W)/2 , (W/z - W)/2 + worldWidth - W/z ]
 *
 * not `[0, worldWidth - W/z]`. The difference is not cosmetic: at 0.6x a
 * 1280px viewport overhangs the origin by 426.67px, so clamping to
 * `worldWidth - W/z` = 866.67 would stop the camera 426px short of the world's
 * right edge and the enemy base at x=2700 could never be seen — which is
 * exactly the "survey the whole line" use the zoom-out exists for (spec §7.2).
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

/** How far the camera overhangs the world origin at this zoom. */
function originOffset(viewportWidth: number, zoom: number): number {
  const z = zoom > 0 ? zoom : 1;
  return (viewportWidth / z - viewportWidth) / 2;
}

/** The smallest scrollX that still keeps the world covering the viewport. */
export function minScrollX(viewportWidth: number, zoom: number): number {
  return originOffset(viewportWidth, zoom);
}

/** The largest scrollX that still keeps the world covering the viewport. */
export function maxScrollX(worldWidth: number, viewportWidth: number, zoom: number): number {
  const z = zoom > 0 ? zoom : 1;
  const offset = originOffset(viewportWidth, zoom);
  return Math.max(offset, offset + worldWidth - viewportWidth / z);
}

/** Scroll clamped to the zoom-dependent band. */
export function clampScrollX(
  x: number,
  worldWidth: number,
  viewportWidth: number,
  zoom: number,
): number {
  const min = minScrollX(viewportWidth, zoom);
  const max = maxScrollX(worldWidth, viewportWidth, zoom);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/** Default world width, re-exported so callers need one import. */
export { WORLD_WIDTH };
