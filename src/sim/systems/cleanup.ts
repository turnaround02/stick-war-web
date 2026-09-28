/**
 * Step 6 of 6: remove the dead, then resolve the outcome.
 *
 * Runs LAST so that step 5 saw a stable array and a unit marked dead this tick
 * could not strike again (spec §6.1). Death is two-phase: combat marks, cleanup
 * removes (spec §6.6).
 */

import type { TickContext, Unit, World } from '../types';

export function cleanupSystem(ctx: TickContext): void {
  const { world } = ctx;

  removeDead(world);
  removeStaleProjectiles(world);
  resolveOutcome(world);
}

function removeDead(world: World): void {
  const survivors: Unit[] = [];
  for (const unit of world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    survivors.push(unit);
  }

  if (survivors.length === world.units.length) return;

  world.units = survivors;

  // Any surviving unit that was locked onto a removed unit must drop the lock,
  // or targeting would keep resolving against a unit that no longer exists.
  const alive = new Set(survivors.map((u) => u.id));
  for (const unit of survivors) {
    if (unit.target !== null && unit.target.kind === 'unit' && !alive.has(unit.target.id)) {
      unit.target = null;
    }
  }
}

function removeStaleProjectiles(world: World): void {
  if (world.projectiles.length === 0) return;
  world.projectiles = world.projectiles.filter((p) => p.ticksToImpact > 0);
}

/**
 * Two win conditions (spec §6.6):
 *   1. a base falls
 *   2. a side has no units left — this is what lets the base-less harness
 *      matchups reach a verdict instead of running to maxTicks
 *
 * Condition 2 is qualified for the enemy: it only counts as annihilation when
 * no wave is still due (see enemyHasUnitsPending).
 *
 * When both conditions fire on the same tick the player loses: an ambiguous
 * mutual wipe is resolved against the player so the outcome is never
 * undefined.
 */
function resolveOutcome(world: World): void {
  if (world.outcome !== 'ongoing') return;

  const enemyBaseDown = world.bases.enemy.hp <= 0;
  const playerBaseDown = world.bases.player.hp <= 0;

  const playerUnits = world.units.filter((u) => u.side === 'player').length;
  const enemyUnits = world.units.filter((u) => u.side === 'enemy').length;

  const playerWiped = playerUnits === 0;
  // "No units left" is only annihilation if nothing more is on its way. A
  // scripted level's enemy force lives ENTIRELY in its wave table, so at t=0 it
  // legitimately has zero units on the field — treating that as annihilation
  // declared the player the winner on tick 1 and the level was over before the
  // first wave. Endless mode is the same shape but never exhausts its waves,
  // which is exactly right: endless can only be lost, never won by clearing.
  const enemyWiped = enemyUnits === 0 && !enemyHasUnitsPending(world);

  if (playerBaseDown || playerWiped) {
    world.outcome = 'playerLose';
    return;
  }

  if (enemyBaseDown || enemyWiped) {
    world.outcome = 'playerWin';
  }
}

/** Whether the enemy still has units due to arrive (spec §8.4). */
function enemyHasUnitsPending(world: World): boolean {
  if (world.endless) return true;
  return world.waveIndex < world.waves.length;
}
