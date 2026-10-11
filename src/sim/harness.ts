/**
 * Headless balance harness (spec §9.3).
 *
 * Runs a complete match with no rendering, as fast as the CPU allows, and
 * reports who won and at what cost. This is the payoff for the pure-sim
 * architecture: tuning a unit used to mean minutes of manual play; it now
 * means a few hundred milliseconds of batch runs with reproducible results.
 *
 * Pure function — no I/O, no Phaser, no clock. Safe to call from tests, and
 * from a Node CLI in M5 when tuning the endless-mode difficulty curve.
 */

import { DEFAULT_MATCH } from '../data/levels';
import { UNITS, type UnitTypeId } from '../data/units';
import { PLAYER_REFERENCE } from './ai-profile';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { decideCommands } from './tactic';
import { step } from './tick';
import type { Command, MatchConfig, Outcome, Side } from './types';

/** Generous ceiling: 6000 ticks is 3.3 minutes of game time. */
export const DEFAULT_MAX_TICKS = 6000;

/** How far apart allies are placed, in px. Lets a scenario build tight formations. */
const DEFAULT_SPACING = 40;

export interface Scenario {
  name: string;
  player: Partial<Record<UnitTypeId, number>>;
  enemy: Partial<Record<UnitTypeId, number>>;
  /** Gap between same-side units at spawn. Default 40. */
  spacing?: number;
  /** Whether to include bases. Default true. */
  withBases?: boolean;
}

export interface ScenarioResult {
  name: string;
  winner: 'player' | 'enemy' | 'draw';
  ticks: number;
  survivors: Record<Side, number>;
  damageDealt: Record<Side, number>;
  /** Number of same-side adjacent pairs closer than the sum of their radii. */
  finalOverlapViolations: number;
  hash: string;
}

export function runScenario(
  scenario: Scenario,
  seed: number,
  maxTicks: number = DEFAULT_MAX_TICKS,
): ScenarioResult {
  const config = buildConfig(scenario);
  const world = createWorld(config, seed);

  let ticks = 0;
  while (world.outcome === 'ongoing' && ticks < maxTicks) {
    step(world, []);
    ticks += 1;
  }

  const survivors: Record<Side, number> = {
    player: world.units.filter((u) => u.side === 'player').length,
    enemy: world.units.filter((u) => u.side === 'enemy').length,
  };

  return {
    name: scenario.name,
    winner: toWinner(world.outcome),
    ticks,
    survivors,
    damageDealt: {
      player: world.stats.player.damageDealt,
      enemy: world.stats.enemy.damageDealt,
    },
    finalOverlapViolations: countOverlaps(world.units),
    hash: hashWorld(world),
  };
}

function toWinner(outcome: string): 'player' | 'enemy' | 'draw' {
  if (outcome === 'playerWin') return 'player';
  if (outcome === 'playerLose') return 'enemy';
  return 'draw';
}

/** A whole-match result: the outcome plus how it got there. */
export interface MatchResult {
  outcome: Outcome;
  ticks: number;
  hash: string;
  survivors: Record<Side, number>;
  /** How many scripted waves had spawned by the end. */
  wavesSpawned: number;
  /**
   * Final HP of each base. Lets a test tell "destroyed the base" apart from
   * "cleared the field", which matters once a level is won by the former.
   */
  baseHp: Record<Side, number>;
}

/**
 * Runs a complete level with BOTH sides driven by the tactical layer.
 *
 * `playerProfile` names the profile for the player's side: 'reference' for the
 * competent-player proxy, 'none' for a player who does nothing. This is what
 * makes "the level is winnable" a deterministic assertion rather than a claim
 * about human skill (spec §11's M4 acceptance).
 *
 * The enemy's own tactical layer comes from the level's `enemyAi` via
 * createWorld, so a scripted level is driven purely by its waves.
 */
export function runMatch(
  config: MatchConfig,
  seed: number,
  playerProfile: 'reference' | 'none',
  maxTicks: number = DEFAULT_MAX_TICKS * 2,
): MatchResult {
  const world = createWorld(config, seed);

  let ticks = 0;
  while (world.outcome === 'ongoing' && ticks < maxTicks) {
    const commands: Command[] =
      playerProfile === 'reference' ? decideCommands(world, 'player', PLAYER_REFERENCE) : [];
    step(world, commands);
    ticks += 1;
  }

  return {
    outcome: world.outcome,
    ticks,
    hash: hashWorld(world),
    survivors: {
      player: world.units.filter((u) => u.side === 'player').length,
      enemy: world.units.filter((u) => u.side === 'enemy').length,
    },
    wavesSpawned: world.waveIndex,
    baseHp: { player: world.bases.player.hp, enemy: world.bases.enemy.hp },
  };
}

/**
 * Expands a roster into an explicit list of unit ids.
 *
 * RANGED FIRST, then melee. createWorld places units at
 * `BASE_X + dir * (SPAWN_OFFSET + cursor)`, so a smaller cursor lands nearer
 * the base. Listing ranged first therefore puts archers in the BACK rank and
 * melee in front — the screen the whole R1/R2 design depends on. Listing melee
 * first would present archers to the enemy and silently make the "screened"
 * scenario measure the opposite of what it claims.
 */
function expandRoster(roster: Partial<Record<UnitTypeId, number>>): UnitTypeId[] {
  const order: UnitTypeId[] = ['archer', 'miner', 'spearman', 'swordsman'];
  const out: UnitTypeId[] = [];
  for (const typeId of order) {
    const count = roster[typeId] ?? 0;
    for (let i = 0; i < count; i++) out.push(typeId);
  }
  return out;
}

function buildConfig(scenario: Scenario): MatchConfig {
  const playerUnits = expandRoster(scenario.player);
  const enemyUnits = expandRoster(scenario.enemy);

  return {
    ...DEFAULT_MATCH,
    levelId: `harness:${scenario.name}`,
    startMiners: { player: 0, enemy: 0 },
    initialUnits: { player: playerUnits, enemy: enemyUnits },
    initialSpacing: scenario.spacing ?? DEFAULT_SPACING,
    // Bases stay alive even when the scenario does not want them. Setting hp
    // to 0 would trip cleanupSystem's "base fell" condition on tick 1 and end
    // every base-less matchup instantly; instead createWorld parks them
    // off-map, where no unit can reach them.
    noBases: scenario.withBases === false,
    // The harness measures PURE UNIT MATCHUPS, so the enemy must not run a
    // tactical layer: an AI that bought reinforcements or re-issued stance
    // orders mid-fight would make a scenario measure its own profile instead of
    // the unit stats the scenario is about.
    enemyAi: 'scripted',
    waves: [],
  };
}

/** Counts same-side adjacent pairs that are closer than the sum of their radii. */
function countOverlaps(units: { side: Side; x: number; typeId: UnitTypeId }[]): number {
  let violations = 0;
  for (const side of ['player', 'enemy'] as const) {
    const sorted = units
      .filter((u) => u.side === side)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const minGap =
        UNITS[sorted[i - 1].typeId].bodyRadius + UNITS[sorted[i].typeId].bodyRadius;
      if (sorted[i].x - sorted[i - 1].x < minGap - 0.5) violations += 1;
    }
  }
  return violations;
}
