/**
 * Stun-marker geometry, kept free of Phaser (iron rule #7).
 *
 * A mage-stunned unit stands frozen for `stunTicksLeft` ticks with no visual
 * cue (M6.4 Q5=A deferred it). This module decides whether/where to draw the
 * ring; the scene only turns the answers into strokes.
 *
 * The ring is a pulse: its radius breathes over the remaining stun duration so
 * the player can TELL how fresh the stun is without reading numbers.
 */

/** Ring colour (0xRRGGBB) — a sickly yellow-green, distinct from the white selection ring. */
export const STUN_RING_COLOR = 0xb8c832;

/** Ring geometry, in world px. */
export const STUN_RING = { rx: 30, ry: 9, y: -1 } as const;

/** Stun duration in ticks (matches the mage's `stunOnHitTicks`). */
export const STUN_TOTAL_TICKS = 30;

export interface StunRing {
  /** False when the unit is not stunned — nothing to draw. */
  visible: boolean;
  /** World x (interpolated by the caller). */
  x: number;
  /** Screen y of the ring's centre. */
  y: number;
  /** 0..1 — how much of the stun remains (1 = just hit, 0 = about to free). */
  fraction: number;
  /** Radius multiplier from the pulse: 1 at the extremes, dips mid-ring. */
  pulse: number;
}

/**
 * The ring for one unit, or `visible: false`.
 *
 * The pulse reads the unit's OWN remaining ticks (not wall time), so it is
 * deterministic under any game speed — same property as every other
 * render-from-sim read.
 */
export function stunRingFor(
  unit: { stunTicksLeft: number },
  x: number,
  groundY: number,
): StunRing {
  if (unit.stunTicksLeft <= 0) {
    return { visible: false, x: 0, y: 0, fraction: 0, pulse: 1 };
  }
  const fraction = Math.min(1, unit.stunTicksLeft / STUN_TOTAL_TICKS);
  // One breath per quarter of the stun: `sin` over remaining ticks gives a
  // pulse that reverses direction as the stun expires — good enough to read
  // as "alive", and cheap.
  const pulse = 1 + 0.15 * Math.sin(unit.stunTicksLeft * (Math.PI / 8));
  return { visible: true, x, y: groundY + STUN_RING.y, fraction, pulse };
}
