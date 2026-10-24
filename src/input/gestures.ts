/**
 * Touch/drag camera-gesture state, kept free of Phaser (iron rule #7).
 *
 * "Is the pointer dragging", "how far did it move this frame", "what zoom does
 * this pinch distance imply" are all decidable arithmetic — the same class of
 * geometry that lives in `camera.ts` and `clickGuard.ts`. The scene only feeds
 * pointer events in and applies the results to `cam.scrollX` / `setZoom`.
 *
 * Desktop keyboard/wheel/edge-scroll are untouched (M9 Q2): pointer events fire
 * for mouse too, so a mouse drag pans as a side effect, and the wheel handler
 * stays the zoom path there.
 *
 * IMPORTANT interplay with unit selection: a drag must not end by deselecting
 * the unit the finger pressed on. The scene therefore asks `movedBeyondTap`
 * before running `handleClick`, and this module tracks that threshold.
 */

/** Movement in px beyond which a press counts as a drag, not a tap/click. */
export const TAP_SLOP_PX = 12;

/**
 * Pinch zoom: the two-finger distance change that maps 1:1 onto a zoom delta
 * of the same magnitude. A 200px spread increase at zoom 1.0 asks for ~2.0x,
 * which `clampZoom` then caps at 1.2 — a natural "pinch out to zoom in".
 */
export const PINCH_ZOOM_RATE = 0.005;

/**
 * Accumulates one pointer's drag motion.
 *
 * Lifecycle: `press` on pointerdown → `drag` on pointermove → `release` on
 * pointerup/cancel. A press that never exceeds TAP_SLOP_PX never becomes a
 * drag, which is what lets a tap stay a tap (select/deselect, press buttons).
 */
export class PanTracker {
  private startX = 0;
  private lastX = 0;
  private pressed = false;
  private dragging = false;

  press(x: number): void {
    this.startX = x;
    this.lastX = x;
    this.pressed = true;
    this.dragging = false;
  }

  /** Moves the tracker; returns the scroll delta the camera should apply. */
  drag(x: number): number {
    if (!this.pressed) return 0;
    const total = x - this.startX;
    if (!this.dragging) {
      // Still within the tap slop: do not start a drag NOR consume the motion.
      if (Math.abs(total) < TAP_SLOP_PX) return 0;
      this.dragging = true;
    }
    const delta = x - this.lastX;
    this.lastX = x;
    return delta;
  }

  /** True while an actual drag (past the tap slop) is in progress. */
  get active(): boolean {
    return this.pressed && this.dragging;
  }

  /** Whether THIS pointer session moved far enough to count as a drag. */
  movedBeyondTap(): boolean {
    return this.dragging;
  }

  release(): void {
    this.pressed = false;
    this.dragging = false;
  }
}

/**
 * Two-finger pinch-to-zoom state.
 *
 * Each move reports the current two-finger distance and the tracker returns
 * the zoom delta since the last move. One finger again → `release` (the
 * remaining finger becomes a pan).
 */
export class PinchTracker {
  private lastDistance = 0;
  private activePinch = false;

  /** Begins a pinch with the current two-finger distance. */
  start(distance: number): void {
    this.lastDistance = distance;
    this.activePinch = distance > 0;
  }

  /** Advances the pinch; returns the zoom delta since the last move. */
  move(distance: number): number {
    if (!this.activePinch || distance <= 0) return 0;
    const delta = (distance - this.lastDistance) * PINCH_ZOOM_RATE;
    this.lastDistance = distance;
    return delta;
  }

  get active(): boolean {
    return this.activePinch;
  }

  release(): void {
    this.activePinch = false;
  }
}
