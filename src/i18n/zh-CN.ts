/**
 * Chinese UI strings (spec §2: identifiers and comments in English, player
 * facing text in Chinese, reached through i18n keys).
 *
 * M5 adds en-US.ts; nothing else needs to change when it does.
 */
export const ZH_CN: Record<string, string> = {
  // Units — these keys come from data/units.ts's nameKey field.
  'unit.miner': '矿工',
  'unit.swordsman': '剑士',
  'unit.archer': '弓箭手',
  'unit.spearman': '矛兵',

  // Resource bar
  'ui.gold': '金币',
  'ui.population': '人口',

  // Command bar
  'ui.advanceAll': '全军推进',
  'ui.retreatAll': '全军撤退',
  'ui.holdAll': '全军驻守',
  'ui.popFull': '人口已满',
  'ui.noGold': '金币不足',

  // Stance labels
  'ui.stance.advance': '推进',
  'ui.stance.hold': '驻守',
  'ui.stance.retreat': '撤退',

  // Speed control
  'ui.speed': '速度',
  'ui.pause': '暂停',
  'ui.resume': '继续',
};
