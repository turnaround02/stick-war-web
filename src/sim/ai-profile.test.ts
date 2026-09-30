import { describe, it, expect } from 'vitest';
import { AI_PROFILES, ENEMY_STANDARD, LEVEL_2_ENEMY, PLAYER_REFERENCE, profileFor } from './ai-profile';
import { createWorld } from './createWorld';
import { decideCommands } from './tactic';
import { DEFAULT_MATCH } from '../data/levels';
import type { AiProfileId } from '../data/types';
import type { MatchConfig } from './types';

describe('AI profile registry', () => {
  it('maps every id to a profile, with none meaning "no layer"', () => {
    expect(AI_PROFILES.none).toBeNull();
    expect(AI_PROFILES.standard).toBe(ENEMY_STANDARD);
    expect(AI_PROFILES['level-2']).toBe(LEVEL_2_ENEMY);
  });

  it('profileFor returns null only for none', () => {
    expect(profileFor('none')).toBeNull();
    expect(profileFor('standard')).not.toBeNull();
    expect(profileFor('level-2')).not.toBeNull();
  });

  it('every registered profile is a usable AiProfile', () => {
    for (const id of Object.keys(AI_PROFILES) as AiProfileId[]) {
      const p = profileFor(id);
      if (p === null) continue;
      expect(p.decisionIntervalTicks, id).toBeGreaterThan(0);
      expect(p.minerTarget, id).toBeGreaterThanOrEqual(0);
      expect(p.buildOrder.length, id).toBeGreaterThan(0);
      expect(p.retreatRatio, id).toBeLessThanOrEqual(p.advanceRatio);
    }
  });

  it('level 2 has its own profile, distinct from the standard enemy', () => {
    // The point of the registry: a level can tune its enemy without changing
    // the demo's, and without changing the reference player's yardstick.
    expect(LEVEL_2_ENEMY).not.toBe(ENEMY_STANDARD);
  });

  it('the reference player is not reachable as an enemy id', () => {
    // Otherwise a level could accidentally make the enemy play as well as the
    // proxy for a competent human, which would invalidate the winnability proof.
    const asEnemy = Object.values(AI_PROFILES).filter((p) => p === PLAYER_REFERENCE);
    expect(asEnemy).toHaveLength(0);
  });
});

describe('createWorld — enemy profile resolution', () => {
  const base: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'profile-probe',
    startMiners: { player: 1, enemy: 1 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
  };

  it('defaults an economy enemy to standard', () => {
    const w = createWorld({ ...base, enemyAi: 'economy' }, 1);
    expect(w.aiProfile).toBe('standard');
  });

  it('defaults a scripted enemy to none', () => {
    const w = createWorld({ ...base, enemyAi: 'scripted' }, 1);
    expect(w.aiProfile).toBe('none');
  });

  it('honours an explicit enemyProfile over the enemyAi default', () => {
    const w = createWorld({ ...base, enemyAi: 'economy', enemyProfile: 'level-2' }, 1);
    expect(w.aiProfile).toBe('level-2');
  });

  it('lets a level opt OUT of the tactical layer even with an economy', () => {
    // Needed by the balance harness, which must measure pure unit matchups.
    const w = createWorld({ ...base, enemyAi: 'economy', enemyProfile: 'none' }, 1);
    expect(w.aiProfile).toBe('none');
  });
});

describe('the selected profile actually drives the enemy', () => {
  const base: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'drive-probe',
    startGold: { player: 0, enemy: 100000 },
    startMiners: { player: 0, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
    enemyAi: 'economy',
  };

  /** Runs `ticks` of decisions for the enemy and returns its first train order. */
  function firstTrain(id: AiProfileId): string | null {
    const world = createWorld({ ...base, enemyProfile: id }, 1);
    const profile = profileFor(id);
    if (profile === null) return null;
    for (let t = 0; t <= profile.decisionIntervalTicks * 3; t++) {
      world.tick = t;
      for (const c of decideCommands(world, 'enemy', profile)) {
        if (c.kind === 'train') return c.typeId;
      }
    }
    return null;
  }

  it('produces orders for standard and level-2', () => {
    expect(firstTrain('standard')).not.toBeNull();
    expect(firstTrain('level-2')).not.toBeNull();
  });

  it('produces nothing for none', () => {
    expect(firstTrain('none')).toBeNull();
  });
});
