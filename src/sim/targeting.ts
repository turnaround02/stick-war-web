/**
 * Target search and locking (spec §6.4).
 *
 * Pure functions over the world — no mutation, so they are trivially testable
 * and safe to call from any system.
 *
 * The lock uses a HYSTERESIS BAND: acquire at 500px, drop at 700px. With a
 * single threshold a unit sitting at the boundary would re-acquire and drop
 * every tick, flickering between targets and never committing to a fight.
 */

import { LOCK_BREAK_RANGE, TARGET_ACQUIRE_RANGE, TARGET_TOLERANCE } from '../data/constants';
import type { Side, TargetRef, Unit, World } from './types';

/** A unit's forward direction: players face right, enemies face left. */
function forward(side: Side): number {
  return side === 'player' ? 1 : -1;
}

/** The X of a target, or null if it no longer exists. */
export function targetX(world: World, target: TargetRef): number | null {
  if (target === null) return null;
  if (target.kind === 'base') return world.bases[target.side].x;
  const unit = world.units.find((u) => u.id === target.id);
  return unit ? unit.x : null;
}

export function isTargetAlive(world: World, target: TargetRef): boolean {
  if (target === null) return false;
  if (target.kind === 'base') return world.bases[target.side].hp > 0;
  const unit = world.units.find((u) => u.id === target.id);
  return unit !== undefined && unit.state !== 'dead' && unit.hp > 0;
}

/** Distance from a unit to its locked target, or Infinity when it has none. */
export function distanceToTarget(world: World, unit: Unit): number {
  const x = targetX(world, unit.target);
  return x === null ? Infinity : Math.abs(x - unit.x);
}

/**
 * Whether the current lock survives this tick. False means the unit should
 * return to idle and search again.
 */
export function shouldKeepTarget(world: World, unit: Unit): boolean {
  if (unit.target === null) return false;
  if (!isTargetAlive(world, unit.target)) return false;
  return distanceToTarget(world, unit) <= LOCK_BREAK_RANGE;
}

/**
 * Picks a new target: the nearest enemy unit within TARGET_ACQUIRE_RANGE,
 * preferring anything ahead of the unit. Falls back to the enemy base when it
 * is in range. Returns null when nothing qualifies.
 */
export function acquireTarget(world: World, unit: Unit): TargetRef {
  const dir = forward(unit.side);
  let best: Unit | null = null;
  let bestScore = Infinity;

  for (const other of world.units) {
    if (other.side === unit.side) continue;
    if (other.state === 'dead' || other.hp <= 0) continue;

    const delta = (other.x - unit.x) * dir;
    // Ahead of us, with a small tolerance so units on the same X still engage.
    if (delta < -TARGET_TOLERANCE) continue;

    const dist = Math.abs(other.x - unit.x);
    if (dist > TARGET_ACQUIRE_RANGE) continue;

    // Prefer ahead over behind, then nearest. Ties broken by id for determinism.
    const score = (delta < 0 ? TARGET_ACQUIRE_RANGE : 0) + dist;
    if (score < bestScore || (score === bestScore && best !== null && other.id < best.id)) {
      best = other;
      bestScore = score;
    }
  }

  if (best !== null) return { kind: 'unit', id: best.id };

  const enemyBase: Side = unit.side === 'player' ? 'enemy' : 'player';
  const base = world.bases[enemyBase];
  if (base.hp > 0 && Math.abs(base.x - unit.x) <= TARGET_ACQUIRE_RANGE) {
    return { kind: 'base', side: enemyBase };
  }

  return null;
}
