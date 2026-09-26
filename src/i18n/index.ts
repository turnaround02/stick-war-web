/**
 * The i18n entry point. Callers use t('key') and never touch the tables.
 *
 * A missing key returns the key itself rather than an empty string: a raw
 * `ui.gold` on screen is an obvious bug report, whereas a blank label looks
 * like a layout problem and gets debugged in the wrong place.
 */

import { ZH_CN } from './zh-CN';

export { ZH_CN };

export function t(key: string): string {
  return ZH_CN[key] ?? key;
}
