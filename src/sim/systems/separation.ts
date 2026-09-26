/**
 * The 1D sort-and-separate constraint (spec §6.2).
 *
 * Not a top-level tick step — movementSystem calls it. It runs LAST in the
 * movement step, after positions have been integrated, so that pushing cannot
 * be undone by movement in the same tick.
 *
 * Determinism rules obeyed here:
 *   - the sort comparator is a TOTAL ORDER (ties broken by unit.id), so the
 *     result never depends on Array.prototype.sort's stability
 *   - no floating point accumulation into counters; positions are floats but
 *     the operation order is fixed
 */

import { BASE_RADIUS, SEPARATION_EPSILON, yieldWeight } from '../../data/constants';
import { UNITS } from '../../data/units';
import type { TickContext, Unit } from '../types';

export function separationSystem(ctx: TickContext): void {
  const { world } = ctx;

  // Order matters, and this is the final word on positions.
  //
  // 1. Confine every unit to the corridor between the two bases. This runs
  //    FIRST because it is a hard boundary: anything after it can still push a
  //    unit, but nothing may push a unit behind its own base.
  confineToCorridor(world.units, world.bases.player.x, world.bases.enemy.x, world.worldWidth);

  // 2. Opposing units stop at contact.
  blockEnemies(world.units);

  // 3. Same-side separation runs LAST so it is the operation that decides the
  //    final positions. It cannot reintroduce an ally overlap, which is what
  //    the acceptance criterion actually requires.
  for (const side of ['player', 'enemy'] as const) {
    const allies = world.units.filter((u) => u.side === side);
    if (allies.length === 0) continue;

    // Total order: ties on x are broken by id. Never rely on sort stability.
    allies.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id - b.id));

    separateAllies(allies);
  }

  // 4. Re-clamp in case separation pushed anyone out of bounds.
  clampToWorld(world.units, world.worldWidth);
}

/**
 * Pushes same-side neighbours apart.
 *
 * Two stages, because they do different jobs:
 *
 * 1. A weighted forward + backward sweep. Each pair splits the overlap in
 *    proportion to the two units' yield weights, which is what makes `retreat`
 *    units push through their own line and bases stay put. A single sweep is
 *    not enough here: it resolves chains (A pushes B, B pushes C) that a
 *    one-directional pass would leave overlapped.
 *
 * 2. A monotone left-to-right cursor sweep that moves only the RIGHT element.
 *    Stage 1 alone does not guarantee zero overlap — every sweep re-breaks
 *    pairs the previous one fixed (three units at 100/105/110 come out of it
 *    with a 19.375 gap where 28 is required), and weighted two-sided
 *    displacement converges only geometrically, so no fixed iteration count
 *    reaches validity. The cursor sweep IS valid by construction in one pass,
 *    so it closes any residual violation. It only fires when a violation
 *    remains, so it costs nothing for already-separated units.
 */
function separateAllies(allies: Unit[]): void {
  for (let i = 1; i < allies.length; i++) {
    pushPair(allies[i - 1], allies[i]);
  }
  for (let i = allies.length - 2; i >= 0; i--) {
    pushPair(allies[i], allies[i + 1]);
  }
  resolveResidualOverlap(allies);
}

/**
 * One left-to-right pass that moves only the right-hand unit of each pair.
 * Because each step only ever pushes to the right and never revisits an
 * earlier index, no step can undo a previous one — a single pass is therefore
 * sufficient, and the result has no overlap by construction.
 */
function resolveResidualOverlap(allies: Unit[]): void {
  for (let i = 1; i < allies.length; i++) {
    const left = allies[i - 1];
    const right = allies[i];
    const minGap = UNITS[left.typeId].bodyRadius + UNITS[right.typeId].bodyRadius;
    const gap = right.x - left.x;
    if (gap < minGap) {
      right.x = left.x + minGap;
    }
  }
}

function pushPair(left: Unit, right: Unit): void {
  const minGap = UNITS[left.typeId].bodyRadius + UNITS[right.typeId].bodyRadius;
  const gap = right.x - left.x;
  const overlap = minGap - gap;
  if (overlap <= SEPARATION_EPSILON) return;

  const wl = yieldWeight(left.state, left.stance, false);
  const wr = yieldWeight(right.state, right.stance, false);
  const total = wl + wr;
  if (total <= 0) return; // both immovable: leave as-is

  // Yield proportionally: weight 0 moves nothing, and the two shares sum to 1.
  const leftShare = wl / total;
  const rightShare = wr / total;

  left.x -= overlap * leftShare;
  right.x += overlap * rightShare;
}

/** Opposing units stop at contact instead of passing through each other. */
function blockEnemies(units: Unit[]): void {
  const players = units.filter((u) => u.side === 'player');
  const enemies = units.filter((u) => u.side === 'enemy');
  if (players.length === 0 || enemies.length === 0) return;

  const sortedPlayers = players
    .slice()
    .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id - b.id));
  const sortedEnemies = enemies
    .slice()
    .sort((a, b) => (a.x !== b.x ? a.x - b.x : b.id - a.id));

  for (const p of sortedPlayers) {
    for (const e of sortedEnemies) {
      const minGap = UNITS[p.typeId].bodyRadius + UNITS[e.typeId].bodyRadius;
      const gap = e.x - p.x;
      if (gap >= minGap) continue;

      const overlap = minGap - gap;
      // Split evenly: neither side gets to push the other around just by
      // existing, and contact is symmetric.
      p.x -= overlap / 2;
      e.x += overlap / 2;
    }
  }
}

/** Keeps every unit inside [0, worldWidth]. Pushing can otherwise shove units off-map. */
function clampToWorld(units: Unit[], worldWidth: number): void {
  for (const u of units) {
    if (u.x < 0) u.x = 0;
    else if (u.x > worldWidth) u.x = worldWidth;
  }
}

/**
 * Confines every unit to the corridor between the two bases.
 *
 * This replaced a radial push away from the base centre, which had two faults:
 * it could shove a unit to the FAR side of its own base (behind it, where
 * nothing sensible lives on a single axis), and because it ran after the
 * same-side passes it could re-create an ally overlap as the last operation of
 * the tick.
 *
 * A directional corridor has neither problem: it is idempotent, it only ever
 * pushes a unit TOWARD the battlefield, and it is applied before the separation
 * passes so those remain the final word on spacing.
 */
function confineToCorridor(
  units: Unit[],
  playerBaseX: number,
  enemyBaseX: number,
  worldWidth: number,
): void {
  for (const u of units) {
    const r = UNITS[u.typeId].bodyRadius;
    const min = playerBaseX + BASE_RADIUS + r;
    const max = enemyBaseX - BASE_RADIUS - r;
    if (u.x < min) u.x = min;
    else if (u.x > max) u.x = max;
    if (u.x < 0) u.x = 0;
    else if (u.x > worldWidth) u.x = worldWidth;
  }
}
