import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';

/**
 * Economy THROUGHPUT — the scaling half of spec §8.3.
 *
 * M3's acceptance tests only ever used one or two miners, and a lone miner has
 * the whole lane to itself. Add a crowd and the lane becomes two-way traffic:
 * miners walking out to the seam meet miners carrying gold home. On a single
 * axis those two groups are head-on, and head-on units cannot pass — so the
 * carriers could never reach the bank point, and the economy deadlocked at the
 * first load. One miner produced 2.33 gold/s; twelve produced 0.22/s and then
 * stopped entirely.
 *
 * These tests exist because "a lone miner works" does not imply "the economy
 * works", and the spec's claim is explicitly about twelve.
 */

/** A player-only economy with `miners` starting miners and no enemy. */
function economy(miners: number, over: Partial<typeof DEFAULT_MATCH> = {}) {
  return {
    ...DEFAULT_MATCH,
    startGold: { player: 0, enemy: 0 },
    startMiners: { player: miners, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    enemyAi: 'scripted' as const,
    ...over,
  };
}

/** Runs `ticks` and returns the world. */
function run(miners: number, ticks: number, seed = 1) {
  const world = createWorld(economy(miners), seed);
  for (let i = 0; i < ticks; i++) step(world, []);
  return world;
}

const banked = (world: { gold: { player: number } }) => world.gold.player;

describe('economy throughput — a crowd does not deadlock', () => {
  it('twelve miners keep producing for a full minute', () => {
    // The exact case the spec claims 28.8 gold/s for. The bar here is much
    // lower than the spec figure — this test is about the lane not seizing up,
    // not about hitting a tuning target.
    const world = run(12, 1800);
    expect(banked(world), 'twelve miners must not deadlock').toBeGreaterThan(1000);
  });

  it('twelve miners are still producing late in the match', () => {
    // A deadlock is invisible early: the first load is banked before the crowd
    // forms. The tell is that production STOPS. Compare two windows.
    const early = banked(run(12, 1800));
    const late = banked(run(12, 3000));
    expect(late - early, 'production must continue after the crowd forms').toBeGreaterThan(400);
  });

  it('more miners produce more gold', () => {
    const one = banked(run(1, 1800));
    const twelve = banked(run(12, 1800));
    expect(twelve, `1 miner ${one} vs 12 miners ${twelve}`).toBeGreaterThan(one * 3);
  });

  it('throughput grows with miner count rather than collapsing', () => {
    // The failure mode was a 10x COLLAPSE (2.33/s down to 0.22/s). Assert the
    // ordering directly so a future regression in the same direction is caught
    // even if the absolute numbers drift.
    const rates = [1, 3, 6, 12].map((n) => banked(run(n, 1800)) / 60);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i], `rates ${rates.map((r) => r.toFixed(2)).join(', ')}`).toBeGreaterThan(
        rates[i - 1],
      );
    }
  });

  it('no miner is permanently parked', () => {
    // A deadlocked miner sits at a fixed x forever. Sampling position alone
    // cannot tell it apart from one mid-trip, so measure whether each miner
    // actually MOVES over a window: gathering lasts 3s and a trip ~2.7s, so in
    // 10s every miner must travel well over 20px.
    const world = run(12, 1800);
    const miners = world.units.filter((u) => u.side === 'player' && u.typeId === 'miner');
    expect(miners).toHaveLength(12);

    const startX = new Map(miners.map((m) => [m.id, m.x]));
    const maxTravel = new Map(miners.map((m) => [m.id, 0]));
    for (let i = 0; i < 300; i++) {
      step(world, []);
      for (const m of world.units) {
        const from = startX.get(m.id);
        if (from === undefined) continue;
        const d = Math.abs(m.x - from);
        if (d > (maxTravel.get(m.id) ?? 0)) maxTravel.set(m.id, d);
      }
    }

    for (const m of miners) {
      expect(maxTravel.get(m.id), `miner #${m.id} never moved`).toBeGreaterThan(20);
    }
  });
});

describe('economy throughput — the lane stays usable', () => {
  it('a carrier reaches the bank point even with miners walking out', () => {
    // The minimal reproduction: one carrier heading home, one miner heading out,
    // with the carrier BEHIND the outbound miner. They are head-on.
    const world = createWorld(economy(2), 1);
    const [a, b] = world.units;
    a.x = 366;
    a.carrying = 20;
    a.target = { kind: 'base', side: 'player' };
    a.state = 'move';
    b.x = 346;
    b.carrying = 0;
    b.target = { kind: 'mine', side: 'player' };
    b.state = 'move';

    const startGold = world.gold.player;
    for (let i = 0; i < 60; i++) step(world, []);
    expect(world.gold.player, 'the carrier must get through').toBeGreaterThan(startGold);
  });

  it('still banks gold with a long queue of carriers', () => {
    const world = createWorld(economy(12), 1);
    for (let i = 0; i < 900; i++) step(world, []);
    const before = world.gold.player;
    for (let i = 0; i < 900; i++) step(world, []);
    expect(world.gold.player).toBeGreaterThan(before);
  });
});

describe('economy throughput — determinism survives the fix', () => {
  it('is reproducible for a given seed', () => {
    expect(hashWorld(run(12, 1200, 4242))).toBe(hashWorld(run(12, 1200, 4242)));
  });

  it('different seeds still give the same economy shape', () => {
    // The economy has no randomness in it, so seeds must not change the totals.
    expect(banked(run(12, 1200, 1))).toBe(banked(run(12, 1200, 999)));
  });
});
