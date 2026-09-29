/**
 * The tactical layer (spec §9.1): "what to build, whether to push".
 *
 * It produces the SAME `Command` type the player's input produces, so the AI is
 * literally pressing the player's buttons. That is what makes it fair — it has
 * no capability the player lacks — and it is why the difficulty lever is just
 * the profile's numbers rather than a separate code path.
 *
 * Pure: reads the world, returns commands, mutates nothing. The caller
 * (commandsSystem) feeds the result through the ordinary command pipeline.
 */

import { canQueue } from './training';
import type { AiProfile } from './ai-profile';
import type { Command, Side, UnitTypeId, World } from './types';

/** Combat units only — miners are governed by `minerTarget`, not the posture. */
function combatUnits(world: World, side: Side) {
  return world.units.filter(
    (u) => u.side === side && u.typeId !== 'miner' && u.state !== 'dead' && u.hp > 0,
  );
}

/**
 * How many of a type this side has ALIVE plus IN FLIGHT. The build order cycles
 * by buying whichever type it has the fewest of, which reaches the profile's
 * ratio in steady state without storing a cursor on the world (a cursor would
 * need hashing, and would drift when units die).
 *
 * Counting the queue is NOT optional: `minerTarget` is checked against this, and
 * a miner takes 5 seconds to train. Counting only the field made the AI queue
 * another miner on every decision while the first four were still in training —
 * it spent its entire opening bankroll on seven miners and never built a single
 * soldier, so it lost every level without ever fighting.
 */
function ownedCount(world: World, side: Side, typeId: UnitTypeId): number {
  let n = 0;
  for (const u of world.units) {
    if (u.side === side && u.typeId === typeId && u.state !== 'dead' && u.hp > 0) n += 1;
  }
  for (const order of world.trainingQueue[side]) {
    if (order.typeId === typeId) n += 1;
  }
  return n;
}

/** The next combat unit to buy: the build-order entry this side has the fewest of. */
function nextBuildType(world: World, side: Side, profile: AiProfile): UnitTypeId | null {
  let best: UnitTypeId | null = null;
  let bestCount = Infinity;
  for (const typeId of profile.buildOrder) {
    const n = ownedCount(world, side, typeId);
    if (n < bestCount) {
      bestCount = n;
      best = typeId;
    }
  }
  return best;
}

/** The posture this side should be in, from raw unit counts (Q8). */
function desiredStance(world: World, side: Side, profile: AiProfile): 'advance' | 'hold' | 'retreat' {
  const mine = combatUnits(world, side).length;
  const theirs = combatUnits(world, side === 'player' ? 'enemy' : 'player').length;

  // No army at all: there is nothing to posture, and the caller emits nothing.
  if (mine === 0) return 'hold';
  // No enemy army in sight: push, or the game stalls in the middle of the field.
  if (theirs === 0) return 'advance';
  if (mine <= theirs * profile.retreatRatio) return 'retreat';
  if (mine >= theirs * profile.advanceRatio) return 'advance';
  return 'hold';
}

/**
 * The commands this side's tactical layer wants to issue this tick.
 *
 * Returns [] on every tick that is not a decision tick. Emitting every tick
 * would re-issue the same orders 30 times a second: the stance order would be
 * harmless but wasteful, and the train order would be re-checked against gold
 * on every tick for no reason.
 */
export function decideCommands(world: World, side: Side, profile: AiProfile): Command[] {
  const interval = profile.decisionIntervalTicks;
  if (interval <= 0) return [];
  if (world.tick % interval !== 0) return [];

  const commands: Command[] = [];

  // 1. Economy first: miners pay for everything else. While under the miner
  //    target gold goes to miners rather than soldiers, which is what makes the
  //    opening a real ramp instead of a rush. This gates only the ARMY PURCHASE
  //    below — posture must still be issued, or an army that already exists
  //    would stand on `hold` for the whole ramp while the enemy walks in.
  const rampingEconomy = ownedCount(world, side, 'miner') < profile.minerTarget;
  if (rampingEconomy) {
    if (canQueue(world, side, 'miner').ok) {
      commands.push({ kind: 'train', side, typeId: 'miner' });
    }
  } else {
    // 2. Army: one unit per decision, cycling the build order.
    const next = nextBuildType(world, side, profile);
    if (next !== null && canQueue(world, side, next).ok) {
      commands.push({ kind: 'train', side, typeId: next });
    }
  }

  // 3. Posture: address COMBAT units only. A stance order that included miners
  //    would freeze the economy — movementSystem returns early for 'hold'.
  const army = combatUnits(world, side);
  if (army.length > 0) {
    commands.push({
      kind: 'setStance',
      side,
      unitIds: army.map((u) => u.id),
      stance: desiredStance(world, side, profile),
    });
  }

  return commands;
}
