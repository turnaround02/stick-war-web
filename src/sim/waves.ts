/**
 * Scripted wave spawning (spec §8.4).
 *
 * A scripted level's enemy has no economy: its whole force arrives through this
 * table. That is a deliberate design for the tutorial level — it moves the
 * player's attention from "manage the economy" to "manage the line" without
 * costing an AI.
 *
 * Waves spawn on ADVANCE. The spec's level-1 table reads as a mounting attack
 * (two swordsmen at 5s, a mixed group at 50s, more at 110s), so `advance` is
 * the only posture that matches its description. A per-wave stance field would
 * be a knob with no user.
 */

import { spawnUnit } from './spawn';
import { findSpawnX } from './training';
import type { Stance, World } from './types';

/** Posture for wave units. See the file comment for why it is not configurable. */
export const WAVE_STANCE: Stance = 'advance';

/**
 * Spawns the next wave if it is due. At most ONE wave per call, so a long frame
 * at 4x cannot collapse two waves onto the same tick — which would double the
 * enemy's local density and change the fight.
 */
export function advanceWaves(world: World): void {
  if (world.waveIndex >= world.waves.length) return;

  const wave = world.waves[world.waveIndex];
  if (world.tick < wave.atTick) return;

  for (const typeId of wave.units) {
    // findSpawnX walks outward from the enemy base front until it finds a clear
    // spot, so a wave never buries a unit inside an existing one.
    const x = findSpawnX(world, 'enemy', typeId);
    world.units.push(
      spawnUnit({ id: world.nextUnitId++, side: 'enemy', typeId, x, stance: WAVE_STANCE }),
    );
  }

  world.waveIndex += 1;
}
