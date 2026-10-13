import { describe, it, expect } from 'vitest';
import {
  BUCKET_COUNT,
  combatUnitCounts,
  normalizeCounts,
  frontlinePanelRect,
  baseBarRects,
  FRONTLINE_METRICS,
} from './layout';
import { createWorld } from '../../sim/createWorld';
import { LEVEL_1 } from '../../data/levels';
import type { Unit, UnitTypeId, World } from '../../sim/types';

/** A world with a controlled unit list, so bucket maths is not at the mercy of spawn logic. */
function worldWith(units: Array<Partial<Unit> & { typeId: UnitTypeId; x: number }>): World {
  const w = createWorld({ ...LEVEL_1, startMiners: { player: 0, enemy: 0 } }, 1);
  w.units = units.map((u, i) => ({
    id: i + 1,
    side: 'player',
    prevX: u.x,
    hp: 100,
    state: 'idle',
    stateEnteredTick: 0,
    stance: 'hold',
    target: null,
    windupTicksLeft: 0,
    cooldownTicksLeft: 0,
    gatherTicksLeft: 0,
    carrying: 0,
    stunTicksLeft: 0,
    ...u,
  }));
  return w;
}

describe('combatUnitCounts', () => {
  it('returns exactly BUCKET_COUNT buckets', () => {
    const w = worldWith([]);
    expect(combatUnitCounts(w, 'player')).toHaveLength(BUCKET_COUNT);
  });

  it('excludes miners', () => {
    // A miner and a swordsman at the same x: only the swordsman may be counted.
    // Miners shuttle between base and mine, so including them would draw two
    // static humps that drown the front-line signal entirely.
    const w = worldWith([
      { typeId: 'miner', x: 600 },
      { typeId: 'swordsman', x: 600 },
    ]);
    const counts = combatUnitCounts(w, 'player');
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('places a unit in the bucket its x falls into', () => {
    const w = worldWith([{ typeId: 'swordsman', x: 0 }]);
    const counts = combatUnitCounts(w, 'player');
    expect(counts[0]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('puts a unit exactly on a bucket boundary in the LEFT bucket', () => {
    // floor semantics: bucket = floor(x / bucketWidth). Boundary belongs to the
    // bucket it opens, not the one it closes.
    const w = worldWith([{ typeId: 'swordsman', x: bucketWidth() }]);
    const counts = combatUnitCounts(w, 'player');
    expect(counts[1]).toBe(1);
    expect(counts[0]).toBe(0);
  });

  it('clamps a unit left of the world into the first bucket', () => {
    const w = worldWith([{ typeId: 'swordsman', x: -50 }]);
    const counts = combatUnitCounts(w, 'player');
    expect(counts[0]).toBe(1);
  });

  it('clamps a unit right of the world into the last bucket', () => {
    const w = worldWith([{ typeId: 'swordsman', x: FRONTLINE_METRICS.worldWidth + 999 }]);
    const counts = combatUnitCounts(w, 'player');
    expect(counts[BUCKET_COUNT - 1]).toBe(1);
  });

  it('ignores dead units', () => {
    const w = worldWith([
      { typeId: 'swordsman', x: 0 },
      { typeId: 'swordsman', x: 0, state: 'dead' },
    ]);
    const counts = combatUnitCounts(w, 'player');
    expect(counts[0]).toBe(1);
  });

  it('counts only the requested side', () => {
    const w = worldWith([
      { typeId: 'swordsman', x: 0, side: 'player' },
      { typeId: 'swordsman', x: 0, side: 'enemy' },
    ]);
    expect(combatUnitCounts(w, 'player')[0]).toBe(1);
    expect(combatUnitCounts(w, 'enemy')[0]).toBe(1);
  });

  it('never produces NaN for any bucket', () => {
    const w = worldWith([{ typeId: 'archer', x: 1500 }]);
    for (const c of combatUnitCounts(w, 'player')) expect(Number.isNaN(c)).toBe(false);
  });
});

function bucketWidth(): number {
  return FRONTLINE_METRICS.worldWidth / BUCKET_COUNT;
}

describe('normalizeCounts', () => {
  it('scales the tallest bucket to 1', () => {
    expect(normalizeCounts([0, 4, 2], 3)).toEqual([0, 1, 0.5]);
  });

  it('returns all zeros for an empty histogram', () => {
    expect(normalizeCounts([0, 0, 0], 3)).toEqual([0, 0, 0]);
  });
});

describe('frontlinePanelRect', () => {
  it('is 40% of the viewport, centred horizontally, at the top', () => {
    const r = frontlinePanelRect(1000, FRONTLINE_METRICS);
    expect(r.w).toBeCloseTo(400);
    expect(r.x).toBeCloseTo(300);
    expect(r.y).toBe(FRONTLINE_METRICS.top);
  });

  it('never leaves the viewport at a narrow width', () => {
    const r = frontlinePanelRect(120, FRONTLINE_METRICS);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(120 + 1e-6);
  });
});

describe('baseBarRects', () => {
  it('sits at the two ends of the panel, below the histogram', () => {
    const { player, enemy } = baseBarRects(1000, FRONTLINE_METRICS);
    const panel = frontlinePanelRect(1000, FRONTLINE_METRICS);
    expect(player.x).toBeGreaterThanOrEqual(panel.x);
    expect(enemy.x + enemy.w).toBeLessThanOrEqual(panel.x + panel.w + 1e-6);
    // Bars live under the histogram strip, not at the panel's top edge.
    expect(player.y).toBeGreaterThanOrEqual(panel.y);
    expect(player.y + player.h).toBeLessThanOrEqual(panel.y + panel.h + 1e-6);
  });

  it('fits inside the panel at a narrow width', () => {
    const panel = frontlinePanelRect(120, FRONTLINE_METRICS);
    const { player, enemy } = baseBarRects(120, FRONTLINE_METRICS);
    expect(player.w).toBeGreaterThanOrEqual(0);
    expect(enemy.w).toBeGreaterThanOrEqual(0);
    expect(enemy.x + enemy.w).toBeLessThanOrEqual(panel.x + panel.w + 1e-6);
  });
});
