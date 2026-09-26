/**
 * Damage and armour resolution (spec §6.5).
 *
 *   mult = bonusVs[targetArmorType] ?? 1
 *   raw  = attack * mult
 *   dmg  = max(raw - targetArmor, raw * 0.1)
 *
 * The bonus multiplies BEFORE armour, which is what keeps the two knobs
 * orthogonal: armour answers "how tough is this thing", the bonus answers
 * "is this weapon good against that kind of thing". Tuning one does not
 * disturb the other.
 *
 * The 10% floor prevents a hard counter from being a total wall — without it,
 * a sufficiently armoured unit becomes literally invulnerable to weak attacks
 * and the game deadlocks.
 */

import type { ArmorType } from '../data/units';

/** Fraction of the raw damage that always gets through. */
const MIN_DAMAGE_FRACTION = 0.1;

export function computeDamage(
  attack: number,
  bonusVs: Partial<Record<ArmorType, number>>,
  targetArmor: number,
  targetArmorType: ArmorType,
): number {
  if (attack <= 0) return 0;

  const mult = bonusVs[targetArmorType] ?? 1;
  const raw = attack * mult;
  return Math.max(raw - targetArmor, raw * MIN_DAMAGE_FRACTION);
}
