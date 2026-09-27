/**
 * Unit stat table (spec §8.1).
 *
 * Written as a TS constant rather than JSON so that typos in field names are
 * compile errors instead of runtime surprises, and so `bonusVs` stays readable.
 *
 * Durations are in SECONDS; createWorld converts them to integer ticks once.
 * All values here are INITIAL — M2's balance harness is expected to change them.
 *
 * This file imports NOTHING from sim/. Dependency is one-way: sim -> data.
 */

export type UnitTypeId = 'miner' | 'swordsman' | 'archer' | 'spearman';

export type ArmorType = 'light' | 'heavy';

export type AttackType = 'melee' | 'ranged' | 'none';

export interface UnitDef {
  id: UnitTypeId;
  /** i18n key. Never store a display name here (spec §7.5). */
  nameKey: string;
  maxHp: number;
  armor: number;
  armorType: ArmorType;
  /** Collision half-width used by the 1D separation constraint (spec §6.2). */
  bodyRadius: number;
  /** px per second. */
  moveSpeed: number;
  attack: number;
  attackType: AttackType;
  /** px. */
  attackRange: number;
  /** seconds. */
  attackCooldown: number;
  /** seconds. Blade-contact moment — damage lands and sfx fires here. */
  windupTime: number;
  /** px per second. Ranged only. */
  projectileSpeed: number;
  /** Damage multiplier keyed by the TARGET's armor type. Applied before armor (spec §6.5). */
  bonusVs: Partial<Record<ArmorType, number>>;
  goldCost: number;
  popCost: number;
  /** seconds. */
  trainTime: number;
  /** Gold carried per trip. Miners only. */
  carryCapacity: number;
  /** seconds spent mining. Miners only. */
  gatherTime: number;
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  miner: {
    id: 'miner',
    nameKey: 'unit.miner',
    maxHp: 60,
    armor: 0,
    armorType: 'light',
    bodyRadius: 10,
    moveSpeed: 70,
    attack: 0,
    attackType: 'none',
    attackRange: 0,
    attackCooldown: 0,
    windupTime: 0,
    projectileSpeed: 0,
    bonusVs: {},
    goldCost: 50,
    popCost: 1,
    trainTime: 5,
    carryCapacity: 20,
    gatherTime: 3.0,
  },
  swordsman: {
    id: 'swordsman',
    nameKey: 'unit.swordsman',
    maxHp: 150,
    armor: 5,
    armorType: 'heavy',
    bodyRadius: 14,
    moveSpeed: 95,
    attack: 25,
    attackType: 'melee',
    attackRange: 30,
    attackCooldown: 1.0,
    windupTime: 0.25,
    projectileSpeed: 0,
    bonusVs: { light: 1.5 },
    goldCost: 100,
    popCost: 1,
    trainTime: 8,
    carryCapacity: 0,
    gatherTime: 0,
  },
  archer: {
    id: 'archer',
    nameKey: 'unit.archer',
    // 70, not the original 80. An archer survives 3 swordsman hits at 80 and
    // only 2 at 70, which is what stops an UNSCREENED archer line from
    // out-trading a swordsman line. Deliberately not 65 or 45: those land
    // exactly on damage breakpoints (ceil(65/32.5) and ceil(45/24)), so the
    // outcome would hinge on one hit either way and drift under any other
    // change. 70 is the value that is not a breakpoint.
    maxHp: 70,
    armor: 0,
    armorType: 'light',
    bodyRadius: 11,
    moveSpeed: 75,
    attack: 18,
    attackType: 'ranged',
    attackRange: 200,
    attackCooldown: 1.2,
    windupTime: 0.3,
    projectileSpeed: 400,
    bonusVs: {},
    goldCost: 80,
    popCost: 1,
    trainTime: 7,
    carryCapacity: 0,
    gatherTime: 0,
  },
  spearman: {
    id: 'spearman',
    nameKey: 'unit.spearman',
    maxHp: 140,
    armor: 4,
    armorType: 'heavy',
    bodyRadius: 13,
    moveSpeed: 85,
    attack: 24,
    attackType: 'melee',
    attackRange: 45,
    attackCooldown: 1.2,
    windupTime: 0.3,
    projectileSpeed: 0,
    // light x1.5 was missing and its absence was the only thing in the game
    // that contradicted §6.5's "archers lose 1v1 to ANY melee": with no bonus
    // at all, ten spearmen lost to ten archers. 1.5 is the MEASURED minimum
    // that fixes it — 1.4 and 1.45 still let ten archers beat nine spearmen.
    //
    // Equal to the swordsman's light x1.5, which looks like it blurs the two
    // roles but does not: the swordsman still has clearly better anti-light
    // DPS (25*1.5 = 37.5 on a 1.0s cooldown = 37.5/s, vs 24*1.5 = 36 on 1.2s
    // = 30/s), so "swordsman is the light-armour answer" stays true.
    bonusVs: { heavy: 1.6, light: 1.5 },
    goldCost: 90,
    popCost: 1,
    trainTime: 7,
    carryCapacity: 0,
    gatherTime: 0,
  },
};

/** Spawn offset from the base, in px. Keeps units from stacking on the base. */
export const SPAWN_OFFSET = 60;
