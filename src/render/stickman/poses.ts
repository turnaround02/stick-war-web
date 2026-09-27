import type { UnitState } from '../../sim/types';

/**
 * Joint angles in radians. Positive rotates clockwise on screen.
 *
 * TWO DIFFERENT ZERO REFERENCES, because the limbs hang differently and both
 * sets of values below were authored against their own:
 *
 *   `legFront` / `legBack` — legs hang DOWN from the hip. 0 = straight down;
 *                            positive swings the foot forward.
 *   `armFront` / `armBack` — arms point FORWARD from the shoulder. 0 = straight
 *                            forward; positive swings the hand down.
 *   `torso` / `weapon`     — 0 = upright / aligned with the arm.
 *
 * The rest vectors live in `rig.ts` and are asserted by `rig.test.ts`. Getting
 * them wrong is not cosmetic: the legs were once drawn as horizontal rectangles
 * while these values assumed vertical, so every stickman stood with its feet
 * stuck out in front. See `rig.ts` for the full account.
 */
export interface Pose {
  torso: number;
  armFront: number;
  armBack: number;
  legFront: number;
  legBack: number;
  /** Weapon angle relative to the front arm. */
  weapon: number;
}

export interface Keyframe {
  /** 0..1 through the state's cycle. */
  atPhase: number;
  pose: Pose;
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
 * Keyframes per state, linearly interpolated by poseFor.
 *
 * The attack set is the important one: its middle keyframe is the
 * blade-contact moment and must line up with the damage tick. BattleScene
 * passes phase = windup progress, so the strike lands on the tick where the
 * renderer is showing CONTACT_PHASE.
 */
export const CONTACT_PHASE = 0.5;

export const POSE_KEYFRAMES: Record<UnitState, Keyframe[]> = {
  idle: [
    { atPhase: 0, pose: IDLE_POSE },
    { atPhase: 0.5, pose: { ...IDLE_POSE, torso: 0.02, armFront: -0.3 } },
    { atPhase: 1, pose: IDLE_POSE },
  ],

  // Four frames: legs alternate, arms counter-swing.
  move: [
    {
      atPhase: 0,
      pose: { ...IDLE_POSE, legFront: 0.5, legBack: -0.5, armFront: -0.5, armBack: 0.4 },
    },
    {
      atPhase: 0.25,
      pose: { ...IDLE_POSE, legFront: 0, legBack: 0, armFront: -0.25, armBack: 0.25 },
    },
    {
      atPhase: 0.5,
      pose: { ...IDLE_POSE, legFront: -0.5, legBack: 0.5, armFront: 0.4, armBack: -0.5 },
    },
    {
      atPhase: 0.75,
      pose: { ...IDLE_POSE, legFront: 0, legBack: 0, armFront: -0.25, armBack: 0.25 },
    },
    {
      atPhase: 1,
      pose: { ...IDLE_POSE, legFront: 0.5, legBack: -0.5, armFront: -0.5, armBack: 0.4 },
    },
  ],

  // Raise -> strike -> recover. The middle frame IS the contact moment.
  attack: [
    { atPhase: 0, pose: { ...IDLE_POSE, armFront: -2.2, weapon: -1.4, torso: -0.15 } },
    { atPhase: CONTACT_PHASE, pose: { ...IDLE_POSE, armFront: 0.9, weapon: -0.1, torso: 0.25 } },
    { atPhase: 1, pose: { ...IDLE_POSE, armFront: 0.3, weapon: -0.5, torso: 0.1 } },
  ],

  gather: [
    { atPhase: 0, pose: { ...IDLE_POSE, armFront: -1.6, armBack: -0.3 } },
    { atPhase: 0.5, pose: { ...IDLE_POSE, armFront: 0.2, armBack: 0.1, torso: 0.2 } },
    { atPhase: 1, pose: { ...IDLE_POSE, armFront: -1.6, armBack: -0.3 } },
  ],

  stunned: [{ atPhase: 0, pose: { ...IDLE_POSE, torso: -0.3, armFront: -1.0, armBack: -1.0 } }],

  dead: [
    { atPhase: 0, pose: { ...IDLE_POSE, torso: 1.2, armFront: 0.8, armBack: 0.8, legFront: 0.4 } },
  ],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    torso: lerp(a.torso, b.torso, t),
    armFront: lerp(a.armFront, b.armFront, t),
    armBack: lerp(a.armBack, b.armBack, t),
    legFront: lerp(a.legFront, b.legFront, t),
    legBack: lerp(a.legBack, b.legBack, t),
    weapon: lerp(a.weapon, b.weapon, t),
  };
}

/**
 * Interpolates the pose for a state at a given phase (0..1).
 *
 * Phase comes from the sim: (world.tick - stateEnteredTick) / stateDuration.
 * For `attack` the renderer passes windup progress so the contact keyframe
 * lands on the same tick the damage is applied.
 */
export function poseFor(state: UnitState, phase: number): Pose {
  const frames = POSE_KEYFRAMES[state];
  if (frames.length === 1) return frames[0].pose;

  const clamped = Math.min(Math.max(phase, 0), 1);

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (clamped <= next.atPhase) {
      const span = next.atPhase - prev.atPhase;
      const t = span <= 0 ? 0 : (clamped - prev.atPhase) / span;
      return lerpPose(prev.pose, next.pose, t);
    }
  }
  return frames[frames.length - 1].pose;
}
