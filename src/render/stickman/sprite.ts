/**
 * Phaser sprite player for the animated pixel-art strips (M15 step-2).
 *
 * Replaces the skeletal rig entirely for sprite-preferred units: walk frames
 * for move/gather, attack frames for attack (phase-mapped so the strike frame
 * lands on the damage tick — see anim.ts), the strip's first frame for
 * idle/stunned. Strips are loaded from `public/sprites-sheets/<type>-<anim>.png`
 * at BootScene preload time. If the WALK strip is missing, the whole type
 * falls back to the skeleton — the game must never show a blank unit or a
 * half-sprite type (M14's fallback rule, now per-type rather than per-frame).
 * A missing ATTACK strip degrades gracefully: the walk strip plays for
 * attack too (a lesser evil than dropping the type back to bone entirely —
 * the unit keeps its pixel look for 5/6 of its life).
 *
 * Iron rule #4: this module READS sim state (via the caller) but never writes
 * back. Iron rule #7: frame INDEX arithmetic lives in anim.ts (pure, tested);
 * this module only drives the Phaser spritesheet frames.
 */

import Phaser from 'phaser';
import type { UnitTypeId } from '../../data/units';
import type { UnitState } from '../../sim/types';
import { frameIndexFor, attackFrameIndex } from './anim';
import { UNIT_TICKS } from '../../data/unitTicks';

/** Which strip an anim state plays. Gather reuses the walk cycle. */
export function stripNameFor(state: UnitState): 'walk' | 'attack' {
  return state === 'attack' ? 'attack' : 'walk';
}

/** The texture key for a type's strip. */
export function stripKey(typeId: UnitTypeId, anim: 'walk' | 'attack'): string {
  return `strip-${typeId}-${anim}`;
}

export interface SpriteStickman {
  /** The Phaser Sprite to add to the scene. */
  obj: Phaser.GameObjects.Sprite;
  /**
   * Applies the state: picks the strip and the frame.
   *
   * `phase` is the skeletal rig's phase for the state (0..1 over the state's
   * cycle). For attack the caller also passes the raw tick counters so the
   * contact frame lands on the damage tick; the type's real windup/cooldown
   * totals are applied by the factory closure, which reads UNIT_TICKS once.
   */
  apply(
    state: UnitState,
    phase: number,
    ticks?: { windupTicksLeft: number; cooldownTicksLeft: number },
  ): void;
  /** Set the facing direction (+1 right, -1 left) by flipping. */
  setFacing(dir: 1 | -1): void;
  /** Position on the ground. `groundY` is the world-space ground line. */
  setPosition(x: number, groundY: number): void;
  destroy(): void;
}

/**
 * Creates an animated sprite stickman for the given unit type.
 *
 * Anchored at its feet: `setOrigin(0.5, 1)` puts the origin at the
 * bottom-centre of the current frame. Every frame in a strip shares one
 * common box (aligned at the ground line by the pipeline), and the walk and
 * attack strips share the same targetH — so the origin stays on the feet
 * across all frames and both strips, and switching strips never makes the
 * unit hop.
 *
 * @param scene    The owning Phaser scene.
 * @param typeId   The unit type.
 * @param groundY  The world-space Y of the ground line.
 * @returns A SpriteStickman, or `null` if the walk strip is not loaded (the
 *          attack strip alone missing degrades to walk-frames-for-attack).
 */
export function createSpriteStickman(
  scene: Phaser.Scene,
  typeId: UnitTypeId,
  groundY: number,
): SpriteStickman | null {
  const walkKey = stripKey(typeId, 'walk');
  if (!scene.textures.exists(walkKey)) {
    return null; // walk strip missing — caller falls back to the skeleton
  }
  const attackKey = stripKey(typeId, 'attack');
  const hasAttack = scene.textures.exists(attackKey);
  const t = UNIT_TICKS[typeId];

  // Depth matches the stickman containers (Phaser's default 0): both are
  // created during update(), so both land above the ground line and below
  // the selection marker (depth 6) and particles (depth 8).
  const sprite = scene.add.sprite(0, groundY, walkKey).setOrigin(0.5, 1); // anchor at feet

  return {
    obj: sprite,
    apply(state, phase, ticks) {
      if (state === 'attack' && hasAttack && ticks) {
        sprite.setTexture(attackKey);
        // The strike frame is pinned to the damage tick: windupTicksLeft === 0
        // means combatSystem is applying the blow on THIS tick.
        sprite.setFrame(
          String(attackFrameIndex(ticks.windupTicksLeft, ticks.cooldownTicksLeft, t.windup, t.attackCooldown)),
        );
        return;
      }
      sprite.setTexture(walkKey);
      // Idle/stunned hold the rest frame (phase 0); move/gather cycle the
      // walk strip. Gather has no strip of its own — the miner carries the
      // pickaxe in the walk frames by design (Q2).
      sprite.setFrame(String(frameIndexFor(phase)));
    },
    setFacing(dir: 1 | -1) {
      // The art faces right by default; flip horizontally for left.
      sprite.setFlipX(dir === -1);
    },
    setPosition(x: number, gy: number) {
      sprite.setPosition(x, gy);
    },
    destroy() {
      sprite.destroy();
    },
  };
}
