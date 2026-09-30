import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import type { MatchConfig, Side } from './types';

/** A base-condition economy match: the enemy has an economy and can rebuild. */
function baseMatch(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'win-probe',
    winCondition: 'base',
    startGold: { player: 200, enemy: 200 },
    startMiners: { player: 1, enemy: 1 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
    ...over,
  };
}

const kill = (world: ReturnType<typeof createWorld>, side: Side) => {
  for (const u of world.units) {
    if (u.side === side) {
      u.state = 'dead';
      u.hp = 0;
    }
  }
};

describe("winCondition: 'base'", () => {
  it('does NOT declare a win when the enemy is out of units but its base stands', () => {
    const world = createWorld(baseMatch(), 1);
    step(world, []);
    kill(world, 'enemy');
    step(world, []);
    expect(world.outcome, 'an empty enemy field is not victory under base rules').toBe('ongoing');
  });

  it('declares a win when the enemy base falls', () => {
    const world = createWorld(baseMatch(), 1);
    world.bases.enemy.hp = 0;
    step(world, []);
    expect(world.outcome).toBe('playerWin');
  });

  it('declares a LOSS immediately when the player is out of units', () => {
    // No comeback mechanic exists, so a wiped player is defeated even though
    // its base still stands. Pretending otherwise would show a "you can still
    // win" state that has no way to resolve.
    const world = createWorld(baseMatch(), 1);
    step(world, []);
    kill(world, 'player');
    step(world, []);
    expect(world.outcome).toBe('playerLose');
  });

  it('declares a LOSS when the player base falls', () => {
    const world = createWorld(baseMatch(), 1);
    world.bases.player.hp = 0;
    step(world, []);
    expect(world.outcome).toBe('playerLose');
  });

  it('does not win merely because the enemy field is empty at the start', () => {
    const world = createWorld(baseMatch(), 1);
    for (let i = 0; i < 30; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });
});

describe("winCondition: 'annihilation' (the default)", () => {
  it('declares a win as soon as the enemy is out of units', () => {
    const world = createWorld(baseMatch({ winCondition: 'annihilation' }), 1);
    step(world, []);
    kill(world, 'enemy');
    step(world, []);
    expect(world.outcome).toBe('playerWin');
  });

  it('is what an unspecified config gets', () => {
    const world = createWorld({ ...DEFAULT_MATCH, levelId: 'default-probe' }, 1);
    expect(world.winCondition).toBe('annihilation');
  });

  it('still suppresses annihilation while waves are pending', () => {
    // M4a's rule must survive the new dispatch, or level 1 breaks again.
    const world = createWorld(
      baseMatch({
        winCondition: 'annihilation',
        waves: [{ atTick: 300, units: ['swordsman'] }],
      }),
      1,
    );
    step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('never lets ENDLESS be won by clearing the field', () => {
    const world = createWorld(baseMatch({ winCondition: 'annihilation', endless: true }), 1);
    for (let i = 0; i < 30; i++) step(world, []);
    expect(world.outcome).not.toBe('playerWin');
  });

  it('is still suppressed by a pending wave under ENDLESS', () => {
    const world = createWorld(
      baseMatch({ winCondition: 'annihilation', endless: true, waves: [] }),
      1,
    );
    for (let i = 0; i < 60; i++) step(world, []);
    expect(world.outcome).not.toBe('playerWin');
  });
});

describe('winCondition — the player side is unconditional', () => {
  it('loses when wiped even under base rules, with a wave still due', () => {
    // The player's defeat must not be deferrable by any enemy-side rule.
    const world = createWorld(
      baseMatch({ winCondition: 'base', waves: [{ atTick: 3000, units: ['swordsman'] }] }),
      1,
    );
    step(world, []);
    kill(world, 'player');
    step(world, []);
    expect(world.outcome).toBe('playerLose');
  });
});
