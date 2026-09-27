import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import { canQueue } from './training';
import { DEFAULT_MATCH } from '../data/levels';
import { BASE_RADIUS, POP_CAP } from '../data/constants';
import { UNITS } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import type { Command, MatchConfig } from './types';

/**
 * spec §11 M3 acceptance, as executable criteria.
 *
 * Does NOT assert balance: whether the economy feels right is a tuning
 * question the harness answers. M3 only has to prove the loops close and the
 * results stay reproducible.
 */

const ECONOMY_MATCH: MatchConfig = {
  ...DEFAULT_MATCH,
  startGold: { player: 200, enemy: 200 },
  startMiners: { player: 1, enemy: 0 },
  initialUnits: { player: [], enemy: [] },
  initialStance: 'hold',
};

describe('M3 acceptance 1: the economy closes', () => {
  it('grows gold past 220 within 600 ticks with one miner', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    for (let i = 0; i < 600; i++) step(world, []);
    // Round trip: ~190px out + 90 ticks mining + ~190px back = ~252 ticks, so
    // two trips need ~504 and the second completes inside the window.
    expect(world.gold.player).toBeGreaterThanOrEqual(220);
  });

  it('keeps growing between 600 and 800 ticks', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    for (let i = 0; i < 800; i++) step(world, []);
    expect(world.gold.player).toBeGreaterThanOrEqual(240);
  });

  it('never produces gold without a miner', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startMiners: { player: 0, enemy: 0 } }, 1);
    for (let i = 0; i < 800; i++) step(world, []);
    expect(world.gold.player).toBe(200);
  });

  it('depletes the seam as gold is produced', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    for (let i = 0; i < 800; i++) step(world, []);
    expect(world.mines.player.goldLeft).toBeLessThan(6000);
  });

  it('loses the load when the miner dies in transit', () => {
    // Review Focus #4: a miner killed on the way home is a real economic loss.
    const world = createWorld(ECONOMY_MATCH, 1);
    // Run until the miner is carrying.
    for (let i = 0; i < 400 && world.units[0].carrying === 0; i++) step(world, []);
    const carrier = world.units.find((u) => u.carrying > 0);
    if (carrier) {
      const goldBefore = world.gold.player;
      carrier.state = 'dead';
      carrier.hp = 0;
      step(world, []);
      // The seam already lost the gold; the treasury never gains it.
      expect(world.gold.player).toBe(goldBefore);
      expect(world.mines.player.goldLeft).toBeLessThan(6000);
    }
  });
});

describe('M3 acceptance 2: training closes', () => {
  it('spends gold at order time and spawns after trainTime', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 500, enemy: 0 } }, 1);
    const cmd: Command = { kind: 'train', side: 'player', typeId: 'swordsman' };

    step(world, [cmd]);
    expect(world.gold.player).toBe(400);

    const before = world.units.filter((u) => u.side === 'player' && u.typeId === 'swordsman').length;
    for (let i = 0; i < UNIT_TICKS.swordsman.trainTime; i++) step(world, []);
    const after = world.units.filter((u) => u.side === 'player' && u.typeId === 'swordsman').length;
    expect(after).toBe(before + 1);
  });

  it('refuses an order it cannot afford and spends nothing', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 10, enemy: 0 } }, 1);
    step(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]);
    expect(world.gold.player).toBe(10);
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('refuses an order at the population cap and spends nothing', () => {
    // Review Focus #3. The cap is reached with REAL units: economySystem
    // recomputes popUsed from living units every tick, so pre-setting the
    // counter would be erased before commandsSystem read it.
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 500, enemy: 0 } }, 1);
    world.popCap.player = 1;
    // One existing unit fills the cap of 1.
    expect(world.units.filter((u) => u.side === 'player')).toHaveLength(1);
    world.popUsed.player = 1;

    step(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]);
    expect(world.gold.player).toBe(500);
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('keeps population accurate as units spawn', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 500, enemy: 0 } }, 1);
    const before = world.popUsed.player;
    step(world, [{ kind: 'train', side: 'player', typeId: 'miner' }]);
    for (let i = 0; i < UNIT_TICKS.miner.trainTime + 1; i++) step(world, []);
    expect(world.popUsed.player).toBe(before + 1);
  });

  it('reports the cap through canQueue so the HUD can grey the button', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    world.popCap.player = 1;
    world.popUsed.player = 1;
    const check = canQueue(world, 'player', 'swordsman');
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('pop');
  });
});

describe('M3 acceptance 3: commands close', () => {
  it('applies a stance change on the tick it is issued', () => {
    const world = createWorld(
      {
        ...ECONOMY_MATCH,
        initialUnits: { player: ['swordsman'], enemy: [] },
        initialStance: 'hold',
      },
      1,
    );
    const unit = world.units[0];
    expect(unit.stance).toBe('hold');
    step(world, [{ kind: 'setStance', side: 'player', unitIds: [unit.id], stance: 'retreat' }]);
    expect(unit.stance).toBe('retreat');
  });

  it('changes behaviour, not just the field', () => {
    const world = createWorld(
      {
        ...ECONOMY_MATCH,
        initialUnits: { player: ['swordsman'], enemy: [] },
        initialStance: 'hold',
      },
      1,
    );
    const unit = world.units[0];
    unit.x = 800;
    unit.prevX = 800;

    // Holding: stays put.
    for (let i = 0; i < 10; i++) step(world, []);
    expect(unit.x).toBe(800);

    step(world, [{ kind: 'setStance', side: 'player', unitIds: [unit.id], stance: 'retreat' }]);
    for (let i = 0; i < 20; i++) step(world, []);
    expect(unit.x).toBeLessThan(800);
  });

  it('ignores a stance command aimed at the other side', () => {
    const world = createWorld(
      {
        ...ECONOMY_MATCH,
        startMiners: { player: 0, enemy: 0 },
        initialUnits: { player: [], enemy: ['swordsman'] },
        initialStance: 'hold',
      },
      1,
    );
    // createWorld iterates player-then-enemy, but with an empty player roster
    // the single unit is the enemy's. Find it by side rather than by index.
    const enemyUnit = world.units.find((u) => u.side === 'enemy');
    expect(enemyUnit).toBeDefined();
    step(world, [
      { kind: 'setStance', side: 'player', unitIds: [enemyUnit!.id], stance: 'retreat' },
    ]);
    expect(enemyUnit!.stance).toBe('hold');
  });
});

describe('M3 acceptance 4: determinism survives commands', () => {
  /** Runs a scripted match, delivering each command on its scripted TICK. */
  function scriptedRun(ticksPerFrame: number): string {
    const world = createWorld(
      {
        ...ECONOMY_MATCH,
        startGold: { player: 500, enemy: 500 },
        startMiners: { player: 2, enemy: 2 },
      },
      31337,
    );
    const script: Record<number, Command[]> = {
      1: [{ kind: 'train', side: 'player', typeId: 'swordsman' }],
      120: [{ kind: 'train', side: 'enemy', typeId: 'archer' }],
      200: [{ kind: 'setStance', side: 'player', unitIds: [], stance: 'advance' }],
      400: [{ kind: 'train', side: 'player', typeId: 'miner' }],
    };

    let done = 0;
    while (done < 900) {
      const batch = Math.min(ticksPerFrame, 900 - done);
      for (let i = 0; i < batch; i++) {
        // Keyed by ABSOLUTE tick, not by position within the frame. What is
        // under test here is that the same tick sequence plus the same
        // per-tick commands yields the same state; how commands group into
        // frames is a separate concern covered by the speed tests, and is
        // deliberately NOT asserted to be equivalent (a frame boundary moves
        // with the frame rate, so a command scripted at tick 1 genuinely does
        // not arrive on a frame boundary at 4 ticks per frame).
        const tick = done + i;
        step(world, script[tick] ?? []);
      }
      done += batch;
    }
    return hashWorld(world);
  }

  it('is reproducible at 1 tick per frame', () => {
    expect(scriptedRun(1)).toBe(scriptedRun(1));
  });

  it('is unaffected by how the ticks are grouped into frames', () => {
    // Same tick sequence, same per-tick commands, different batching: the state
    // must be identical, because `step` is the only thing that advances the sim.
    expect(scriptedRun(4)).toBe(scriptedRun(1));
  });

  it('differs for a different seed', () => {
    const a = createWorld(ECONOMY_MATCH, 1);
    const b = createWorld(ECONOMY_MATCH, 2);
    for (let i = 0; i < 300; i++) {
      step(a, []);
      step(b, []);
    }
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('M3 sanity', () => {
  it('does not throw over a long quiet match', () => {
    const world = createWorld(ECONOMY_MATCH, 5);
    expect(() => {
      for (let i = 0; i < 3000; i++) step(world, []);
    }).not.toThrow();
  });

  it('keeps every unit inside the world', () => {
    const world = createWorld(ECONOMY_MATCH, 5);
    for (let i = 0; i < 1500; i++) step(world, []);
    for (const u of world.units) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(world.worldWidth);
    }
  });

  it('never produces negative gold or population', () => {
    const world = createWorld(ECONOMY_MATCH, 5);
    for (let i = 0; i < 1500; i++) step(world, []);
    expect(world.gold.player).toBeGreaterThanOrEqual(0);
    expect(world.popUsed.player).toBeGreaterThanOrEqual(0);
  });

  it('never exceeds the population cap', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 5000, enemy: 0 } }, 5);
    for (let i = 0; i < 1200; i++) {
      step(world, [{ kind: 'train', side: 'player', typeId: 'miner' }]);
    }
    expect(world.popUsed.player).toBeLessThanOrEqual(world.popCap.player);
  });

  it('exposes the constants the acceptance criteria are written against', () => {
    expect(BASE_RADIUS).toBe(40);
    expect(UNITS.miner.carryCapacity).toBe(20);
    expect(POP_CAP).toBe(60);
    expect(canQueue(createWorld(ECONOMY_MATCH, 1), 'player', 'swordsman').ok).toBe(true);
  });
});

