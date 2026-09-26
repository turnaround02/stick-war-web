import { describe, it, expect } from 'vitest';
import { spawnUnit } from './spawn';
import { UNIT_TICKS } from '../data/unitTicks';

describe('spawnUnit', () => {
  it('starts at full hp for the type', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    expect(u.hp).toBe(150);
  });

  it('sets prevX equal to x so the first frame does not jump', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 250 });
    expect(u.prevX).toBe(250);
  });

  it('starts idle with no target and no timers running', () => {
    const u = spawnUnit({ id: 1, side: 'enemy', typeId: 'spearman', x: 10 });
    expect(u.state).toBe('idle');
    expect(u.target).toBeNull();
    expect(u.windupTicksLeft).toBe(0);
    expect(u.cooldownTicksLeft).toBe(0);
  });

  it('defaults stance to hold', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 10 });
    expect(u.stance).toBe('hold');
  });

  it('honours an explicit stance', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 10, stance: 'advance' });
    expect(u.stance).toBe('advance');
  });

  it('gives the unit its attack cooldown already in ticks', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 0 });
    // A freshly spawned unit may strike immediately, so cooldown starts at 0,
    // but the derived table must be the source of the tick values.
    expect(UNIT_TICKS.swordsman.attackCooldown).toBe(30);
    expect(u.cooldownTicksLeft).toBe(0);
  });

  it('carries the requested id and side through', () => {
    const u = spawnUnit({ id: 42, side: 'enemy', typeId: 'archer', x: 5 });
    expect(u.id).toBe(42);
    expect(u.side).toBe('enemy');
  });
});
