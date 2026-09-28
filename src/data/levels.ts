/**
 * Level and match presets (spec §8.4).
 *
 * M1 only needs DEFAULT_MATCH — a symmetric skirmish used to bring the
 * render pipeline up. Levels 1 and 2 arrive in M4.
 */

import {
  BASE_HP,
  ENEMY_BASE_X,
  ENEMY_MINE_X,
  MINE_GOLD,
  PLAYER_BASE_X,
  PLAYER_MINE_X,
  POP_CAP,
  START_GOLD,
  WORLD_WIDTH,
  toTicks,
} from './constants';
import type { MatchConfig } from './types';

/** Symmetric sandbox match. Both sides get a mine and start with no units. */
export const DEFAULT_MATCH: MatchConfig = {
  levelId: 'sandbox',
  worldWidth: WORLD_WIDTH,
  baseHp: { player: BASE_HP, enemy: BASE_HP },
  mineGold: { player: MINE_GOLD, enemy: MINE_GOLD },
  startGold: { player: START_GOLD, enemy: START_GOLD },
  startMiners: { player: 0, enemy: 0 },
  popCap: { player: POP_CAP, enemy: POP_CAP },
  enemyAi: 'economy',
  waves: [],
  endless: false,
  difficultyMult: 1,
};

/**
 * TEMPORARY (M3): a complete playable skirmish — a base, a mine, three
 * starting miners, and enough gold to make a first choice. The enemy advances
 * with M2's stance system; M4 replaces this with level-driven data and a real
 * AI.
 *
 * The enemy's standing force is a small push to fight against, so the player
 * has something to train AGAINST rather than an empty field. Archers are listed
 * first so they spawn nearer the enemy base and end up behind the swordsmen
 * (createWorld places a smaller cursor closer to home).
 */
export const RENDER_DEMO_MATCH: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'render-demo',
  startGold: { player: 200, enemy: 200 },
  startMiners: { player: 3, enemy: 3 },
  initialUnits: {
    player: [],
    enemy: ['archer', 'archer', 'swordsman', 'swordsman', 'swordsman'],
  },
  initialStance: 'advance',
};

/** TEMPORARY (M3): fixed seed for the render demo, so screenshots are repeatable. */
export const RENDER_DEMO_SEED = 20260926;

/**
 * Level 1 (tutorial) — spec §8.4.
 *
 * The enemy has NO economy: its entire force is scripted. That is deliberate,
 * and it is the cheapest way to teach "manage the line, not the bank" — the
 * player faces a predictable, mounting attack with no enemy economy to model.
 *
 * The enemy base is half strength (1500 vs 3000) so the tutorial can be won
 * before the player has learned to mass an army. `enemyAi: 'scripted'` is what
 * makes cleanupSystem refuse to call an empty enemy field a victory while
 * waves remain — otherwise this level would be won on tick 1.
 *
 * Wave ticks come from `toTicks(seconds)`, never from hand-written tick counts:
 * data tables are written in seconds and converted exactly once (spec §5.1).
 */
export const LEVEL_1: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'level-1',
  baseHp: { player: BASE_HP, enemy: 1500 },
  startGold: { player: START_GOLD, enemy: 0 },
  startMiners: { player: 3, enemy: 0 },
  initialUnits: { player: [], enemy: [] },
  enemyAi: 'scripted',
  waves: [
    { atTick: toTicks(5), units: ['swordsman', 'swordsman'] },
    { atTick: toTicks(50), units: ['swordsman', 'swordsman', 'swordsman', 'archer'] },
    {
      atTick: toTicks(110),
      units: ['swordsman', 'swordsman', 'swordsman', 'swordsman', 'archer', 'archer', 'spearman'],
    },
    {
      atTick: toTicks(180),
      units: [
        'swordsman', 'swordsman', 'swordsman', 'swordsman',
        'archer', 'archer', 'spearman', 'spearman',
      ],
    },
  ],
};

/** Positions used by createWorld. Kept here so geometry has one source of truth. */
export const BASE_X = { player: PLAYER_BASE_X, enemy: ENEMY_BASE_X } as const;
export const MINE_X = { player: PLAYER_MINE_X, enemy: ENEMY_MINE_X } as const;
