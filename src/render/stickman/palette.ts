import type { UnitTypeId } from '../../data/units';

/**
 * Per-unit colour scheme. Combined with weapon shape this is what keeps units
 * distinguishable at 0.6x zoom (spec risk #7).
 */
export interface Palette {
  /** Torso, arms and legs. */
  limb: number;
  head: number;
  weapon: number;
}

export const PALETTES: Record<UnitTypeId, Palette> = {
  miner: { limb: 0xc9a227, head: 0xe0b84a, weapon: 0x8a6d1f },
  swordsman: { limb: 0x3f7fd0, head: 0x6ba3e8, weapon: 0xd8dde3 },
  archer: { limb: 0x3fa05a, head: 0x63c47d, weapon: 0x8a6d1f },
  spearman: { limb: 0xa04f9f, head: 0xc478c3, weapon: 0xd8dde3 },
  giant: { limb: 0x5a2d0c, head: 0x8b4513, weapon: 0xd8dde3 },
};
