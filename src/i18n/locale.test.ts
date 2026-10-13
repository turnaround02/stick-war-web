import { describe, it, expect } from 'vitest';
import { t, setLocale, getLocale, LOCALES } from './index';
import { LEVELS } from '../data/levels';

describe('locale registry', () => {
  it('registers at least zh-CN', () => {
    expect(Object.keys(LOCALES)).toContain('zh-CN');
  });

  it('starts on zh-CN', () => {
    expect(getLocale()).toBe('zh-CN');
  });

  it('switches to a known locale and reports true', () => {
    expect(setLocale('zh-CN')).toBe(true);
    expect(getLocale()).toBe('zh-CN');
  });

  it('rejects an unknown locale without changing the current one', () => {
    setLocale('zh-CN');
    expect(setLocale('xx-XX')).toBe(false);
    expect(getLocale()).toBe('zh-CN');
  });
});

describe('level name keys', () => {
  it('has a level.<id>.name for EVERY level in LEVELS', () => {
    // Guard rail: adding a level without its name key would show the raw key
    // on the result overlay. This caught the endless level missing its name.
    for (const level of LEVELS) {
      const key = `level.${level.levelId}.name`;
      expect(t(key), `missing translation for ${key}`).not.toBe(key);
    }
  });
});

describe('M5b additions', () => {
  it('has a name for the endless level', () => {
    expect(t('level.endless.name')).not.toBe('level.endless.name');
  });

  it('has the wave and best-wave labels', () => {
    for (const key of ['ui.wave', 'result.best']) {
      expect(t(key), `missing translation for ${key}`).not.toBe(key);
    }
  });
});
