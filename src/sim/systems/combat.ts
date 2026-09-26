/**
 * Step 5 of 6: wind-up progression, damage resolution, death marking.
 *
 * MUST run after movement (so range checks use this tick's positions) and
 * before cleanup (so a unit marked dead here does not strike again next tick,
 * and cleanup sees a stable array).
 *
 * Three windup rules (spec §6.3), all of which exist to make "retreat out of a
 * swing" a real tactic:
 *   1. a started windup always completes — it is never cancelled or restarted
 *   2. at release the range is re-checked; out of range means a MISS
 *   3. at release the target is never re-chosen; a vanished target means a MISS
 */

import { BASE_ARMOR, BASE_ARMOR_TYPE } from '../../data/constants';
import { UNITS, type ArmorType } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { computeDamage } from '../damage';
import { distanceToTarget, isTargetAlive, targetX } from '../targeting';
import type { Side, TargetRef, TickContext, Unit, World } from '../types';

export function combatSystem(ctx: TickContext): void {
  const { world } = ctx;

  advanceProjectiles(world);

  for (const unit of world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    if (unit.cooldownTicksLeft > 0) {
      unit.cooldownTicksLeft -= 1;
    }

    if (unit.windupTicksLeft <= 0) continue;

    unit.windupTicksLeft -= 1;
    if (unit.windupTicksLeft > 0) continue;

    releaseStrike(world, unit);
  }
}

/** Moves projectiles and resolves impacts. A vanished target drops the shot. */
function advanceProjectiles(world: World): void {
  const surviving: typeof world.projectiles = [];

  for (const p of world.projectiles) {
    const ref: TargetRef = { kind: 'unit', id: p.targetId };
    if (!isTargetAlive(world, ref)) continue;

    const targetPos = targetX(world, ref);
    if (targetPos === null) continue;

    p.ticksToImpact -= 1;
    p.prevX = p.x;

    if (p.ticksToImpact > 0) {
      // Fly toward the target's CURRENT position so a moving target is still
      // hit; the impact TICK is fixed at launch, only the visual path tracks.
      p.x += (targetPos - p.x) / (p.ticksToImpact + 1);
      surviving.push(p);
      continue;
    }

    p.x = targetPos;
    applyDamage(world, p.side, ref, p.damage);
  }

  world.projectiles = surviving;
}

/** Resolves the strike at the end of a windup. */
function releaseStrike(world: World, unit: Unit): void {
  const def = UNITS[unit.typeId];
  if (def.attackType === 'none') return;

  const ticks = UNIT_TICKS[unit.typeId];

  // Never damage your own side. targeting already avoids allies, but the
  // invariant belongs here, where damage is applied: a future friendly-fire
  // feature or a targeting bug would otherwise silently kill your own line
  // and read as a balance problem rather than a defect.
  if (isAllyTarget(world, unit)) {
    unit.cooldownTicksLeft = ticks.attackCooldown;
    return;
  }

  // Rules 2 + 3: re-check range against the ORIGINAL target; never re-choose.
  if (!isTargetAlive(world, unit.target)) {
    unit.cooldownTicksLeft = ticks.attackCooldown;
    return;
  }

  const distance = distanceToTarget(world, unit);
  if (distance > def.attackRange) {
    // Missed: the target walked out of reach. Still consumes the cooldown.
    unit.cooldownTicksLeft = ticks.attackCooldown;
    return;
  }

  const armor = armorOf(world, unit.target);
  const damage = computeDamage(def.attack, def.bonusVs, armor.value, armor.type);

  if (def.attackType === 'melee') {
    applyDamage(world, unit.side, unit.target, damage);
  } else {
    spawnProjectile(world, unit, distance, damage);
  }

  unit.cooldownTicksLeft = ticks.attackCooldown;
}

function spawnProjectile(world: World, unit: Unit, distance: number, damage: number): void {
  const target = unit.target;
  if (target === null || target.kind !== 'unit') return;

  const speed = UNIT_TICKS[unit.typeId].projectilePerTick;
  // Never zero: a same-position shot must still take a tick, or the projectile
  // would resolve in the same tick it was created and break ordering.
  const ticksToImpact = speed > 0 ? Math.max(1, Math.round(distance / speed)) : 1;

  world.projectiles.push({
    id: world.nextProjectileId++,
    side: unit.side,
    x: unit.x,
    prevX: unit.x,
    targetId: target.id,
    damage,
    ticksToImpact,
  });
}

/** Applies damage to a unit or a base and records it in the side's stats. */
function applyDamage(world: World, attacker: Side, target: TargetRef, amount: number): void {
  if (target === null) return;

  if (target.kind === 'base') {
    const base = world.bases[target.side];
    const applied = Math.min(amount, base.hp);
    base.hp -= applied;
    world.stats[attacker].damageDealt += applied;
    return;
  }

  const victim = world.units.find((u) => u.id === target.id);
  if (!victim || victim.state === 'dead') return;

  const applied = Math.min(amount, victim.hp);
  victim.hp -= applied;
  world.stats[attacker].damageDealt += applied;

  // Mark only — removal belongs to cleanup (two-phase death, spec §6.6).
  if (victim.hp <= 0) {
    victim.state = 'dead';
    victim.target = null;
    victim.windupTicksLeft = 0;
  }
}

function armorOf(world: World, target: TargetRef): { value: number; type: ArmorType } {
  if (target !== null && target.kind === 'base') {
    return { value: BASE_ARMOR, type: BASE_ARMOR_TYPE };
  }
  if (target !== null && target.kind === 'unit') {
    const victim = world.units.find((u) => u.id === target.id);
    if (victim) {
      const def = UNITS[victim.typeId];
      return { value: def.armor, type: def.armorType };
    }
  }
  return { value: 0, type: 'light' };
}

/** True when the unit's locked target belongs to the same side (or is its own base). */
function isAllyTarget(world: World, unit: Unit): boolean {
  const target = unit.target;
  if (target === null) return false;
  if (target.kind === 'base') return target.side === unit.side;
  const other = world.units.find((u) => u.id === target.id);
  return other !== undefined && other.side === unit.side;
}
