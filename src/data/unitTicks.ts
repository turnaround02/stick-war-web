/**
 * The ONE place where data-table seconds become integer ticks (spec §5.1).
 *
 * Computed once at module load. Systems import this table directly instead of
 * converting per-tick, and the values are NOT stored on World (that would add
 * serialisation weight) nor on each Unit (that would be per-unit redundancy).
 *
 * Why not convert inside createWorld: createWorld builds a World, but
 * attackCooldown / windupTime are read by combatSystem, which has no access to
 * the unit definition table. A derived table is the only place both can reach.
 */

import { TICKS_PER_SEC, toTicks } from './constants';
import { UNITS, type UnitTypeId } from './units';

export interface UnitTickStats {
  /** Ticks between the start of an attack and the strike landing. */
  windup: number;
  /** Ticks of cooldown after a strike. */
  attackCooldown: number;
  /** Ticks to train this unit. */
  trainTime: number;
  /** Ticks spent mining per trip (miners only; 0 otherwise). */
  gatherTime: number;
  /** Movement per tick in px. Kept as a float — position is not tick-quantised. */
  speedPerTick: number;
  /** Projectile travel per tick in px. 0 for non-ranged units. */
  projectilePerTick: number;
  /** Stun ticks applied on hit. 0 = no stun. */
  stunOnHit: number;
}

function derive(id: UnitTypeId): UnitTickStats {
  const def = UNITS[id];
  return {
    windup: toTicks(def.windupTime),
    attackCooldown: toTicks(def.attackCooldown),
    trainTime: toTicks(def.trainTime),
    gatherTime: toTicks(def.gatherTime),
    // Division, not rounding: positions stay floating point. Determinism holds
    // as long as the operation order is fixed, which it is.
    speedPerTick: def.moveSpeed / TICKS_PER_SEC,
    projectilePerTick: def.projectileSpeed / TICKS_PER_SEC,
    stunOnHit: def.stunOnHitTicks ?? 0,
  };
}

export const UNIT_TICKS: Record<UnitTypeId, UnitTickStats> = {
  miner: derive('miner'),
  swordsman: derive('swordsman'),
  archer: derive('archer'),
  spearman: derive('spearman'),
  giant: derive('giant'),
  mage: derive('mage'),
};
