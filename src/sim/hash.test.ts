import { describe, it, expect } from 'vitest';
import { hashWorld } from './hash';
import { createWorld } from './createWorld';
import { DEFAULT_MATCH } from '../data/levels';

const match = {
  ...DEFAULT_MATCH,
  initialUnits: {
    player: ['swordsman', 'archer'] as const,
    enemy: ['spearman'] as const,
  },
};

describe('hashWorld', () => {
  it('returns a stable string for the same world', () => {
    const w = createWorld(match, 1);
    expect(hashWorld(w)).toBe(hashWorld(w));
  });

  it('is identical for two worlds built from the same seed', () => {
    expect(hashWorld(createWorld(match, 7))).toBe(hashWorld(createWorld(match, 7)));
  });

  it('differs when the seed differs', () => {
    expect(hashWorld(createWorld(match, 1))).not.toBe(hashWorld(createWorld(match, 2)));
  });

  it('changes when a unit moves', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.units[0].x += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when a unit loses hp', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.units[0].hp -= 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when gold changes', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.gold.player += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when the rng state changes', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.rngState += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when a base takes damage', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.bases.enemy.hp -= 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when damage stats change', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.stats.player.damageDealt += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when a projectile is added', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.projectiles.push({
      id: 1,
      side: 'player',
      x: 10,
      prevX: 10,
      targetId: 0,
      damage: 1,
      ticksToImpact: 3,
    });
    expect(hashWorld(w)).not.toBe(before);
  });

  it('does not depend on object key insertion order', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    // Rebuild the world object with its keys in a different order.
    const shuffled = Object.fromEntries(Object.entries(w).reverse()) as typeof w;
    expect(hashWorld(shuffled)).toBe(before);
  });

  it('is order-sensitive within the units array', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    const [first] = w.units.splice(0, 1);
    w.units.push(first);
    expect(hashWorld(w)).not.toBe(before);
  });

  it('does not collide for nearby positions', () => {
    const a = createWorld(match, 1);
    const b = createWorld(match, 1);
    a.units[0].x = 100.0001;
    b.units[0].x = 100.0002;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
