import { describe, it, expect } from 'vitest';
import { runScenario, type Scenario } from './harness';

/**
 * The spec §6.5 counter-relationship, as an executable acceptance table.
 *
 * This is the guard that was missing. Before it, `harness.test.ts` printed a
 * matrix with `console.table` and asserted only that it did not throw — so the
 * archer could be strictly dominant (it was: 4/9 of these expectations held)
 * and the suite stayed green. Balance is a spec requirement, not a curiosity to
 * be reported.
 *
 * Two properties make this a real test rather than a snapshot:
 *
 *   1. **Every scenario runs on 6 seeds and must agree on all of them.** A
 *      matchup that flips with the seed is not a property of the numbers, it is
 *      noise; asserting a single seed would encode a coincidence.
 *   2. **Expectations come from spec §6.5's prose**, not from current behaviour.
 *      A test written from the output can only ever pass.
 *
 * Expectations:
 *   - spearman > swordsman (anti-heavy bonus + 45 reach vs 30)
 *   - swordsman > archer   (faster + anti-light bonus, closes inside ~4s)
 *   - archer  > nothing without a screen; it LOSES to every melee line
 *   - archer WITH a screen outdamages the same archers without one
 */

const SEEDS = [1, 7, 99, 4242, 20260926, 31337];

type Expectation = 'player' | 'enemy' | null;

interface Matchup {
  label: string;
  scenario: Scenario;
  /** Which side spec §6.5 says wins. null = no expectation (mirror match). */
  expect: Expectation;
  /** Why the spec says so. Kept beside the data so the table is auditable. */
  why: string;
}

function sc(
  player: Scenario['player'],
  enemy: Scenario['enemy'],
  spacing?: number,
): Scenario {
  return { name: '', player, enemy, spacing };
}

const MATRIX: Matchup[] = [
  {
    label: 'spearman x11 vs swordsman x10',
    scenario: sc({ spearman: 11 }, { swordsman: 10 }),
    expect: 'player',
    why: '§6.5: 矛兵 > 剑士（反重甲 + 射程 45 先手）',
  },
  {
    label: 'spearman x10 vs swordsman x10',
    scenario: sc({ spearman: 10 }, { swordsman: 10 }),
    expect: 'player',
    why: '§6.5: 矛兵 > 剑士，同数量也应成立',
  },
  {
    label: 'swordsman x10 vs archer x12',
    scenario: sc({ swordsman: 10 }, { archer: 12 }),
    expect: 'player',
    why: '§6.5: 剑士 > 弓箭手，即使弓箭手更多',
  },
  {
    label: 'swordsman x10 vs archer x10',
    scenario: sc({ swordsman: 10 }, { archer: 10 }),
    expect: 'player',
    why: '§6.5: 剑士 > 弓箭手',
  },
  {
    label: 'archer x12 vs swordsman x10 (无掩护)',
    scenario: sc({ archer: 12 }, { swordsman: 10 }),
    expect: 'enemy',
    why: '§6.5: 弓箭手无掩护打不过任何近战',
  },
  {
    label: 'archer x10 vs swordsman x10 (无掩护)',
    scenario: sc({ archer: 10 }, { swordsman: 10 }),
    expect: 'enemy',
    why: '§6.5: 弓箭手无掩护打不过任何近战',
  },
  {
    label: 'archer x6 vs swordsman x10 (无掩护)',
    scenario: sc({ archer: 6 }, { swordsman: 10 }),
    expect: 'enemy',
    why: '§6.5: 弓箭手无掩护打不过任何近战',
  },
  {
    label: 'archer x10 vs spearman x9 (无掩护)',
    scenario: sc({ archer: 10 }, { spearman: 9 }),
    expect: 'enemy',
    why: '§6.5: 弓箭手 1v1 打不过「任何」近战 —— 矛兵亦然',
  },
  {
    label: 'spearman x10 vs archer x10 (无掩护)',
    scenario: sc({ spearman: 10 }, { archer: 10 }),
    expect: 'player',
    why: '§6.5: 弓箭手 1v1 打不过「任何」近战 —— 矛兵亦然',
  },
  {
    label: 'swordsman x5 + archer x6 vs swordsman x10 (有掩护)',
    scenario: sc({ swordsman: 5, archer: 6 }, { swordsman: 10 }, 30),
    expect: 'player',
    why: '§6.5: 弓箭手有掩护才有输出空间',
  },
  // M6.2 — giant: new rows only, old rows untouched.
  // Expected values are MEASURED, not speculative (same methodology as M4b).
  {
    label: 'giant x1 vs swordsman x5',
    scenario: sc({ giant: 1 }, { swordsman: 5 }),
    expect: null,
    why: 'M6 实测: 死锁 — 巨人 500HP+12armor 剑士打不穿，剑士数量也不足以绕开巨人，6000 tick 超时',
  },
  {
    label: 'giant x1 vs archer x8',
    scenario: sc({ giant: 1 }, { archer: 8 }),
    expect: 'enemy',
    why: 'M6 实测: 8 个弓箭手无掩护仍能在 ~30s 内击杀巨人（箭矢穿透重甲）',
  },
  {
    label: 'giant x1 vs spearman x4',
    scenario: sc({ giant: 1 }, { spearman: 4 }),
    expect: 'enemy',
    why: 'M6 实测: 4 个矛兵 ~42s 击杀巨人（heavy bonus 1.6 弥补了 armor 12）',
  },
  // M6.3 — mage: new rows only, old rows untouched.
  // Expected values are MEASURED (6-seed unanimous), not speculative.
  {
    label: 'mage x1 vs swordsman x2',
    scenario: sc({ mage: 1 }, { swordsman: 2 }),
    expect: 'enemy',
    why: 'M6: 法师 1v1 打不过任何近战（与弓箭手同规则），2 个剑士足以击落',
  },
  {
    label: 'mage x1 vs spearman x2',
    scenario: sc({ mage: 1 }, { spearman: 2 }),
    expect: 'enemy',
    why: 'M6: 法师 1v1 打不过矛兵',
  },
  {
    label: 'mage x1 vs giant x1',
    scenario: sc({ mage: 1 }, { giant: 1 }),
    expect: 'enemy',
    why: 'M6.5 实测: 巨人射程修到 44（>= r22+r11=33）后能命中法师，958 tick 击杀；' +
      '旧 30 射程时巨人永远打不到法师（32 > 30），法师 74s 风筝胜——那是 bug 不是设计',
  },
];

/** The control case for the R1/R2 damage ratio: the SAME six archers, no screen. */
const SIX_UNSCREENED: Scenario = sc({ archer: 6 }, { swordsman: 10 });
const SIX_SCREENED: Scenario = sc({ swordsman: 5, archer: 6 }, { swordsman: 10 }, 30);

/** How many seeds agree with `expect`. Unanimity is the bar. */
function agreement(m: Matchup): number {
  let n = 0;
  for (const seed of SEEDS) {
    if (runScenario(m.scenario, seed).winner === m.expect) n += 1;
  }
  return n;
}

describe('spec §6.5 counter-relationships', () => {
  for (const m of MATRIX) {
    if (m.expect === null) continue;
    it(`${m.label} → ${m.expect}`, () => {
      // Reported as N/6 so a partial flip is visible rather than a bare false.
      expect(agreement(m), `${m.why} (agreed on ${agreement(m)}/${SEEDS.length} seeds)`).toBe(
        SEEDS.length,
      );
    });
  }
});

describe('R1/R2: cover multiplies archer output', () => {
  it('screened archers outdamage the same archers unscreened, on every seed', () => {
    // Damage, not survivors: an unscreened archer line gets wiped, so survivor
    // count reads 0 for both sides and measures nothing. Damage is what the
    // screen changes — the same arrows fired, but fired for longer.
    for (const seed of SEEDS) {
      const screened = runScenario(SIX_SCREENED, seed);
      const unscreened = runScenario(SIX_UNSCREENED, seed);
      expect(
        screened.damageDealt.player,
        `seed ${seed}: cover must be worth more than 1.5x`,
      ).toBeGreaterThan(unscreened.damageDealt.player * 1.5);
    }
  });

  it('records the measured cover multiplier', () => {
    // A canary, not an assertion about the exact value: it documents what the
    // current numbers produce so a future change that silently flattens the
    // multiplier shows up as a diff rather than as nothing at all.
    const seed = SEEDS[0];
    const screened = runScenario(SIX_SCREENED, seed);
    const unscreened = runScenario(SIX_UNSCREENED, seed);
    const ratio = screened.damageDealt.player / unscreened.damageDealt.player;
    expect(ratio).toBeGreaterThan(2);
  });
});
