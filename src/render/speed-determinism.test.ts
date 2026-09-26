import { describe, it, expect } from 'vitest';
import { createWorld } from '../sim/createWorld';
import { hashWorld } from '../sim/hash';
import { DEFAULT_MATCH } from '../data/levels';
import { FixedTimestep, advanceWorld, STEP_MS } from './timestep';
import type { Command, MatchConfig, World } from '../sim/types';

/**
 * Speed is a RENDER-LAYER time scale (spec §7.2). It changes how MANY ticks run
 * per frame, never what a tick does — so the invariant worth testing is that
 * tick BATCHING is invisible: the same number of logic ticks must produce the
 * same state no matter how those ticks were grouped into frames.
 *
 * A note on what is deliberately NOT asserted: playing 10 seconds at 4x
 * produces a different state from 10 seconds at 1x, because it runs four times
 * as many ticks. That is what 4x means. Asserting equality there would be
 * asserting that the speed control does nothing.
 *
 * These tests drive `advanceWorld`, the SAME function BattleScene calls. A test
 * that grouped ticks into frames itself would be tautological — it would assert
 * a property of its own loop rather than of the shipping code. The command
 * tests below do fail if advanceWorld's `i === 0` guard is removed.
 */

// initialUnits only: createWorld gives it precedence over startMiners and
// `continue`s, so naming both would silently ignore the miners and the config
// would mislead the next reader.
const config: MatchConfig = {
  ...DEFAULT_MATCH,
  initialUnits: {
    player: ['archer', 'swordsman', 'swordsman'],
    enemy: ['archer', 'swordsman', 'swordsman'],
  },
};

/**
 * Drives `advanceWorld` at `fps` until at least `targetTicks` have run.
 * The frame rates used here all divide 30 Hz evenly, so the tick count lands
 * exactly on the target.
 */
function runToTick(targetTicks: number, seed: number, fps: number): World {
  const world = createWorld(config, seed);
  const timestep = new FixedTimestep();
  const delta = 1000 / fps;

  let guard = 0;
  while (world.tick < targetTicks && guard++ < 100_000) {
    advanceWorld(timestep, world, delta, 1, []);
  }
  return world;
}

describe('tick batching is invisible', () => {
  it('reaches the same state at 30 fps and 60 fps', () => {
    const a = runToTick(600, 4242, 30);
    const b = runToTick(600, 4242, 60);
    expect(a.tick).toBe(600);
    expect(b.tick).toBe(600);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });

  it('reaches the same state at 120 fps', () => {
    const a = runToTick(600, 4242, 30);
    const c = runToTick(600, 4242, 120);
    expect(c.tick).toBe(600);
    expect(hashWorld(c)).toBe(hashWorld(a));
  });

  it('holds for an odd frame rate that does not divide the tick evenly', () => {
    // 45 fps gives 0.666 ticks per frame, so the accumulator carries a
    // remainder across frames. Batching must still not matter.
    const a = runToTick(300, 99, 30);
    const b = runToTick(300, 99, 45);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });

  it('holds for a long run', () => {
    const a = runToTick(3000, 777, 30);
    const b = runToTick(3000, 777, 60);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });

  it('still differs between different seeds', () => {
    expect(hashWorld(runToTick(300, 1, 30))).not.toBe(hashWorld(runToTick(300, 2, 30)));
  });
});

describe('speed multiplies ticks without changing them', () => {
  it('runs four times as many ticks in the same number of frames at 4x', () => {
    const frames = 60;
    const delta = 1000 / 30; // exactly one tick per frame at 1x

    const slow = createWorld(config, 1);
    const slowTs = new FixedTimestep();
    const fast = createWorld(config, 1);
    const fastTs = new FixedTimestep();

    for (let i = 0; i < frames; i++) {
      advanceWorld(slowTs, slow, delta, 1, []);
      advanceWorld(fastTs, fast, delta, 4, []);
    }

    expect(fast.tick).toBe(slow.tick * 4);
  });

  it('produces the same state as an unthrottled run of the same length', () => {
    // 4x over N frames must equal 1x over 4N frames — the speed control is a
    // pure re-parameterisation of time, not a different simulation.
    const delta = 1000 / 30;

    const fast = createWorld(config, 5);
    const fastTs = new FixedTimestep();
    for (let i = 0; i < 100; i++) advanceWorld(fastTs, fast, delta, 4, []);

    const slow = createWorld(config, 5);
    const slowTs = new FixedTimestep();
    for (let i = 0; i < 400; i++) advanceWorld(slowTs, slow, delta, 1, []);

    expect(fast.tick).toBe(400);
    expect(slow.tick).toBe(400);
    expect(hashWorld(fast)).toBe(hashWorld(slow));
  });
});

describe('command delivery under speed', () => {
  /** How many orders ended up queued after one frame at the given speed. */
  function commandApplications(speed: number): number {
    const world = createWorld({ ...config, startGold: { player: 5000, enemy: 5000 } }, 1);
    const timestep = new FixedTimestep();
    const cmd: Command = { kind: 'train', side: 'player', typeId: 'miner' };

    // Two full steps of delta, so 4x runs several ticks in one frame.
    advanceWorld(timestep, world, STEP_MS * 2, speed, [cmd]);
    return world.trainingQueue.player.length;
  }

  it('applies a command exactly once regardless of speed', () => {
    // Review Focus: at 4x one frame runs several ticks, so a scene that handed
    // the commands to every tick would queue several miners for one click.
    expect(commandApplications(1)).toBe(1);
    expect(commandApplications(2)).toBe(1);
    expect(commandApplications(4)).toBe(1);
  });

  it('drains nothing on a frame that runs no ticks', () => {
    const world = createWorld({ ...config, startGold: { player: 5000, enemy: 5000 } }, 1);
    const timestep = new FixedTimestep();
    const ticks = advanceWorld(timestep, world, STEP_MS / 10, 1, [
      { kind: 'train', side: 'player', typeId: 'miner' },
    ]);
    expect(ticks).toBe(0);
    expect(world.trainingQueue.player).toHaveLength(0);
  });
});
