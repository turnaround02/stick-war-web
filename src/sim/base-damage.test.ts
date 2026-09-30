import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import type { UnitTypeId } from '../data/units';
import type { MatchConfig } from './types';

/**
 * Ranged units must be able to damage a base.
 *
 * They could not: `spawnProjectile` handled only `target.kind === 'unit'` and
 * returned silently for a base, so ten archers could ring a base forever with
 * zero effect and no error. Melee worked, which is exactly why it went
 * unnoticed — the bug was in one branch of a two-branch dispatch.
 *
 * This matters from M4b on, because level 2 is won by destroying the base.
 */
function siege(units: UnitTypeId[], over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'siege-probe',
    startMiners: { player: 0, enemy: 0 },
    initialUnits: { player: units, enemy: [] },
    initialStance: 'advance',
    enemyAi: 'scripted',
    waves: [],
    ...over,
  };
}

const many = (typeId: UnitTypeId, n: number) => Array<UnitTypeId>(n).fill(typeId);

describe('ranged units vs a base', () => {
  it('archers reduce base HP', () => {
    const world = createWorld(siege(many('archer', 3)), 1);
    const before = world.bases.enemy.hp;
    for (let i = 0; i < 3000; i++) step(world, []);
    expect(world.bases.enemy.hp, 'archers must damage the base').toBeLessThan(before);
  });

  it('a projectile at a base carries a base target, not a unit id', () => {
    const world = createWorld(siege(many('archer', 1)), 1);
    let sawBaseProjectile = false;
    for (let i = 0; i < 3000 && !sawBaseProjectile; i++) {
      step(world, []);
      sawBaseProjectile = world.projectiles.some((p) => p.target?.kind === 'base');
    }
    expect(sawBaseProjectile, 'expected an arrow aimed at the base').toBe(true);
  });

  it('a shot whose target base is already destroyed is dropped, not a crash', () => {
    const world = createWorld(siege(many('archer', 4)), 1);
    for (let i = 0; i < 900; i++) step(world, []);
    world.bases.enemy.hp = 0;
    expect(() => step(world, [])).not.toThrow();
    expect(world.projectiles.every((p) => p.target !== null)).toBe(true);
  });

  it('melee still damages the base (no regression)', () => {
    const world = createWorld(siege(many('swordsman', 3)), 1);
    const before = world.bases.enemy.hp;
    for (let i = 0; i < 3000; i++) step(world, []);
    expect(world.bases.enemy.hp).toBeLessThan(before);
  });

  it('archers still damage UNITS (no regression)', () => {
    const world = createWorld(
      {
        ...DEFAULT_MATCH,
        levelId: 'unit-probe',
        startMiners: { player: 0, enemy: 0 },
        initialUnits: { player: many('archer', 6), enemy: many('swordsman', 3) },
        initialStance: 'advance',
        enemyAi: 'scripted',
        waves: [],
      },
      1,
    );
    const enemyHpBefore = world.units
      .filter((u) => u.side === 'enemy')
      .reduce((sum, u) => sum + u.hp, 0);
    for (let i = 0; i < 1200; i++) step(world, []);
    const enemyHpAfter = world.units
      .filter((u) => u.side === 'enemy')
      .reduce((sum, u) => sum + u.hp, 0);
    expect(enemyHpAfter, 'arrows must still hurt units').toBeLessThan(enemyHpBefore);
  });
});

describe('base demolition rates (measured report, spec §9.3)', () => {
  it('records time to destroy 3000 HP per unit type', () => {
    const rows: string[] = [];
    for (const typeId of ['swordsman', 'archer', 'spearman'] as UnitTypeId[]) {
      const world = createWorld(siege(many(typeId, 10)), 1);
      let ticks = -1;
      for (let i = 0; i < 60000; i++) {
        step(world, []);
        if (world.bases.enemy.hp <= 0) {
          ticks = i + 1;
          break;
        }
      }
      rows.push(`  ${typeId.padEnd(10)} ${ticks < 0 ? 'never' : (ticks / 30).toFixed(1) + 's'}`);
    }
    console.log('BASE DEMOLITION (10 units vs 3000 HP)\n' + rows.join('\n'));

    // The gate is only that RANGED is now non-zero — the exact numbers are a
    // tuning report, not a threshold (spec §9.3).
    expect(rows[1]).not.toContain('never');
  });
});
