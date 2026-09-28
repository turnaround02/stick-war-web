import { describe, it, expect } from 'vitest';
import { decideCommands } from './tactic';
import { ENEMY_STANDARD, PLAYER_REFERENCE, type AiProfile } from './ai-profile';
import { createWorld } from './createWorld';
import { spawnUnit } from './spawn';
import { queueUnit, advanceTrainingQueue } from './training';
import { DEFAULT_MATCH } from '../data/levels';
import type { Command, MatchConfig, Side, UnitTypeId, World } from './types';

/** A world with both sides' starting miners and no initial army. */
function economyMatch(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'tactic-probe',
    startGold: { player: 500, enemy: 500 },
    startMiners: { player: 1, enemy: 1 },
    initialUnits: { player: [], enemy: [] },
    initialStance: 'hold',
    ...over,
  };
}

/** Puts `n` combat units of `typeId` on a side, so posture rules can be probed. */
function withArmy(world: World, side: Side, typeId: UnitTypeId, n: number): void {
  const x = side === 'player' ? 400 : 2600;
  for (let i = 0; i < n; i++) {
    world.units.push(spawnUnit({ id: world.nextUnitId++, side, typeId, x, stance: 'hold' }));
  }
}

/** Runs one decision tick. `tick` must be a multiple of the interval. */
function decideAt(world: World, tick: number, profile: AiProfile, side: Side = 'enemy') {
  world.tick = tick;
  return decideCommands(world, side, profile);
}

const trains = (cmds: Command[]) => cmds.filter((c) => c.kind === 'train');
const stanceOf = (cmds: Command[]) => {
  const c = cmds.find((x) => x.kind === 'setStance');
  return c?.kind === 'setStance' ? c.stance : undefined;
};
const stanceCmd = (cmds: Command[]) => cmds.find((x) => x.kind === 'setStance');

const INTERVAL = ENEMY_STANDARD.decisionIntervalTicks;

describe('decideCommands — decision cadence', () => {
  it('produces nothing between decision ticks', () => {
    // Review Focus #5: emitting every tick would re-issue 30 orders a second,
    // re-checking gold each time for no benefit.
    const world = createWorld(economyMatch(), 1);
    expect(decideAt(world, 1, ENEMY_STANDARD)).toEqual([]);
    expect(decideAt(world, INTERVAL - 1, ENEMY_STANDARD)).toEqual([]);
    expect(decideAt(world, INTERVAL + 1, ENEMY_STANDARD)).toEqual([]);
  });

  it('produces commands on a decision tick', () => {
    const world = createWorld(economyMatch(), 1);
    expect(decideAt(world, INTERVAL, ENEMY_STANDARD).length).toBeGreaterThan(0);
  });

  it('treats tick 0 as a decision tick', () => {
    const world = createWorld(economyMatch(), 1);
    expect(decideAt(world, 0, ENEMY_STANDARD).length).toBeGreaterThan(0);
  });
});

describe('decideCommands — economy first', () => {
  it('trains a miner while below the profile target', () => {
    const world = createWorld(economyMatch(), 1);
    expect(trains(decideAt(world, INTERVAL, ENEMY_STANDARD)).map((c) => c.typeId)).toContain(
      'miner',
    );
  });

  it('stops training miners at the target', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'miner', ENEMY_STANDARD.minerTarget);
    const cmds = decideAt(world, INTERVAL, ENEMY_STANDARD);
    expect(trains(cmds).map((c) => c.typeId)).not.toContain('miner');
  });

  it('trains exactly one unit per decision', () => {
    // Two per decision would double the rate the profile was tuned for.
    const world = createWorld(economyMatch(), 1);
    expect(trains(decideAt(world, INTERVAL, ENEMY_STANDARD))).toHaveLength(1);
  });

  it('only ever issues commands for its own side', () => {
    const world = createWorld(economyMatch(), 1);
    for (const c of decideAt(world, INTERVAL, ENEMY_STANDARD)) expect(c.side).toBe('enemy');
    for (const c of decideAt(world, INTERVAL, PLAYER_REFERENCE, 'player')) expect(c.side).toBe('player');
  });

  it('asks for nothing it cannot afford', () => {
    const world = createWorld(economyMatch({ startGold: { player: 0, enemy: 0 } }), 1);
    // Every train command must be acceptable to the queue.
    for (const c of trains(decideAt(world, INTERVAL, ENEMY_STANDARD))) {
      if (c.kind === 'train') expect(world.gold.enemy).toBeGreaterThanOrEqual(0);
    }
    expect(trains(decideAt(world, INTERVAL, ENEMY_STANDARD))).toEqual([]);
  });
});

describe('decideCommands — army composition', () => {
  it('trains combat units once the miner target is met', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'miner', ENEMY_STANDARD.minerTarget);
    const cmds = trains(decideAt(world, INTERVAL, ENEMY_STANDARD));
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind === 'train' && cmds[0].typeId).not.toBe('miner');
  });

  it('cycles the build order so the composition matches the profile ratio', () => {
    // Drive many decisions through the REAL queue so counts accumulate, then
    // check the profile's units come out evenly — that is what "ratio" means.
    const world = createWorld(economyMatch({ startGold: { player: 0, enemy: 100000 } }), 1);
    withArmy(world, 'enemy', 'miner', ENEMY_STANDARD.minerTarget);

    const bought: Record<string, number> = {};
    for (let d = 0; d < 40; d++) {
      world.tick = d * INTERVAL;
      for (const c of decideCommands(world, 'enemy', ENEMY_STANDARD)) {
        if (c.kind !== 'train') continue;
        if (queueUnit(world, 'enemy', c.typeId)) {
          bought[c.typeId] = (bought[c.typeId] ?? 0) + 1;
        }
        // Complete it immediately so popUsed tracks and counts grow.
        while (world.trainingQueue.enemy.length > 0) advanceTrainingQueue(world, 'enemy');
      }
      world.gold.enemy = 100000;
    }

    // Every combat type in the build order must have been bought, and the
    // spread must be at most 1 — a "cycle the rarest" rule in steady state.
    const counts = ENEMY_STANDARD.buildOrder.map((t) => bought[t] ?? 0);
    expect(counts.every((n) => n > 0), `bought ${JSON.stringify(bought)}`).toBe(true);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('never asks for more than the population cap allows', () => {
    const world = createWorld(economyMatch(), 1);
    world.popCap.enemy = 2;
    world.popUsed.enemy = 2;
    expect(trains(decideAt(world, INTERVAL, ENEMY_STANDARD))).toEqual([]);
  });
});

describe('decideCommands — posture', () => {
  it('advances when it has the larger army', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 6);
    withArmy(world, 'player', 'swordsman', 2);
    expect(stanceOf(decideAt(world, INTERVAL, ENEMY_STANDARD))).toBe('advance');
  });

  it('holds when the armies are close', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 3);
    withArmy(world, 'player', 'swordsman', 6);
    expect(stanceOf(decideAt(world, INTERVAL, ENEMY_STANDARD))).toBe('hold');
  });

  it('retreats when badly outnumbered', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 1);
    withArmy(world, 'player', 'swordsman', 8);
    expect(stanceOf(decideAt(world, INTERVAL, ENEMY_STANDARD))).toBe('retreat');
  });

  it('advances when the enemy has no army at all', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 1);
    expect(stanceOf(decideAt(world, INTERVAL, ENEMY_STANDARD))).toBe('advance');
  });

  it('addresses its own combat units only, never miners', () => {
    // A stance order aimed at miners would freeze the economy: movementSystem
    // returns early for 'hold', and aiSystem derives a miner's stance from its
    // job except for 'retreat'.
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 4);
    const cmd = stanceCmd(decideAt(world, INTERVAL, ENEMY_STANDARD));
    expect(cmd?.kind).toBe('setStance');
    if (cmd?.kind !== 'setStance') return;

    const minerIds = new Set(world.units.filter((u) => u.typeId === 'miner').map((u) => u.id));
    expect(minerIds.size).toBeGreaterThan(0);
    for (const id of cmd.unitIds) expect(minerIds.has(id)).toBe(false);
  });

  it('lists every combat unit it owns', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 3);
    withArmy(world, 'enemy', 'archer', 2);
    const cmd = stanceCmd(decideAt(world, INTERVAL, ENEMY_STANDARD));
    if (cmd?.kind !== 'setStance') throw new Error('expected a stance order');
    expect(cmd.unitIds).toHaveLength(5);
  });

  it('emits no stance order when it has no combat units', () => {
    const world = createWorld(economyMatch(), 1);
    expect(stanceCmd(decideAt(world, INTERVAL, ENEMY_STANDARD))).toBeUndefined();
  });

  it('ignores dead units when counting and addressing', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 4);
    // Kill a COMBAT unit — killing a miner must not change the army count, and
    // that is a different assertion (covered by the "never addresses miners").
    const dead = world.units.find((u) => u.side === 'enemy' && u.typeId === 'swordsman')!;
    dead.state = 'dead';
    dead.hp = 0;
    const cmd = stanceCmd(decideAt(world, INTERVAL, ENEMY_STANDARD));
    if (cmd?.kind !== 'setStance') throw new Error('expected a stance order');
    expect(cmd.unitIds).toHaveLength(3);
    expect(cmd.unitIds).not.toContain(dead.id);
  });
});

describe('decideCommands — purity and profiles', () => {
  it('is pure: the same world and profile give the same commands', () => {
    const world = createWorld(economyMatch(), 1);
    world.tick = INTERVAL;
    expect(decideCommands(world, 'enemy', ENEMY_STANDARD)).toEqual(
      decideCommands(world, 'enemy', ENEMY_STANDARD),
    );
  });

  it('does not mutate the world', () => {
    const world = createWorld(economyMatch(), 1);
    withArmy(world, 'enemy', 'swordsman', 3);
    world.tick = INTERVAL;
    const before = JSON.stringify(world);
    decideCommands(world, 'enemy', ENEMY_STANDARD);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('the two profiles are distinct', () => {
    expect(ENEMY_STANDARD).not.toEqual(PLAYER_REFERENCE);
  });

  it('the reference player decides at least as often as the enemy', () => {
    // Q9: the reference player must be able to WIN, so it cannot be weaker than
    // the enemy it faces.
    expect(PLAYER_REFERENCE.decisionIntervalTicks).toBeLessThanOrEqual(
      ENEMY_STANDARD.decisionIntervalTicks,
    );
    expect(PLAYER_REFERENCE.minerTarget).toBeGreaterThanOrEqual(ENEMY_STANDARD.minerTarget);
  });

  it('handles a zero interval without dividing by zero', () => {
    const world = createWorld(economyMatch(), 1);
    world.tick = 7;
    expect(decideCommands(world, 'enemy', { ...ENEMY_STANDARD, decisionIntervalTicks: 0 })).toEqual(
      [],
    );
  });
});
