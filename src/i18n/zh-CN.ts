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
  // Endless HUD: the current wave is the mode's score.
  'ui.wave': '波次',

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

  // Result overlay
  'result.win': '胜利',
  'result.lose': '失败',
  'result.time': '用时',
  'result.replay': '重玩',
  'result.next': '下一关',
  'result.restartCampaign': '返回第一关',
  // Endless result: the best wave ever reached (stored in localStorage).
  'result.best': '最高',

  // Level names — keys follow `level.<levelId>.name`.
  'level.level-1.name': '第一关',
  'level.level-2.name': '第二关',
  'level.level-3.name': '第三关',
  'level.endless.name': '无尽模式',
};
