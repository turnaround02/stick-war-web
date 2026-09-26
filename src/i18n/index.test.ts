import { describe, it, expect } from 'vitest';
import { t, ZH_CN } from './index';

describe('t', () => {
  it('returns the Chinese string for a known key', () => {
    expect(t('ui.gold')).toBe('金币');
  });

  it('falls back to the key itself when missing', () => {
    // Better a visible key than an empty string: a blank HUD label is
    // indistinguishable from a rendering bug.
    expect(t('ui.thisKeyDoesNotExist')).toBe('ui.thisKeyDoesNotExist');
  });

  it('covers every unit nameKey declared in the unit table', () => {
    // The unit table stores i18n keys, never display names (spec §7.5).
    // If a unit is added without a translation the HUD would show a raw key.
    for (const key of ['unit.miner', 'unit.swordsman', 'unit.archer', 'unit.spearman']) {
      expect(ZH_CN[key], `missing translation for ${key}`).toBeDefined();
    }
  });

  it('covers every HUD label the command bar needs', () => {
    for (const key of ['ui.gold', 'ui.population', 'ui.advanceAll', 'ui.retreatAll', 'ui.pause']) {
      expect(ZH_CN[key], `missing translation for ${key}`).toBeDefined();
    }
  });

  it('has no empty translations', () => {
    for (const [key, value] of Object.entries(ZH_CN)) {
      expect(value.length, `empty translation for ${key}`).toBeGreaterThan(0);
    }
  });
});
