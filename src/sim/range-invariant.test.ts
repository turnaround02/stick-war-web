/**
 * Structural invariant: every melee attacker must be able to reach every
 * target it can physically contact.
 *
 * The separation system enforces a minimum centre-to-centre gap of
 * `bodyRadius_A + bodyRadius_B` between opposing units. The combat system
 * compares `distanceToTarget` (centre-to-centre for units) against
 * `attackRange`. If `attackRange < bodyRadius_A + bodyRadius_B`, the
 * attacker can NEVER deal damage to that target — the range check fails on
 * every tick, regardless of windup or cooldown.
 *
 * This test catches that class of bug at the data-table level, before it
 * ships. The one known exception is documented below.
 */
import { describe, it, expect } from 'vitest';
import { UNITS, type UnitTypeId } from '../data/units';

/** Melee types only: ranged units (archer, mage) have large ranges and are exempt. */
const MELEE: UnitTypeId[] = ['swordsman', 'spearman', 'giant'];

/**
 * Known design exceptions: pairs where `attackRange < minGap` is
 * intentional, not a bug. Each entry must carry a justification.
 */
const KNOWN_EXCEPTIONS: Array<{
  attacker: UnitTypeId;
  target: UnitTypeId;
  reason: string;
}> = [
  {
    attacker: 'swordsman',
    target: 'giant',
    reason:
      'Swordsman range 30 < minGap 36 (r14+r22). By design: the spearman ' +
      '(range 45 > 35) is the giant counter. A swordsmen-only line cannot ' +
      'grind a giant — that is the intended role split.',
  },
];

function isException(a: UnitTypeId, t: UnitTypeId): boolean {
  return KNOWN_EXCEPTIONS.some((e) => e.attacker === a && e.target === t);
}

describe('melee attackRange ≥ bodyRadius sum (invariant)', () => {
  it('every melee attacker can reach every target it physically contacts', () => {
    const violations: string[] = [];

    for (const attacker of MELEE) {
      const aDef = UNITS[attacker];
      for (const target of Object.keys(UNITS) as UnitTypeId[]) {
        const tDef = UNITS[target];
        const minGap = aDef.bodyRadius + tDef.bodyRadius;

        // Miners have no attack; they are never the "attacker" side.
        // But they ARE a valid target (a giant can hit a miner).
        if (aDef.attackType === 'none') continue;

        // Ranged attackers are exempt (their range is 150-200, well above any gap).
        if (aDef.attackType === 'ranged') continue;

        if (aDef.attackRange < minGap && !isException(attacker, target)) {
          violations.push(
            `${attacker} (range ${aDef.attackRange}) cannot reach ${target} ` +
              `(minGap ${minGap} = r${aDef.bodyRadius}+r${tDef.bodyRadius})`,
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('documents every known exception with a reason', () => {
    for (const exc of KNOWN_EXCEPTIONS) {
      const aDef = UNITS[exc.attacker];
      const tDef = UNITS[exc.target];
      const minGap = aDef.bodyRadius + tDef.bodyRadius;

      // The exception is only valid if it actually violates the invariant.
      expect(
        aDef.attackRange,
        `Exception ${exc.attacker}→${exc.target} is no longer needed ` +
          `(range ${aDef.attackRange} ≥ minGap ${minGap}); remove it`,
      ).toBeLessThan(minGap);

      // Every exception must carry a non-trivial reason.
      expect(exc.reason.length, `Exception ${exc.attacker}→${exc.target} has no reason`).toBeGreaterThan(20);
    }
  });
});
