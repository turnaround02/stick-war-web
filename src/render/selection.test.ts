import { describe, it, expect } from 'vitest';
import { Selection, selectedIdsOf } from './selection';
import { spawnUnit } from '../sim/spawn';

describe('Selection', () => {
  it('starts empty', () => {
    const s = new Selection();
    expect(s.size).toBe(0);
    expect(s.ids()).toEqual([]);
  });

  it('selects a single id, replacing the previous one', () => {
    const s = new Selection();
    s.select(1);
    s.select(2);
    expect(s.ids()).toEqual([2]);
    expect(s.has(1)).toBe(false);
    expect(s.has(2)).toBe(true);
  });

  it('clears', () => {
    const s = new Selection();
    s.select(1);
    s.clear();
    expect(s.size).toBe(0);
  });

  it('toggles an id on and off', () => {
    const s = new Selection();
    s.toggle(5);
    expect(s.has(5)).toBe(true);
    s.toggle(5);
    expect(s.has(5)).toBe(false);
  });

  it('keeps other ids when toggling one off', () => {
    const s = new Selection();
    s.toggle(1);
    s.toggle(2);
    s.toggle(1);
    expect(s.ids()).toEqual([2]);
  });

  it('returns ids in insertion order', () => {
    const s = new Selection();
    s.toggle(3);
    s.toggle(1);
    s.toggle(2);
    expect(s.ids()).toEqual([3, 1, 2]);
  });

  it('returns a copy so callers cannot mutate internal state', () => {
    const s = new Selection();
    s.select(1);
    const ids = s.ids();
    ids.push(99);
    expect(s.ids()).toEqual([1]);
  });
});

describe('selectedIdsOf', () => {
  it('returns only living units of the requested side', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 200 });
    const c = spawnUnit({ id: 3, side: 'player', typeId: 'archer', x: 300 });
    c.state = 'dead';
    c.hp = 0;

    const s = new Selection();
    s.toggle(1);
    s.toggle(2);
    s.toggle(3);

    expect(selectedIdsOf(s, [a, b, c], 'player')).toEqual([1]);
  });

  it('drops ids that no longer exist', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const s = new Selection();
    s.toggle(1);
    s.toggle(999);
    expect(selectedIdsOf(s, [a], 'player')).toEqual([1]);
  });

  it('returns an empty list for an empty selection', () => {
    expect(selectedIdsOf(new Selection(), [], 'player')).toEqual([]);
  });

  it('is deterministic in order', () => {
    const units = [1, 2, 3].map((id) =>
      spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 100 * id }),
    );
    const s = new Selection();
    s.toggle(3);
    s.toggle(1);
    s.toggle(2);
    expect(selectedIdsOf(s, units, 'player')).toEqual([3, 1, 2]);
  });
});
