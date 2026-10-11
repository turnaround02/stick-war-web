import { describe, it, expect } from 'vitest';
import { hashWorld } from './hash';
import { createWorld } from './createWorld';
import { DEFAULT_MATCH } from '../data/levels';
import type { MatchConfig } from './types';

const match: MatchConfig = {
  ...DEFAULT_MATCH,
  initialUnits: {
    player: ['swordsman', 'archer'],
    enemy: ['spearman'],
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
      target: { kind: 'unit', id: 0 },
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

describe('hashWorld — M3 economy state', () => {
  it('distinguishes a mine target from a base target', () => {
    // Both are side-only references, so a naive `kind === 'unit' ? ... : b${side}`
    // collapses them. A miner heading home loaded and one heading outbound would
    // then hash identically — exactly the arrive/depart transition the hash
    // exists to guard.
    const a = createWorld({ ...match, startMiners: { player: 1, enemy: 0 } }, 1);
    const b = createWorld({ ...match, startMiners: { player: 1, enemy: 0 } }, 1);
    a.units[0].target = { kind: 'base', side: 'player' };
    b.units[0].target = { kind: 'mine', side: 'player' };
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('changes when carried gold changes', () => {
    const w = createWorld({ ...match, startMiners: { player: 1, enemy: 0 } }, 1);
    const before = hashWorld(w);
    w.units[0].carrying = 20;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when the gather timer changes', () => {
    const w = createWorld({ ...match, startMiners: { player: 1, enemy: 0 } }, 1);
    const before = hashWorld(w);
    w.units[0].gatherTicksLeft = 42;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when mine gold changes', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.mines.player.goldLeft -= 20;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when the training queue changes', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.trainingQueue.player.push({ typeId: 'miner', ticksLeft: 100 });
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when nextUnitId changes', () => {
    // Two worlds that have spawned the same units but differ in their id
    // counter will diverge on the NEXT spawn.
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.nextUnitId += 1;
    expect(hashWorld(w)).not.toBe(before);
  });
});

describe('hashWorld — M4 wave state', () => {
  const scripted: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'hash-wave',
    startMiners: { player: 1, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    enemyAi: 'scripted',
    waves: [{ atTick: 30, units: ['swordsman'] }],
  };

  it('changes when waveIndex changes', () => {
    // waveIndex decides what arrives NEXT, so two worlds that look identical
    // now would diverge on the following tick.
    const a = createWorld(scripted, 1);
    const b = createWorld(scripted, 1);
    b.waveIndex = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('distinguishes different wave tables', () => {
    const a = createWorld(scripted, 1);
    const b = createWorld({ ...scripted, waves: [{ atTick: 30, units: ['archer'] }] }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('distinguishes wave tables that differ only in timing', () => {
    const a = createWorld(scripted, 1);
    const b = createWorld({ ...scripted, waves: [{ atTick: 31, units: ['swordsman'] }] }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('changes when the aiProfile changes', () => {
    const a = createWorld(scripted, 1);
    const b = createWorld(scripted, 1);
    b.aiProfile = 'standard';
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('changes when endless changes', () => {
    // M4a made this load-bearing: cleanupSystem reads it to decide whether an
    // empty enemy field can be a victory. Two worlds differing only in it can
    // reach different outcomes, so it must be in the digest.
    const a = createWorld({ ...scripted, waves: [] }, 1);
    const b = createWorld({ ...scripted, waves: [] }, 1);
    b.endless = true;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('hashWorld — M4b match flags', () => {
  const base: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'hash-m4b',
    startMiners: { player: 1, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
  };

  it('changes when winCondition changes', () => {
    // Same argument as `endless`: it decides the outcome, so two worlds that
    // differ only in it can diverge.
    const a = createWorld({ ...base, winCondition: 'annihilation' }, 1);
    const b = createWorld({ ...base, winCondition: 'base' }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('hashWorld — enemy profile id', () => {
  const cfg: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'hash-profile',
    startMiners: { player: 0, enemy: 1 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
  };

  it('distinguishes the profiles a level can select', () => {
    // The id decides what the enemy builds, so two worlds with the same units
    // can still diverge.
    const a = createWorld({ ...cfg, enemyProfile: 'standard' }, 1);
    const b = createWorld({ ...cfg, enemyProfile: 'level-2' }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('distinguishes none from a real profile', () => {
    const a = createWorld({ ...cfg, enemyProfile: 'none' }, 1);
    const b = createWorld({ ...cfg, enemyProfile: 'standard' }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
