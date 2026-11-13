/**
 * Combat particle rules, kept free of Phaser (iron rule #7).
 *
 * Hit sparks and death shatters are pure presentation — but their RULES
 * (how many, how fast, how long they live, what colour) are decidable and
 * therefore testable here. The scene spawns Phaser shapes from these specs
 * and lets gravity/velocity play out on screen only; nothing here touches sim.
 *
 * Determinism: particle seeds derive from sim data (unit id, tick), never
 * `Math.random` — a replay shows the same sparks.
 */

import type { UnitTypeId } from '../../data/units';
import { PALETTES } from '../stickman/palette';

/** How long a hit spark lives, in ms. */
export const SPARK_LIFETIME_MS = 280;
/** How long a death shard lives, in ms. */
export const SHARD_LIFETIME_MS = 520;
/** Gravity on shards, px/ms² (positive = downward). */
export const SHARD_GRAVITY = 0.0016;

/** One particle's initial state, produced by the rules below. */
export interface ParticleSpec {
  vx: number; // px/ms
  vy: number;
  lifetimeMs: number;
  color: number;
  /** Particle half-size in px (drawn as a small rect). */
  size: number;
}

/**
 * Hit sparks: a small burst at the contact point, coloured by the VICTIM's
 * palette limb colour (blood/impact in the victim's own hue).
 *
 * `seed` is any integer from sim data (e.g. attacker id + tick): the same
 * seed yields the same burst, so replays look identical.
 */
export function hitSparks(
  victimType: UnitTypeId,
  seed: number,
): ParticleSpec[] {
  const color = PALETTES[victimType].limb;
  const count = 4;
  const out: ParticleSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-random from the seed + index (integer hash mix).
    const r = frac((seed * 0x9e3779b1 + i * 0x85ebca6b) / 4294967296);
    const r2 = frac((seed * 0xc2b2ae35 + i * 0x27d4eb2f) / 4294967296);
    // Fan outward, biased upward (impacts kick debris up).
    const angle = -Math.PI / 2 + (r - 0.5) * Math.PI * 0.9;
    const speed = 0.12 + r2 * 0.18;
    out.push({
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifetimeMs: SPARK_LIFETIME_MS * (0.7 + r * 0.6),
      color,
      size: 1.5 + r2 * 1.5,
    });
  }
  return out;
}

/**
 * Death shatter: the unit breaks into a handful of limb-sized shards that
 * tumble outward and fall. Count scales with body size (a giant makes more
 * debris than a miner).
 */
export function deathShatter(
  victimType: UnitTypeId,
  seed: number,
): ParticleSpec[] {
  const color = PALETTES[victimType].limb;
  const count = victimType === 'giant' ? 10 : 6;
  const out: ParticleSpec[] = [];
  for (let i = 0; i < count; i++) {
    const r = frac((seed * 0x9e3779b1 + i * 0x85ebca6b) / 4294967296);
    const r2 = frac((seed * 0xc2b2ae35 + i * 0x27d4eb2f) / 4294967296);
    const angle = Math.PI + (r - 0.5) * Math.PI; // outward hemisphere
    const speed = 0.06 + r2 * 0.16;
    out.push({
      vx: Math.cos(angle) * speed,
      vy: -Math.abs(Math.sin(angle)) * speed - 0.05,
      lifetimeMs: SHARD_LIFETIME_MS * (0.8 + r * 0.5),
      color,
      size: 2 + r2 * 3,
    });
  }
  return out;
}

/** Fraction part of a number — tiny deterministic hash helper. */
function frac(n: number): number {
  return n - Math.floor(n);
}
