import type { UnitState } from '../../sim/types';

/** Joint angles in radians. 0 points down (+Y); positive rotates clockwise on screen. */
export interface Pose {
  torso: number;
  armFront: number;
  armBack: number;
  legFront: number;
  legBack: number;
  /** Weapon angle relative to the front arm. */
  weapon: number;
}

export const IDLE_POSE: Pose = {
  torso: 0,
  armFront: -0.25,
  armBack: 0.25,
  legFront: -0.12,
  legBack: 0.12,
  weapon: -0.6,
};

/**
 * M1 renders every state as the idle pose. M2 replaces the entries with real
 * keyframe sets driven by the `phase` argument (0..1 through the state).
 */
export const POSE_BY_STATE: Record<UnitState, Pose> = {
  idle: IDLE_POSE,
  move: IDLE_POSE,
  gather: IDLE_POSE,
  attack: IDLE_POSE,
  stunned: IDLE_POSE,
  dead: IDLE_POSE,
};

/**
 * Returns the pose for a unit's state at a given phase through that state.
 * `phase` is 0..1 and is ignored in M1.
 */
export function poseFor(state: UnitState, _phase: number): Pose {
  return POSE_BY_STATE[state];
}
