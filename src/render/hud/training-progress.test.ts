import { describe, it, expect } from 'vitest';
import { trainingProgress, trainingBarRect, TRAINING_BAR } from './training-progress';
import { createWorld } from '../../sim/createWorld';
import { DEFAULT_MATCH } from '../../data/levels';
import { UNIT_TICKS } from '../../data/unitTicks';

function world() {
  return createWorld({ ...DEFAULT_MATCH }, 1);
}

describe('trainingProgress', () => {
  it('is invisible when the queue is empty', () => {
    const p = trainingProgress(world(), 'player');
    expect(p.visible).toBe(false);
    expect(p.label).toBe('');
    expect(p.fraction).toBe(0);
  });

  it('shows the head unit and its remaining time', () => {
    const w = world();
    w.trainingQueue.player.push({ typeId: 'swordsman', ticksLeft: UNIT_TICKS.swordsman.trainTime });
    const p = trainingProgress(w, 'player');
    expect(p.visible).toBe(true);
    expect(p.label).toContain('剑士');
    // A fresh order has the full training time remaining.
    expect(p.label).toContain('0:08');
  });

  it('fills from 0 (just ordered) toward 1 (about to spawn)', () => {
    const w = world();
    const total = UNIT_TICKS.swordsman.trainTime;
    w.trainingQueue.player.push({ typeId: 'swordsman', ticksLeft: total });
    expect(trainingProgress(w, 'player').fraction).toBeCloseTo(0, 6);

    w.trainingQueue.player[0]!.ticksLeft = Math.ceil(total / 2);
    expect(trainingProgress(w, 'player').fraction).toBeCloseTo(0.5, 6);

    w.trainingQueue.player[0]!.ticksLeft = 1;
    expect(trainingProgress(w, 'player').fraction).toBeGreaterThan(0.95);
  });

  it('never leaves the 0..1 range', () => {
    const w = world();
    w.trainingQueue.player.push({ typeId: 'giant', ticksLeft: 0 });
    const p = trainingProgress(w, 'player');
    expect(p.fraction).toBeLessThanOrEqual(1);
    expect(p.fraction).toBeGreaterThanOrEqual(0);
  });

  it('reads the requested side only', () => {
    const w = world();
    w.trainingQueue.enemy.push({ typeId: 'miner', ticksLeft: 30 });
    expect(trainingProgress(w, 'player').visible).toBe(false);
    expect(trainingProgress(w, 'enemy').visible).toBe(true);
  });

  it('labels a giant with its unit name', () => {
    const w = world();
    w.trainingQueue.player.push({ typeId: 'giant', ticksLeft: 300 });
    expect(trainingProgress(w, 'player').label).toContain('巨人');
  });
});

describe('trainingBarRect', () => {
  it('sits at the fixed HUD slot on a normal viewport', () => {
    const r = trainingBarRect(1280);
    expect(r.x).toBe(TRAINING_BAR.x);
    expect(r.y).toBe(TRAINING_BAR.y);
    expect(r.w).toBe(TRAINING_BAR.w);
  });

  it('shrinks rather than overflowing a narrow viewport', () => {
    const r = trainingBarRect(120);
    expect(r.x + r.w).toBeLessThanOrEqual(120);
    expect(r.w).toBeGreaterThanOrEqual(0);
  });

  it('never has a negative width', () => {
    expect(trainingBarRect(10).w).toBe(0);
  });
});
