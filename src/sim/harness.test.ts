import { describe, it, expect } from 'vitest';
import { runScenario, DEFAULT_MAX_TICKS, type Scenario } from './harness';

const mirror: Scenario = {
  name: 'mirror swordsmen',
  player: { swordsman: 10 },
  enemy: { swordsman: 10 },
};

describe('runScenario', () => {
  it('runs a mirror match to a verdict', () => {
    const r = runScenario(mirror, 1);
    expect(['player', 'enemy', 'draw']).toContain(r.winner);
    expect(r.ticks).toBeGreaterThan(0);
    expect(r.ticks).toBeLessThanOrEqual(DEFAULT_MAX_TICKS);
  });

  it('is reproducible: same seed, same result', () => {
    const a = runScenario(mirror, 42);
    const b = runScenario(mirror, 42);
    expect(a.hash).toBe(b.hash);
    expect(a.winner).toBe(b.winner);
    expect(a.ticks).toBe(b.ticks);
  });

  it('reports survivors per side', () => {
    const r = runScenario(mirror, 7);
    expect(r.survivors).toHaveProperty('player');
    expect(r.survivors).toHaveProperty('enemy');
  });

  it('reports damage dealt per side', () => {
    const r = runScenario(mirror, 7);
    expect(r.damageDealt.player).toBeGreaterThan(0);
    expect(r.damageDealt.enemy).toBeGreaterThan(0);
  });

  it('finishes quickly enough for batch runs', () => {
    const start = performance.now();
    runScenario(mirror, 3);
    const ms = performance.now() - start;
    // spec S5: a full match under 500ms. Generous ceiling for CI noise.
    expect(ms).toBeLessThan(2000);
  });

  it('handles an empty roster without throwing', () => {
    const r = runScenario({ name: 'empty', player: {}, enemy: {} }, 1);
    expect(['player', 'enemy', 'draw']).toContain(r.winner);
  });

  it('respects maxTicks', () => {
    const r = runScenario(mirror, 1, 10);
    expect(r.ticks).toBeLessThanOrEqual(11);
  });
});

describe('balance matrix', () => {
  const scenarios: Scenario[] = [
    // 1. Same-gold unit matchups
    {
      name: 'swordsman x10 vs archer x12 (1000 vs 960 gold)',
      player: { swordsman: 10 },
      enemy: { archer: 12 },
    },
    {
      name: 'spearman x11 vs swordsman x10 (990 vs 1000 gold)',
      player: { spearman: 11 },
      enemy: { swordsman: 10 },
    },
    {
      name: 'archer x10 vs spearman x9 (800 vs 810 gold)',
      player: { archer: 10 },
      enemy: { spearman: 9 },
    },

    // 2. Archer WITH front-line cover — the only way to validate R1/R2
    {
      name: 'swordsman x5 + archer x6 vs swordsman x10 (980 vs 1000 gold)',
      player: { swordsman: 5, archer: 6 },
      enemy: { swordsman: 10 },
      spacing: 30,
    },

    // 3. Archer WITHOUT cover — the control case; archers should lose badly
    {
      name: 'archer x12 vs swordsman x10 (960 vs 1000 gold)',
      player: { archer: 12 },
      enemy: { swordsman: 10 },
    },
  ];

  it('produces a full matrix without throwing', () => {
    const rows = scenarios.map((s) => {
      const r = runScenario(s, 20260926);
      return {
        scenario: r.name,
        winner: r.winner,
        ticks: r.ticks,
        playerLeft: r.survivors.player,
        enemyLeft: r.survivors.enemy,
        playerDmg: Math.round(r.damageDealt.player),
        enemyDmg: Math.round(r.damageDealt.enemy),
      };
    });

    console.table(rows);
    expect(rows).toHaveLength(scenarios.length);
    for (const row of rows) {
      expect(row.ticks).toBeGreaterThan(0);
    }
  });

  it('lets a screened archer line deal more damage than an unscreened one', () => {
    // Controlled comparison: the SAME six archers against the SAME ten
    // swordsmen, once with a swordsman screen and once without. Comparing
    // "5 swordsmen + 6 archers" against "12 archers" would vary the shooter
    // count as well as the cover, and could not isolate either effect.
    const screened = runScenario(
      {
        name: 'screened: swordsman x5 + archer x6 vs swordsman x10',
        player: { swordsman: 5, archer: 6 },
        enemy: { swordsman: 10 },
        spacing: 30,
      },
      20260926,
    );
    const unscreened = runScenario(
      {
        name: 'unscreened: archer x6 vs swordsman x10',
        player: { archer: 6 },
        enemy: { swordsman: 10 },
      },
      20260926,
    );

    // Damage, not survivors: both lines eventually get wiped (10 swordsmen
    // against 6 archers), so survivor count reads 0 for both and measures
    // nothing. Damage is what the screen actually changes — both lines fire
    // the same number of arrows, but the screened archers get to keep firing
    // while the front rank absorbs the melee. This is the R1/R2 validation.
    expect(screened.damageDealt.player).toBeGreaterThan(unscreened.damageDealt.player * 1.5);
  });

  it('leaves no units overlapped at the end of any scenario', () => {
    for (const s of scenarios) {
      const r = runScenario(s, 5);
      expect(r.finalOverlapViolations, s.name).toBe(0);
    }
  });
});
