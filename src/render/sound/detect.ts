/**
 * Pure SFX event detection for the render layer (spec §7.4, M5c).
 *
 * `diffSfx(prev, cur)` inspects two snapshots taken on consecutive ticks of
 * the simulation and returns the events that happened in between. It is pure
 * — same inputs, same output — so it is unit-testable in node, following
 * the same pattern as `render/frontline/layout.ts` or `render/clickGuard.ts`.
 *
 * The detector reads ONLY the fields `snapshotWorld` records (spec §3.1: the
 * renderer reads sim state, never writes it). No `World` field is added,
 * so the determinism guards are untouched.
 */

import { UNITS } from '../../data/units';
import type { Side, Unit, UnitTypeId, World } from '../../sim/types';

export type SfxKind = 'swing' | 'hit' | 'death' | 'gold' | 'training' | 'base';

export interface SfxEvent {
  kind: SfxKind;
  side: Side;
}

/**
 * The render-side view of a `World`. Deliberately a subset: the detector
 * reads only these fields, and a test fixture can build one directly
 * without constructing a full sim `World` (mirrors `frontline/layout.ts`).
 */
export interface SfxUnitSnapshot {
  id: number;
  side: Side;
  typeId: UnitTypeId;
  state: Unit['state'];
  windupTicksLeft: number;
}

export interface SfxProjectileSnapshot {
  id: number;
  /** The shooter's side; used to attribute the impact sound. */
  side: Side;
  ticksToImpact: number;
}

export interface SfxSnapshot {
  units: SfxUnitSnapshot[];
  /** Global next-unit serial. Advances when a unit is trained (unused for
   *  side attribution but kept so `nextUnitId` monotonicity is assertable). */
  nextUnitId: number;
  /** Gold held by each side. A credit plays on an increase. */
  gold: Record<Side, number>;
  /** Base HP per side. A base-damage sound plays on a decrease. */
  baseHp: Record<Side, number>;
  /** Projectiles in flight, with shooter side and time-to-impact. */
  projectiles: SfxProjectileSnapshot[];
  /** Per-side spawn queue length. A training sound plays on an emptying. */
  trainingQueueLen: Record<Side, number>;
}

const SIDES: readonly Side[] = ['player', 'enemy'];

/**
 * Builds a snapshot from a sim `World` after a tick. Shallow view of the
 * fields `diffSfx` reads — NOT a deep copy of `World`, because `advanceWorld`
 * mutates `World` in place and the renderer must capture state BEFORE the
 * next tick. Pure with respect to its input.
 */
export function snapshotWorld(world: World): SfxSnapshot {
  return {
    units: world.units.map((u) => ({
      id: u.id,
      side: u.side,
      typeId: u.typeId,
      state: u.state,
      windupTicksLeft: u.windupTicksLeft,
    })),
    nextUnitId: world.nextUnitId,
    gold: { player: world.gold.player, enemy: world.gold.enemy },
    baseHp: { player: world.bases.player.hp, enemy: world.bases.enemy.hp },
    projectiles: world.projectiles.map((p) => ({
      id: p.id,
      side: p.side,
      ticksToImpact: p.ticksToImpact,
    })),
    trainingQueueLen: {
      player: world.trainingQueue.player.length,
      enemy: world.trainingQueue.enemy.length,
    },
  };
}

/** Q10: the per-tick event cap (applied after priority truncation). */
export const SFX_PER_TICK_CAP = 8;

/** Q10: truncation priority. Higher in the list beats lower. */
const PRIORITY: readonly SfxKind[] = ['hit', 'swing', 'death', 'base', 'training', 'gold'];

function priorityIndexOf(kind: SfxKind): number {
  const i = PRIORITY.indexOf(kind);
  return i === -1 ? PRIORITY.length : i;
}

/**
 * Detect the SFX events between two consecutive snapshots.
 *
 * `prev` is the state at the END of the previous tick; `cur` is the state at
 * the END of the current tick. The two are always distinct objects because
 * the renderer snapshots before each `advanceWorld` call and the simulation
 * mutates in place between calls.
 *
 * Events and their tick semantics:
 * - `swing` / melee `hit`: the tick a unit's `windupTicksLeft` just hit 0
 *   (the release frame). Both fire on the same tick for a melee strike
 *   (Q7: "同 tick 可共存") because the blade-contact frame IS the damage
 *   frame for a melee unit.
 * - ranged `hit`: the tick a projectile's `ticksToImpact` just hit 0 (impact
 *   frame). The shooter-side `swing` already fired on the release frame.
 * - `death`: a unit's `state` just transitioned to `'dead'` this tick.
 * - `gold`: a side's gold increased this tick (Q8: initial gold in a World
 *   has no prev, so it can never fire — diffing is immune to it).
 * - `training`: a side's spawn queue just emptied this tick (a unit
 *   appeared; Q8's "nextUnitId advanced" is the equivalent global signal,
 *   we use per-side queue length so we know WHICH side trained).
 * - `base`: a side's base HP just dropped this tick (Q9).
 *
 * The returned list is stable-truncated to `SFX_PER_TICK_CAP` in `PRIORITY`
 * order (Q2 + Q10); a cap-exceeding set drops the lowest-priority events
 * first, and ties keep their original order.
 */
export function diffSfx(prev: SfxSnapshot, cur: SfxSnapshot): SfxEvent[] {
  const events: SfxEvent[] = [];

  const prevUnitById = new Map<number, SfxUnitSnapshot>();
  for (const u of prev.units) prevUnitById.set(u.id, u);

  // 1. swing + (melee) hit: windup just released.
  for (const u of cur.units) {
    const def = UNITS[u.typeId];
    if (def.attackType === 'none') continue;

    const pv = prevUnitById.get(u.id);
    const justReleased = pv !== undefined && pv.windupTicksLeft > 0 && u.windupTicksLeft === 0;
    if (!justReleased) continue;

    events.push({ kind: 'swing', side: u.side });
    // Melee: the release frame IS the hit. Ranged: the arrow is still in
    // flight; its impact is a separate `hit`, fired on the landing tick.
    if (def.attackType === 'melee') {
      events.push({ kind: 'hit', side: u.side });
    }
  }

  // 2. ranged impact: projectile that was in flight last tick and landed
  //    this tick (`ticksToImpact` just reached 0).
  const prevProjectileIds = new Set(prev.projectiles.map((p) => p.id));
  for (const p of cur.projectiles) {
    if (!prevProjectileIds.has(p.id)) continue; // spawned this tick; not in flight.
    if (p.ticksToImpact === 0) {
      events.push({ kind: 'hit', side: p.side });
    }
  }

  // 3. death: newly marked dead.
  for (const u of cur.units) {
    if (u.state !== 'dead') continue;
    const pv = prevUnitById.get(u.id);
    if (pv === undefined || pv.state !== 'dead') {
      events.push({ kind: 'death', side: u.side });
    }
  }

  // 4. gold credit: side's gold increased.
  for (const side of SIDES) {
    if (cur.gold[side] > prev.gold[side]) {
      events.push({ kind: 'gold', side });
    }
  }

  // 5. training: a side's spawn queue shrank this tick (a unit appeared).
  //    `nextUnitId` advances monotonically as a global signal; the per-side
  //    queue length is the equivalent that also tells us WHICH side.
  for (const side of SIDES) {
    if (cur.trainingQueueLen[side] < prev.trainingQueueLen[side]) {
      events.push({ kind: 'training', side });
    }
  }

  // 6. base damage: a side's base HP dropped.
  for (const side of SIDES) {
    if (cur.baseHp[side] < prev.baseHp[side]) {
      events.push({ kind: 'base', side });
    }
  }

  return truncateByPriority(events, SFX_PER_TICK_CAP);
}

/**
 * Keep the highest-priority events up to `cap`. Stable sort: events with
 * equal priority keep their original relative order, so the "give 12,
 * assert which 8 survive" test is deterministic.
 */
function truncateByPriority(events: SfxEvent[], cap: number): SfxEvent[] {
  if (events.length <= cap) return events;
  const sorted = [...events].sort((a, b) => priorityIndexOf(a.kind) - priorityIndexOf(b.kind));
  return sorted.slice(0, cap);
}
