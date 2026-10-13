/**
 * The i18n entry point. Callers use t('key') and never touch the tables.
 *
 * A missing key returns the key itself rather than an empty string: a raw
 * `ui.gold` on screen is an obvious bug report, whereas a blank label looks
 * like a layout problem and gets debugged in the wrong place.
 *
 * M5b adds a locale CONCEPT (a registry plus setLocale) but still ships a single
 * zh-CN table — no English copy (spec §7.5.1, §13.9 Q5/Q12). Adding a language
 * later means registering one more table; nothing else changes.
 */

import { ZH_CN } from './zh-CN';

export { ZH_CN };

/** Every registered locale, keyed by BCP-47-ish id. */
export const LOCALES: Record<string, Record<string, string>> = {
  'zh-CN': ZH_CN,
};

/** The locale used before anyone calls setLocale. */
export const DEFAULT_LOCALE = 'zh-CN';

let currentLocale = DEFAULT_LOCALE;

/** The active locale id. */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Switches the active locale. Returns false and leaves the current locale
 * untouched for an unknown id, so a bad saved preference cannot blank the UI.
 */
export function setLocale(id: string): boolean {
  if (!(id in LOCALES)) return false;
  currentLocale = id;
  return true;
}

/** Looks a key up in the ACTIVE locale's table, falling back to the key. */
export function t(key: string): string {
  return LOCALES[currentLocale][key] ?? key;
}
