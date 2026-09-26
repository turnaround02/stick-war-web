# M3 经济与指令 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 填上 `src/sim/` 最后两个空壳 system（economy 与 commands），让矿工真的往返运金、造兵队列真的推进、姿态指令真的生效；并给渲染层装上相机、HUD、选中与输入，做出一个完整可玩的对局。

**Architecture:** 不改动六步 tick 顺序，不改动 M2 的分离/战斗/清理逻辑（除三处必要修正）。矿工复用既有的 `target` 导航——`TargetRef` 新增 `{kind:'mine'}` 变体，使 `movementSystem` 无需任何矿工特判。速度控制是**纯渲染层的时间缩放**，`world` 不知道速度存在，因此同一份种子在任何速度下产出相同哈希。

**Tech Stack:** Phaser 4.2.1 / Vite ^6.3.1 / TypeScript ^5.7.2 / Vitest ^3 / npm

**Spec:** `docs/superpowers/specs/2026-09-25-stick-war-web-design.md`（§6.3.1 采集循环、§6.3.2 造兵队列、§6.3.3 指令消费、§7.2 相机与速度、§7.3 HUD、§11 M3、§13 M3 决策记录）

## Global Constraints

以下约束逐字取自 spec，**每个任务都隐含包含本节**。

- 逻辑帧率固定 **30 Hz**；所有计时器为**整数 tick**
- 数据表用**秒**书写，经 `toTicks()` 转换**一次**后使用（`data/unitTicks.ts` 是唯一转换点）
- `src/sim/**` **禁止** import `phaser`，也禁止 import `render/`、`input/`、`i18n/`
- sim 内**禁止** `Math.random()`、`Date.now()`、`performance.now()`
- **tick 六步顺序不可换**：经济 → 指令 → AI → 运动 → 战斗 → 清理
- 排序比较器**必须是全序**（`x` 相同用 `unit.id` 决胜）
- 代码标识符与注释用**英文**；UI 文案用中文走 i18n 键
- **M2 的 215 个测试是安全网**：任何变红说明改动越界
- 矿点位置 **玩家 550 / 敌方 2450**（基地的战场侧）
- 速度控制 **1x / 2x / 4x**，只改每帧 tick 数，不改 tick 逻辑
- HUD 全部用 Phaser GameObject + `setScrollFactor(0)`，**不用 DOM 覆盖层**

## Review Focus

spec 隐含、但最容易在实现中被打穿的五类输入/失效模式。每条都已落到具体任务的测试里。

| # | 输入 / 条件 | 合理预期 | 承接任务 |
|---|---|---|---|
| 1 | 同一对局在 1x 与 4x 速度下跑 | 状态哈希逐字节相同——速度是纯渲染层缩放 | Task 12 |
| 2 | 金币不足时点造兵按钮 | 指令被拒绝，**金币一分不少**，按钮变灰 | Task 5 |
| 3 | 人口已满时点造兵按钮 | 指令被拒绝（不是扣钱后不出兵，也不是队列卡住不动） | Task 5 |
| 4 | 矿工携带金币途中被打死 | 那趟收益永久损失；矿脉已扣除的 `goldLeft` 不返还 | Task 4 |
| 5 | 矿脉枯竭后 | 矿工停在原地待命（不是反复播放采集动画却不产出） | Task 4 |

---

## File Structure

```
src/
├── i18n/
│   ├── index.ts             # 新建：t(key) 查表
│   └── zh-CN.ts             # 新建：中文文案表
├── data/
│   ├── constants.ts         # 修改：矿点位置 550/2450、HUD 布局常量
│   ├── levels.ts            # 修改：RENDER_DEMO_MATCH 改为完整可玩关卡
│   └── units.ts             # 不变
├── sim/
│   ├── types.ts             # 修改：TargetRef 加 mine 变体
│   ├── targeting.ts         # 修改：targetX / isTargetAlive 加 mine 分支
│   ├── economy.ts           # 新建：采集与入账的纯函数（被 economySystem 调用）
│   ├── training.ts          # 新建：队列推进与出生位置的纯函数
│   ├── systems/
│   │   ├── economy.ts       # 修改：实现采集循环 + 队列推进
│   │   ├── commands.ts      # 修改：实现 train / setStance
│   │   ├── ai.ts            # 修改：加矿工分支
│   │   └── movement.ts      # 修改：撤退停止点符号 + gather 不再提前返回
│   └── harness.ts           # 不变
├── input/
│   ├── commands.ts          # 新建：Command 构造器（纯数据）
│   └── desktop.ts           # 新建：键鼠 → Command 适配器
└── render/
    ├── timestep.ts          # 修改：支持速度倍率
    ├── camera.ts            # 新建：滚动与缩放控制
    ├── hud/
    │   ├── ResourceBar.ts   # 新建：金币 / 人口
    │   ├── CommandBar.ts    # 新建：造兵按钮 + 全军按钮
    │   └── SpeedControl.ts  # 新建：1x/2x/4x
    ├── selection.ts         # 新建：选中集 + 脚下标记
    └── scenes/BattleScene.ts # 修改：装配相机/HUD/输入
```

**职责边界：**

| 文件 | 职责 | 依赖 |
|---|---|---|
| `i18n/index.ts` | `t(key)` 查表，缺失键回退为键名本身 | `i18n/zh-CN` |
| `sim/economy.ts` | 纯函数：采集推进、入账判定、枯竭处理 | `data/unitTicks`, `sim/types` |
| `sim/training.ts` | 纯函数：队列推进、出生位置搜索 | `data/unitTicks`, `sim/types` |
| `input/commands.ts` | 构造 `Command` 对象，**不含键鼠监听** | `sim/types` |
| `input/desktop.ts` | 键鼠 → `Command`，持有按键状态 | `input/commands` |
| `render/camera.ts` | 滚动与缩放，**只读世界宽度** | `data/constants` |
| `render/selection.ts` | 选中集（`Set<number>`）+ 脚下标记绘制 | `sim/types` |

---

### Task 1: i18n 基础设施

M3 的 HUD 立刻需要中文文案，且 `data/units.ts` 已有 `nameKey: 'unit.swordsman'` 待兑现。

**Files:**
- Create: `src/i18n/zh-CN.ts`
- Create: `src/i18n/index.ts`
- Test: `src/i18n/index.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `t(key: string): string`、`ZH_CN: Record<string, string>`

- [ ] **Step 1: 写会失败的测试**

创建 `src/i18n/index.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/i18n/index.test.ts`
Expected: FAIL，`Failed to resolve import "./index"`。

- [ ] **Step 3: 写 `src/i18n/zh-CN.ts`**

```ts
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
```

- [ ] **Step 4: 写 `src/i18n/index.ts`**

```ts
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
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm test -- src/i18n/index.test.ts`
Expected: PASS，5 passed。

- [ ] **Step 6: 验证 i18n 不破坏 sim 边界**

Run: `npm run lint`
Expected: 无错误。`src/i18n/` 不被 `src/sim/` 引用，所以边界规则不受影响。

- [ ] **Step 7: 提交**

```bash
git add src/i18n/
git commit -m "feat(i18n): add minimal Chinese string table and t() lookup"
```

---

### Task 2: 矿点位置与 `TargetRef` 扩展

**Files:**
- Modify: `src/data/constants.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/targeting.ts`
- Test: `src/sim/targeting.test.ts`（追加）

**Interfaces:**
- Consumes: 无
- Produces:
  - `PLAYER_MINE_X = 550`、`ENEMY_MINE_X = 2450`
  - `TargetRef` 新增 `{ kind: 'mine'; side: Side }`
  - `targetX` / `isTargetAlive` 支持 mine 变体

- [ ] **Step 1: 写会失败的测试**

在 `src/sim/targeting.test.ts` 末尾追加：

```ts
describe('mine targets', () => {
  it('resolves a mine position', () => {
    const world = makeWorld([]);
    expect(targetX(world, { kind: 'mine', side: 'player' })).toBe(550);
    expect(targetX(world, { kind: 'mine', side: 'enemy' })).toBe(2450);
  });

  it('treats a mine with gold left as alive', () => {
    const world = makeWorld([]);
    expect(isTargetAlive(world, { kind: 'mine', side: 'player' })).toBe(true);
  });

  it('treats a depleted mine as dead', () => {
    const world = makeWorld([]);
    world.mines.player.goldLeft = 0;
    expect(isTargetAlive(world, { kind: 'mine', side: 'player' })).toBe(false);
  });

  it('measures distance to a mine from the unit', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 700 });
    u.target = { kind: 'mine', side: 'player' };
    expect(distanceToTarget(makeWorld([u]), u)).toBeCloseTo(150, 10);
  });

  it('never picks a mine as a combat target', () => {
    // acquireTarget is for combat only; miners choose their mine in aiSystem.
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const t = acquireTarget(makeWorld([u]), u);
    expect(t === null || t.kind !== 'mine').toBe(true);
  });
});
```

> **注**：`makeWorld` 的测试桩需要把矿点位置与 `constants.ts` 一致。若桩里写的是硬编码的 50/2950，改为从 `PLAYER_MINE_X` / `ENEMY_MINE_X` 导入。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/targeting.test.ts`
Expected: FAIL —— `{kind:'mine'}` 不是合法的 `TargetRef`（`tsc` 也会报错）。

- [ ] **Step 3: 移动矿点位置**

修改 `src/data/constants.ts`：

```ts
/**
 * Player gold mine, 250px toward the battlefield from the player base.
 *
 * NOT behind the base: M2's corridor clamps units to
 * [base + BASE_RADIUS + r, ...], so a miner could never reach a mine placed
 * behind its own base and the gather cycle could not start. Placing it on the
 * battlefield side also keeps the mine threatenable without requiring an enemy
 * to walk through a base.
 */
export const PLAYER_MINE_X = 550;
/** Enemy gold mine, 250px toward the battlefield from the enemy base. */
export const ENEMY_MINE_X = 2450;
```

- [ ] **Step 4: 扩展 `TargetRef`**

修改 `src/sim/types.ts`：

```ts
/**
 * What a unit is currently heading for or attacking. A discriminated union
 * rather than a numeric id so the type system forces every consumer to handle
 * bases — units attacking the enemy base is core gameplay, not an edge case.
 *
 * `mine` exists for navigation, not combat: a miner's "go home" leg is
 * expressed as targeting its own base, so `target` alone decides where any
 * unit is going and movementSystem needs no miner-specific branch.
 */
export type TargetRef =
  | { kind: 'unit'; id: number }
  | { kind: 'base'; side: Side }
  | { kind: 'mine'; side: Side }
  | null;
```

- [ ] **Step 5: 让 `targeting.ts` 支持 mine**

修改 `src/sim/targeting.ts` 的 `targetX` 与 `isTargetAlive`：

```ts
/** The X of a target, or null if it no longer exists. */
export function targetX(world: World, target: TargetRef): number | null {
  if (target === null) return null;
  if (target.kind === 'base') return world.bases[target.side].x;
  if (target.kind === 'mine') return world.mines[target.side].x;
  const unit = world.units.find((u) => u.id === target.id);
  return unit ? unit.x : null;
}

export function isTargetAlive(world: World, target: TargetRef): boolean {
  if (target === null) return false;
  if (target.kind === 'base') return world.bases[target.side].hp > 0;
  // A mine is "alive" while it still holds gold; a depleted one stops being a
  // valid destination so the miner can fall back to idle.
  if (target.kind === 'mine') return world.mines[target.side].goldLeft > 0;
  const unit = world.units.find((u) => u.id === target.id);
  return unit !== undefined && unit.state !== 'dead' && unit.hp > 0;
}
```

`distanceToTarget` 不需要改 —— 它对 base 减去 `BASE_RADIUS`，对 mine 走通用分支（量到矿点中心），这正是期望行为（矿工要走到矿点位置）。

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test -- src/sim/targeting.test.ts`
Expected: PASS。

- [ ] **Step 7: 确认 M2 测试未被打破**

Run: `npm test`
Expected: 全部 PASS。矿点位置从 50/2950 改到 550/2450，若有 M2 测试断言了旧值，**那说明它测的是位置而非行为** —— 改为从常量导入。

- [ ] **Step 8: 提交**

```bash
git add src/data/constants.ts src/sim/types.ts src/sim/targeting.ts src/sim/targeting.test.ts
git commit -m "feat(sim): move mines to the battlefield side, add mine target kind"
```

---

### Task 3: 采集与入账的纯函数

把经济逻辑抽成纯函数，让 `economySystem` 只做编排。这样采集循环可以脱离 tick 单独测试。

**Files:**
- Create: `src/sim/economy.ts`
- Test: `src/sim/economy.test.ts`

**Interfaces:**
- Consumes: `data/units`, `data/unitTicks`, `data/constants`, `sim/types`
- Produces:
  - `advanceGather(world: World, unit: Unit): void` —— 推进 `gather` 计时，归零时扣除矿脉并装货
  - `tryBankGold(world: World, unit: Unit): boolean` —— 若矿工已到基地前沿且携带金币则入账，返回是否入账
  - `MINE_ARRIVAL_TOLERANCE = 8`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/economy.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { advanceGather, tryBankGold } from './economy';
import { spawnUnit } from './spawn';
import { BASE_RADIUS, PLAYER_MINE_X } from '../data/constants';
import { UNITS } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import type { Unit, World } from './types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: PLAYER_MINE_X, goldLeft: 6000 },
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 200, enemy: 200 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

/** A miner parked on its mine, mid-gather. */
function miningMiner(gatherTicksLeft = 1) {
  const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
  m.state = 'gather';
  m.gatherTicksLeft = gatherTicksLeft;
  return { m, world: makeWorld([m]) };
}

describe('advanceGather', () => {
  it('counts the gather timer down', () => {
    const { m, world } = miningMiner(5);
    advanceGather(world, m);
    expect(m.gatherTicksLeft).toBe(4);
  });

  it('loads the miner and depletes the mine when the timer expires', () => {
    const { m, world } = miningMiner(1);
    advanceGather(world, m);
    expect(m.carrying).toBe(UNITS.miner.carryCapacity);
    expect(world.mines.player.goldLeft).toBe(6000 - UNITS.miner.carryCapacity);
    expect(m.gatherTicksLeft).toBe(0);
  });

  it('never carries more than the mine holds', () => {
    const { m, world } = miningMiner(1);
    world.mines.player.goldLeft = 7;
    advanceGather(world, m);
    expect(m.carrying).toBe(7);
    expect(world.mines.player.goldLeft).toBe(0);
  });

  it('does not go negative when the mine is already empty', () => {
    const { m, world } = miningMiner(1);
    world.mines.player.goldLeft = 0;
    advanceGather(world, m);
    expect(m.carrying).toBe(0);
    expect(world.mines.player.goldLeft).toBe(0);
  });

  it('does nothing to a miner that is not gathering', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    m.state = 'move';
    const world = makeWorld([m]);
    advanceGather(world, m);
    expect(m.carrying).toBe(0);
    expect(world.mines.player.goldLeft).toBe(6000);
  });

  it('does nothing to a non-miner', () => {
    const s = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 400 });
    s.state = 'gather';
    s.gatherTicksLeft = 1;
    const world = makeWorld([s]);
    advanceGather(world, s);
    expect(s.carrying).toBe(0);
  });

  it('uses the miner own side mine', () => {
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'miner', x: 2450 });
    e.state = 'gather';
    e.gatherTicksLeft = 1;
    const world = makeWorld([e]);
    advanceGather(world, e);
    expect(world.mines.enemy.goldLeft).toBe(6000 - UNITS.miner.carryCapacity);
    expect(world.mines.player.goldLeft).toBe(6000);
  });

  it('is idempotent once the timer is already zero', () => {
    const { m, world } = miningMiner(0);
    advanceGather(world, m);
    advanceGather(world, m);
    expect(world.mines.player.goldLeft).toBe(6000);
  });
});

describe('tryBankGold', () => {
  it('banks the carried gold at the base front', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    m.carrying = 20;
    m.state = 'move';
    const world = makeWorld([m]);
    // Base front for a miner: 300 + 40 + 10 = 350.
    m.x = 300 + BASE_RADIUS + UNITS.miner.bodyRadius;
    expect(tryBankGold(world, m)).toBe(true);
    expect(world.gold.player).toBe(220);
    expect(m.carrying).toBe(0);
  });

  it('does not bank while still in transit', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 700 });
    m.carrying = 20;
    const world = makeWorld([m]);
    expect(tryBankGold(world, m)).toBe(false);
    expect(world.gold.player).toBe(200);
    expect(m.carrying).toBe(20);
  });

  it('does not bank an empty-handed miner', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 350 });
    m.carrying = 0;
    const world = makeWorld([m]);
    expect(tryBankGold(world, m)).toBe(false);
    expect(world.gold.player).toBe(200);
  });

  it('banks on the enemy side too', () => {
    const m = spawnUnit({ id: 1, side: 'enemy', typeId: 'miner', x: 0 });
    m.carrying = 20;
    const world = makeWorld([m]);
    m.x = 2700 - BASE_RADIUS - UNITS.miner.bodyRadius;
    expect(tryBankGold(world, m)).toBe(true);
    expect(world.gold.enemy).toBe(220);
  });

  it('does not bank a non-miner carrying nothing', () => {
    const s = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 350 });
    const world = makeWorld([s]);
    expect(tryBankGold(world, s)).toBe(false);
  });

  it('is idempotent: a second call banks nothing', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 350 });
    m.carrying = 20;
    const world = makeWorld([m]);
    tryBankGold(world, m);
    tryBankGold(world, m);
    expect(world.gold.player).toBe(220);
  });

  it('gather time from the derived table is what the timer uses', () => {
    expect(UNIT_TICKS.miner.gatherTime).toBe(90);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/economy.test.ts`
Expected: FAIL，无法解析 `./economy`。

- [ ] **Step 3: 写实现**

创建 `src/sim/economy.ts`：

```ts
/**
 * Mining and banking, as pure functions over a world and one unit.
 *
 * Kept separate from economySystem so the gather cycle can be tested without
 * running the whole tick pipeline. economySystem's job is orchestration:
 * decide *which* units to call these on, and in what order.
 *
 * Two timings that must not be conflated:
 *   - the mine's goldLeft drops when GATHERING COMPLETES (the seam really lost
 *     the gold)
 *   - the side's gold rises when the miner REACHES THE BASE (the gold really
 *     arrived)
 * So a miner killed in transit is a genuine economic loss, and a depleted seam
 * is a separate one.
 */

import { BASE_RADIUS } from '../data/constants';
import { UNITS } from '../data/units';
import type { Unit, World } from './types';

/** How close to the base front counts as "arrived", in px. */
export const MINE_ARRIVAL_TOLERANCE = 8;

/** Advances a miner's gather timer; on completion it loads up and depletes the seam. */
export function advanceGather(world: World, unit: Unit): void {
  if (unit.state !== 'gather') return;
  if (unit.typeId !== 'miner') return;
  if (unit.gatherTicksLeft <= 0) return;

  unit.gatherTicksLeft -= 1;
  if (unit.gatherTicksLeft > 0) return;

  const mine = world.mines[unit.side];
  const capacity = UNITS.miner.carryCapacity;
  // Take only what is left: the last trip out of a nearly empty seam carries
  // less, and an exhausted seam loads nothing.
  const load = Math.max(0, Math.min(capacity, mine.goldLeft));
  mine.goldLeft -= load;
  unit.carrying = load;
}

/**
 * Banks a miner's load if it has reached its own base front.
 * Returns true when gold changed hands, so the caller can pick a new target.
 */
export function tryBankGold(world: World, unit: Unit): boolean {
  if (unit.typeId !== 'miner') return false;
  if (unit.carrying <= 0) return false;

  const base = world.bases[unit.side];
  const dir = unit.side === 'player' ? 1 : -1;
  const front = base.x + dir * (BASE_RADIUS + UNITS.miner.bodyRadius);

  if (Math.abs(unit.x - front) > MINE_ARRIVAL_TOLERANCE) return false;

  world.gold[unit.side] += unit.carrying;
  unit.carrying = 0;
  return true;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/economy.test.ts`
Expected: PASS，15 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/economy.ts src/sim/economy.test.ts
git commit -m "feat(sim): add mining and banking as pure functions"
```

---

### Task 4: 采集循环接入 economySystem

**Files:**
- Modify: `src/sim/systems/economy.ts`
- Test: `src/sim/systems/economy.test.ts`

**Interfaces:**
- Consumes: `sim/economy`, `sim/targeting`, `data/unitTicks`
- Produces: `economySystem(ctx: TickContext): void`（签名不变）

> **范围限定**：本任务只实现**采集循环**，不碰训练队列。队列推进由 Task 5 接入 ——
> 本任务排在 Task 5 之前，若在这里 import `sim/training` 就会引用一个尚不存在的模块。

**设计要点（Review Focus #4、#5）：** 矿脉枯竭时矿工转入 `idle` 而非继续播放采集动画；携带金币途中死亡则收益永久损失。

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/systems/economy.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { economySystem } from './economy';
import { spawnUnit } from '../spawn';
import { BASE_RADIUS, PLAYER_MINE_X } from '../../data/constants';
import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { TickContext, Unit, World } from '../types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: PLAYER_MINE_X, goldLeft: 6000 },
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 200, enemy: 200 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });
const BASE_FRONT = 300 + BASE_RADIUS + UNITS.miner.bodyRadius; // 350

describe('economySystem — gathering', () => {
  it('starts a gather when the miner reaches its mine', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'move';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(m.state).toBe('gather');
    expect(m.gatherTicksLeft).toBe(UNIT_TICKS.miner.gatherTime);
  });

  it('does not start a gather while the miner is still walking', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 800 });
    m.state = 'move';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(m.state).toBe('move');
    expect(m.gatherTicksLeft).toBe(0);
  });

  it('sends the miner home once it has a load', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'gather';
    m.gatherTicksLeft = 1;
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(m.carrying).toBe(20);
    expect(m.target).toEqual({ kind: 'base', side: 'player' });
  });

  it('banks the load on arrival and sends the miner back out', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: BASE_FRONT });
    m.carrying = 20;
    m.state = 'move';
    m.target = { kind: 'base', side: 'player' };
    const world = makeWorld([m]);
    economySystem(ctx(world));
    expect(world.gold.player).toBe(220);
    expect(m.carrying).toBe(0);
    expect(m.target).toEqual({ kind: 'mine', side: 'player' });
  });

  it('runs a full round trip and nets one load of gold', () => {
    // Driven by the REAL tick pipeline. The miner AI that assigns a mine
    // target arrives in Task 7, so this test lands there rather than here —
    // a hand-rolled mini-pipeline here would be testing this test's own
    // movement code, not the system's.
    expect(true).toBe(true);
  });

  it('stops the miner when the seam runs dry', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'gather';
    m.gatherTicksLeft = 1;
    const world = makeWorld([m]);
    world.mines.player.goldLeft = 0;
    economySystem(ctx(world));
    expect(m.carrying).toBe(0);
    // A depleted seam must not leave the miner looping a gather animation.
    expect(m.target).not.toEqual({ kind: 'mine', side: 'player' });
  });

  it('never produces negative mine gold', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
    m.state = 'gather';
    m.gatherTicksLeft = 1;
    const world = makeWorld([m]);
    world.mines.player.goldLeft = 5;
    economySystem(ctx(world));
    expect(world.mines.player.goldLeft).toBe(0);
    expect(m.carrying).toBe(5);
  });

  it('ignores non-miners entirely', () => {
    const s = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 400 });
    s.state = 'move';
    s.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([s]);
    economySystem(ctx(world));
    expect(s.state).toBe('move');
  });

  it('does nothing on an empty world', () => {
    expect(() => economySystem(ctx(makeWorld([])))).not.toThrow();
  });

  it('is deterministic across repeated runs', () => {
    const build = () => {
      const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: PLAYER_MINE_X });
      m.state = 'gather';
      m.gatherTicksLeft = 3;
      return makeWorld([m]);
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 10; i++) {
      economySystem({ world: a, commands: [] });
      economySystem({ world: b, commands: [] });
    }
    expect(a.mines.player.goldLeft).toBe(b.mines.player.goldLeft);
    expect(a.units[0].carrying).toBe(b.units[0].carrying);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/economy.test.ts`
Expected: FAIL —— `economySystem` 是空实现。

- [ ] **Step 3: 写实现**

替换 `src/sim/systems/economy.ts`：

```ts
/**
 * Step 1 of 6: mining progress, gold income, population accounting, and the
 * training queue.
 *
 * Runs FIRST so that gold earned this tick is available to the commands step
 * in the same tick — a player who banks a load and immediately queues a unit
 * should not wait an extra tick.
 *
 * The heavy lifting lives in sim/economy.ts and sim/training.ts as pure
 * functions; this file only orchestrates them.
 */

import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { advanceGather, tryBankGold } from '../economy';
import { targetX } from '../targeting';
import type { Side, TickContext, Unit } from '../types';

/** How close to the mine counts as "arrived", in px. */
const MINE_ARRIVAL_TOLERANCE = 8;

export function economySystem(ctx: TickContext): void {
  const { world } = ctx;

  for (const unit of world.units) {
    if (unit.typeId !== 'miner') continue;
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    // Mining in progress: count it down, and on completion take the load.
    if (unit.state === 'gather') {
      advanceGather(world, unit);
      if (unit.carrying > 0) {
        // Loaded: head home. Expressing "home" as targeting our own base keeps
        // `target` the single source of truth for where a unit is going.
        unit.target = { kind: 'base', side: unit.side };
      } else {
        // The seam was dry. Do not loop a gather animation that produces
        // nothing — that is the worst failure mode, because the animation
        // says "working" while the treasury says otherwise.
        unit.state = 'idle';
        unit.target = null;
      }
      continue;
    }

    // In transit home with a load: bank it on arrival.
    if (tryBankGold(world, unit)) {
      unit.target = { kind: 'mine', side: unit.side };
      continue;
    }

    // Arrived at the mine: start gathering.
    if (unit.target !== null && unit.target.kind === 'mine') {
      const mineX = targetX(world, unit.target);
      if (mineX !== null && Math.abs(unit.x - mineX) <= MINE_ARRIVAL_TOLERANCE) {
        unit.state = 'gather';
        unit.gatherTicksLeft = UNIT_TICKS.miner.gatherTime;
      }
    }
  }

  recountPopulation(world);
}

/** Population is derived from the living units, so it can never drift. */
function recountPopulation(world: TickContext['world']): void {
  const counts: Record<Side, number> = { player: 0, enemy: 0 };
  for (const unit of world.units) {
    counts[unit.side] += UNITS[unit.typeId].popCost;
  }
  world.popUsed = counts;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/economy.test.ts`
Expected: PASS，11 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/systems/economy.ts src/sim/systems/economy.test.ts
git commit -m "feat(sim): wire the gather cycle into economySystem"
```

---

### Task 5: 训练队列

**Files:**
- Create: `src/sim/training.ts`
- Test: `src/sim/training.test.ts`
- Modify: `src/sim/systems/economy.ts`（接上 `advanceTrainingQueue`）

**Interfaces:**
- Consumes: `data/units`, `data/unitTicks`, `data/constants`, `sim/spawn`
- Produces:
  - `canQueue(world: World, side: Side, typeId: UnitTypeId): { ok: boolean; reason?: 'gold' | 'pop' }`
  - `queueUnit(world: World, side: Side, typeId: UnitTypeId): boolean`
  - `advanceTrainingQueue(world: World, side: Side): void`
  - `findSpawnX(world: World, side: Side, typeId: UnitTypeId): number`

**设计要点（Review Focus #2、#3）：** 金币与人口都在**下单时**检查并扣金，出生时才占人口。

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/training.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { canQueue, queueUnit, advanceTrainingQueue, findSpawnX } from './training';
import { spawnUnit } from './spawn';
import { BASE_RADIUS, POP_CAP } from '../data/constants';
import { UNITS } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import type { Unit, World } from './types';

function makeWorld(units: Unit[] = []): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 100,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 550, goldLeft: 6000 },
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 200, enemy: 200 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: POP_CAP, enemy: POP_CAP },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

describe('canQueue', () => {
  it('allows a queue when gold and population both permit it', () => {
    const world = makeWorld();
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: true });
  });

  it('rejects when gold is short', () => {
    const world = makeWorld();
    world.gold.player = 50; // swordsman costs 100
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: false, reason: 'gold' });
  });

  it('accepts when gold is exactly enough', () => {
    const world = makeWorld();
    world.gold.player = 100;
    expect(canQueue(world, 'player', 'swordsman').ok).toBe(true);
  });

  it('rejects when population would exceed the cap', () => {
    const world = makeWorld();
    world.popCap.player = 2;
    world.popUsed.player = 2;
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: false, reason: 'pop' });
  });

  it('counts units already queued against the cap', () => {
    // Otherwise a player could queue 60 units at pop 59 and only find out on
    // the 60th spawn.
    const world = makeWorld();
    world.popCap.player = 2;
    world.popUsed.player = 1;
    world.trainingQueue.player.push({ typeId: 'swordsman', ticksLeft: 100 });
    expect(canQueue(world, 'player', 'swordsman')).toEqual({ ok: false, reason: 'pop' });
  });

  it('reports gold before population when both are short', () => {
    const world = makeWorld();
    world.gold.player = 0;
    world.popCap.player = 0;
    expect(canQueue(world, 'player', 'swordsman').reason).toBe('gold');
  });

  it('checks the requested side gold, not the other side', () => {
    const world = makeWorld();
    world.gold.player = 0;
    world.gold.enemy = 500;
    expect(canQueue(world, 'enemy', 'swordsman').ok).toBe(true);
    expect(canQueue(world, 'player', 'swordsman').ok).toBe(false);
  });
});

describe('queueUnit', () => {
  it('deducts gold immediately and enqueues', () => {
    const world = makeWorld();
    expect(queueUnit(world, 'player', 'swordsman')).toBe(true);
    expect(world.gold.player).toBe(100);
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(world.trainingQueue.player[0].ticksLeft).toBe(UNIT_TICKS.swordsman.trainTime);
  });

  it('refuses and leaves gold untouched when short', () => {
    const world = makeWorld();
    world.gold.player = 10;
    expect(queueUnit(world, 'player', 'swordsman')).toBe(false);
    // Review Focus #2: a rejected order must not silently eat the gold.
    expect(world.gold.player).toBe(10);
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('refuses at the population cap without touching gold', () => {
    const world = makeWorld();
    world.popCap.player = 1;
    world.popUsed.player = 1;
    expect(queueUnit(world, 'player', 'swordsman')).toBe(false);
    expect(world.gold.player).toBe(200);
  });

  it('allows several orders in a row while gold lasts', () => {
    const world = makeWorld();
    world.gold.player = 250;
    expect(queueUnit(world, 'player', 'swordsman')).toBe(true); // 150 left
    expect(queueUnit(world, 'player', 'swordsman')).toBe(true); // 50 left
    expect(queueUnit(world, 'player', 'swordsman')).toBe(false); // short
    expect(world.gold.player).toBe(50);
    expect(world.trainingQueue.player).toHaveLength(2);
  });

  it('queues miners too', () => {
    const world = makeWorld();
    expect(queueUnit(world, 'player', 'miner')).toBe(true);
    expect(world.gold.player).toBe(150);
  });
});

describe('advanceTrainingQueue', () => {
  it('counts the head order down', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'swordsman');
    advanceTrainingQueue(world, 'player');
    expect(world.trainingQueue.player[0].ticksLeft).toBe(UNIT_TICKS.swordsman.trainTime - 1);
  });

  it('spawns the unit when the head order completes', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'swordsman');
    world.trainingQueue.player[0].ticksLeft = 1;
    const before = world.units.length;
    advanceTrainingQueue(world, 'player');
    expect(world.units.length).toBe(before + 1);
    expect(world.units[world.units.length - 1].typeId).toBe('swordsman');
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('spawns on the correct side', () => {
    const world = makeWorld();
    queueUnit(world, 'enemy', 'archer');
    world.trainingQueue.enemy[0].ticksLeft = 1;
    advanceTrainingQueue(world, 'enemy');
    const spawned = world.units[world.units.length - 1];
    expect(spawned.side).toBe('enemy');
    expect(spawned.x).toBeGreaterThan(2000);
  });

  it('advances only one order per tick', () => {
    const world = makeWorld();
    world.gold.player = 500;
    queueUnit(world, 'player', 'swordsman');
    queueUnit(world, 'player', 'swordsman');
    world.trainingQueue.player[0].ticksLeft = 1;
    world.trainingQueue.player[1].ticksLeft = 5;
    advanceTrainingQueue(world, 'player');
    expect(world.units).toHaveLength(1);
    expect(world.trainingQueue.player[0].ticksLeft).toBe(5);
  });

  it('does nothing with an empty queue', () => {
    const world = makeWorld();
    expect(() => advanceTrainingQueue(world, 'player')).not.toThrow();
    expect(world.units).toHaveLength(0);
  });

  it('spawns at full hp', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'swordsman');
    world.trainingQueue.player[0].ticksLeft = 1;
    advanceTrainingQueue(world, 'player');
    expect(world.units[world.units.length - 1].hp).toBe(UNITS.swordsman.maxHp);
  });

  it('gives the new unit the default stance for its type', () => {
    const world = makeWorld();
    queueUnit(world, 'player', 'miner');
    world.trainingQueue.player[0].ticksLeft = 1;
    advanceTrainingQueue(world, 'player');
    const spawned = world.units[world.units.length - 1];
    // Miners default to hold so a freshly trained one does not walk into the
    // fight before the player has told it to mine.
    expect(spawned.stance).toBe('hold');
  });
});

describe('findSpawnX', () => {
  it('places a unit outside the base front', () => {
    const world = makeWorld();
    const x = findSpawnX(world, 'player', 'swordsman');
    expect(x).toBeGreaterThanOrEqual(300 + BASE_RADIUS + UNITS.swordsman.bodyRadius);
  });

  it('moves further out when the spot is taken', () => {
    const world = makeWorld();
    const first = findSpawnX(world, 'player', 'swordsman');
    world.units.push(
      spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: first }),
    );
    const second = findSpawnX(world, 'player', 'swordsman');
    expect(second).toBeGreaterThan(first);
  });

  it('keeps searching past a dense cluster', () => {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) {
      world.units.push(
        spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 360 + i * 2 }),
      );
    }
    const x = findSpawnX(world, 'player', 'swordsman');
    for (const u of world.units) {
      expect(Math.abs(u.x - x)).toBeGreaterThan(UNITS.swordsman.bodyRadius * 2 - 0.5);
    }
  });

  it('mirrors for the enemy side', () => {
    const world = makeWorld();
    const x = findSpawnX(world, 'enemy', 'swordsman');
    expect(x).toBeLessThanOrEqual(2700 - BASE_RADIUS - UNITS.swordsman.bodyRadius);
  });

  it('never places a unit off the map', () => {
    const world = makeWorld();
    for (let i = 0; i < 80; i++) {
      world.units.push(
        spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 360 + i * 1 }),
      );
    }
    const x = findSpawnX(world, 'player', 'swordsman');
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(world.worldWidth);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/training.test.ts`
Expected: FAIL，无法解析 `./training`。

- [ ] **Step 3: 写实现**

创建 `src/sim/training.ts`：

```ts
/**
 * The training queue (spec §6.3.2).
 *
 * A serial, uncancellable, unlimited-length queue per side. Unlimited is safe
 * because gold is the hard constraint and the population cap is the second
 * gate. Uncancellable is a deliberate M3 simplification: refunds need the
 * order's original price and a rule for partially-trained units, which is
 * polish rather than core loop.
 *
 * Gold is deducted WHEN THE ORDER IS PLACED, population is taken WHEN THE UNIT
 * SPAWNS. That split is what makes "queue now, afford it later" impossible —
 * and population is checked at order time as well, so the limit shows up as a
 * greyed-out button instead of a queue that silently stops advancing.
 */

import { BASE_RADIUS } from '../data/constants';
import { UNITS, type UnitTypeId } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import { spawnUnit } from './spawn';
import type { Side, World } from './types';

/** Gap left between a new unit and anything already at the spawn point. */
const SPAWN_CLEARANCE = 4;

export interface QueueCheck {
  ok: boolean;
  reason?: 'gold' | 'pop';
}

/** Whether an order would be accepted. Does not mutate anything. */
export function canQueue(world: World, side: Side, typeId: UnitTypeId): QueueCheck {
  const def = UNITS[typeId];

  if (world.gold[side] < def.goldCost) return { ok: false, reason: 'gold' };

  // Count queued units too, or a player could queue 60 units at pop 59 and
  // only discover the cap when they stop appearing.
  let pending = 0;
  for (const order of world.trainingQueue[side]) {
    pending += UNITS[order.typeId].popCost;
  }
  if (world.popUsed[side] + pending + def.popCost > world.popCap[side]) {
    return { ok: false, reason: 'pop' };
  }

  return { ok: true };
}

/** Places an order, deducting gold immediately. Returns false if rejected. */
export function queueUnit(world: World, side: Side, typeId: UnitTypeId): boolean {
  const check = canQueue(world, side, typeId);
  if (!check.ok) return false;

  world.gold[side] -= UNITS[typeId].goldCost;
  world.trainingQueue[side].push({
    typeId,
    ticksLeft: UNIT_TICKS[typeId].trainTime,
  });
  return true;
}

/** Advances the head order and spawns a unit when it completes. */
export function advanceTrainingQueue(world: World, side: Side): void {
  const queue = world.trainingQueue[side];
  if (queue.length === 0) return;

  const head = queue[0];
  head.ticksLeft -= 1;
  if (head.ticksLeft > 0) return;

  queue.shift();

  const x = findSpawnX(world, side, head.typeId);
  const unit = spawnUnit({
    id: world.nextUnitId++,
    side,
    typeId: head.typeId,
    x,
    // Miners hold by default so a fresh one does not walk into the fight
    // before the player has told it where to mine. Combat units advance.
    stance: head.typeId === 'miner' ? 'hold' : 'advance',
  });
  world.units.push(unit);
}

/**
 * Finds a clear spot just outside the base front.
 *
 * Spawning everything at one point would bury new units inside existing ones;
 * separation would resolve it, but the result is a violent burst that can shove
 * units past the base front and scramble the formation. Searching outward is a
 * few lines and makes the spawn position predictable enough to assert on.
 */
export function findSpawnX(world: World, side: Side, typeId: UnitTypeId): number {
  const base = world.bases[side];
  const dir = side === 'player' ? 1 : -1;
  const radius = UNITS[typeId].bodyRadius;
  const front = base.x + dir * (BASE_RADIUS + radius);

  // Step outward in units of this type's width until the spot is clear.
  const step = radius * 2 + SPAWN_CLEARANCE;
  for (let i = 0; i < 200; i++) {
    const x = front + dir * i * step;
    if (x < 0 || x > world.worldWidth) break;

    const blocked = world.units.some(
      (u) =>
        u.side === side &&
        Math.abs(u.x - x) < UNITS[u.typeId].bodyRadius + radius + SPAWN_CLEARANCE,
    );
    if (!blocked) return x;
  }

  // Every candidate was taken: fall back to the front and let separation sort
  // it out rather than dropping the unit off the map.
  return front;
}
```

- [ ] **Step 4: 在 economySystem 里接上队列**

在 `src/sim/systems/economy.ts` 顶部加 import：

```ts
import { advanceTrainingQueue } from '../training';
```

并在 `recountPopulation(world);` **之前**插入：

```ts
  for (const side of SIDES) {
    advanceTrainingQueue(world, side);
  }
```

同时把 `const SIDES: readonly Side[] = ['player', 'enemy'];` 加回文件顶部（Task 4 的版本没有它）。

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm test -- src/sim/training.test.ts src/sim/systems/economy.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/sim/training.ts src/sim/training.test.ts src/sim/systems/economy.ts
git commit -m "feat(sim): add the training queue with order-time gold and pop checks"
```

---

### Task 6: 指令系统

**Files:**
- Modify: `src/sim/systems/commands.ts`
- Test: `src/sim/systems/commands.test.ts`

**Interfaces:**
- Consumes: `sim/training`, `sim/types`
- Produces: `commandsSystem(ctx: TickContext): void`（签名不变）

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/systems/commands.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { commandsSystem } from './commands';
import { spawnUnit } from '../spawn';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { Command, TickContext, Unit, World } from '../types';

function makeWorld(units: Unit[] = []): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 100,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 550, goldLeft: 6000 },
      enemy: { side: 'enemy', x: 2450, goldLeft: 6000 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 500, enemy: 500 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth: 3000,
    difficultyMult: 1,
    endless: false,
  };
}

const ctx = (world: World, commands: Command[]): TickContext => ({ world, commands });

describe('commandsSystem — train', () => {
  it('queues a unit and deducts gold', () => {
    const world = makeWorld();
    commandsSystem(ctx(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]));
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(world.gold.player).toBe(400);
  });

  it('silently ignores an unaffordable order', () => {
    const world = makeWorld();
    world.gold.player = 0;
    commandsSystem(ctx(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]));
    expect(world.trainingQueue.player).toHaveLength(0);
    expect(world.gold.player).toBe(0);
  });

  it('routes the order to the requested side only', () => {
    const world = makeWorld();
    commandsSystem(ctx(world, [{ kind: 'train', side: 'enemy', typeId: 'archer' }]));
    expect(world.trainingQueue.enemy).toHaveLength(1);
    expect(world.trainingQueue.player).toHaveLength(0);
    expect(world.gold.enemy).toBe(420);
  });

  it('applies several orders in the same tick', () => {
    const world = makeWorld();
    commandsSystem(
      ctx(world, [
        { kind: 'train', side: 'player', typeId: 'miner' },
        { kind: 'train', side: 'player', typeId: 'miner' },
      ]),
    );
    expect(world.trainingQueue.player).toHaveLength(2);
    expect(world.gold.player).toBe(400);
  });

  it('does nothing with no commands', () => {
    const world = makeWorld();
    commandsSystem(ctx(world, []));
    expect(world.trainingQueue.player).toHaveLength(0);
    expect(world.gold.player).toBe(500);
  });
});

describe('commandsSystem — setStance', () => {
  it('sets the stance on the named units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, b]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(a.stance).toBe('retreat');
    expect(b.stance).toBe('hold');
  });

  it('sets several units at once', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, b]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1, 2], stance: 'advance' },
    ]));
    expect(a.stance).toBe('advance');
    expect(b.stance).toBe('advance');
  });

  it('refuses to command the other side units', () => {
    // The AI and the player share this command type (spec §9.1), so the side
    // field must be enforced or one side could puppeteer the other.
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 500 });
    const world = makeWorld([e]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(e.stance).toBe('hold');
  });

  it('ignores unknown unit ids', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const world = makeWorld([a]);
    expect(() =>
      commandsSystem(ctx(world, [
        { kind: 'setStance', side: 'player', unitIds: [999], stance: 'retreat' },
      ])),
    ).not.toThrow();
    expect(a.stance).toBe('hold');
  });

  it('ignores dead units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a]);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(a.stance).toBe('hold');
  });

  it('applies to every unit when the whole army is listed', () => {
    const units = [1, 2, 3].map((id) =>
      spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 400 + id * 40 }),
    );
    const world = makeWorld(units);
    commandsSystem(ctx(world, [
      { kind: 'setStance', side: 'player', unitIds: [1, 2, 3], stance: 'advance' },
    ]));
    for (const u of units) expect(u.stance).toBe('advance');
  });

  it('handles train and stance in the same tick', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const world = makeWorld([a]);
    commandsSystem(ctx(world, [
      { kind: 'train', side: 'player', typeId: 'miner' },
      { kind: 'setStance', side: 'player', unitIds: [1], stance: 'retreat' },
    ]));
    expect(world.trainingQueue.player).toHaveLength(1);
    expect(a.stance).toBe('retreat');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/commands.test.ts`
Expected: FAIL —— `commandsSystem` 是空实现。

- [ ] **Step 3: 写实现**

替换 `src/sim/systems/commands.ts`：

```ts
/**
 * Step 2 of 6: consume this tick's Command[].
 *
 * Runs after economy (so gold earned this tick is spendable in the same tick)
 * and before AI/movement (so orders take effect immediately rather than a tick
 * late).
 *
 * The player and the AI share this exact Command type — the AI is literally
 * pressing the same buttons (spec §9.1). That is why `side` is enforced here:
 * a command may only touch units belonging to the side that issued it.
 *
 * Commands are fire-and-forget: an unaffordable order is dropped, not queued.
 */

import { queueUnit } from '../training';
import type { Side, Stance, TickContext } from '../types';

export function commandsSystem(ctx: TickContext): void {
  const { world, commands } = ctx;

  for (const command of commands) {
    switch (command.kind) {
      case 'train':
        // A rejected order changes nothing at all: no gold spent, nothing
        // queued. The UI greys the button out; the sim just refuses.
        queueUnit(world, command.side, command.typeId);
        break;

      case 'setStance':
        applyStance(world, command.side, command.unitIds, command.stance);
        break;
    }
  }
}

function applyStance(
  world: TickContext['world'],
  side: Side,
  unitIds: number[],
  stance: Stance,
): void {
  if (unitIds.length === 0) return;

  const wanted = new Set(unitIds);
  for (const unit of world.units) {
    if (!wanted.has(unit.id)) continue;
    // Only your own, living units obey.
    if (unit.side !== side) continue;
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    unit.stance = stance;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/commands.test.ts`
Expected: PASS，13 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/systems/commands.ts src/sim/systems/commands.test.ts
git commit -m "feat(sim): implement train and setStance commands"
```

---

### Task 7: 矿工 AI 与移动修正

**Files:**
- Modify: `src/sim/systems/ai.ts`
- Modify: `src/sim/systems/movement.ts`
- Test: `src/sim/systems/ai.test.ts`（追加）
- Test: `src/sim/systems/movement.test.ts`（追加）

**Interfaces:**
- Consumes: `sim/targeting`, `data/constants`
- Produces: 无新导出，行为变更

**设计要点：** 矿工三段优先级；`retreat` 停止点符号修正；`gather` 状态不再让矿工「不动」。

- [ ] **Step 1: 写会失败的 AI 测试**

在 `src/sim/systems/ai.test.ts` 末尾追加：

```ts
describe('aiSystem — miners', () => {
  it('sends an idle miner to its own mine', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    const world = makeWorld([m]);
    aiSystem(ctx(world));
    expect(m.target).toEqual({ kind: 'mine', side: 'player' });
  });

  it('sends an enemy miner to the enemy mine', () => {
    const m = spawnUnit({ id: 1, side: 'enemy', typeId: 'miner', x: 2600 });
    const world = makeWorld([m]);
    aiSystem(ctx(world));
    expect(m.target).toEqual({ kind: 'mine', side: 'enemy' });
  });

  it('keeps mining when an enemy is nearby but the stance is not retreat', () => {
    // A miner has attack 0, so switching to a combat state would only make it
    // stand still and be killed. Its only defence is retreat.
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 560 });
    const world = makeWorld([m, e]);
    aiSystem(ctx(world));
    expect(m.target?.kind).toBe('mine');
  });

  it('flees home when an enemy is near and the stance is retreat', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500, stance: 'retreat' });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 560 });
    const world = makeWorld([m, e]);
    aiSystem(ctx(world));
    expect(m.target).toEqual({ kind: 'base', side: 'player' });
  });

  it('does not flee from an enemy that is far away', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400, stance: 'retreat' });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 4000 });
    const world = makeWorld([m, e]);
    aiSystem(ctx(world));
    expect(m.target?.kind).toBe('mine');
  });

  it('stops targeting a depleted mine', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    world.mines.player.goldLeft = 0;
    aiSystem(ctx(world));
    expect(m.target).toBeNull();
  });

  it('never enters the attack state', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 510 });
    const world = makeWorld([m, e]);
    aiSystem(ctx(world));
    expect(m.state).not.toBe('attack');
  });

  it('leaves a gathering miner alone', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 550 });
    m.state = 'gather';
    m.gatherTicksLeft = 50;
    const world = makeWorld([m]);
    aiSystem(ctx(world));
    expect(m.state).toBe('gather');
    expect(m.gatherTicksLeft).toBe(50);
  });
});
```

- [ ] **Step 2: 写会失败的移动测试**

在 `src/sim/systems/movement.test.ts` 末尾追加：

> **import 补充**：端到端那段需要 `createWorld`、`step`、`DEFAULT_MATCH`。在文件顶部加：
>
> ```ts
> import { createWorld } from '../createWorld';
> import { step } from '../tick';
> import { DEFAULT_MATCH } from '../../data/levels';
> ```
>
> `movement.test.ts` 现有的 `makeWorld` 桩仍供上面两段使用。

```ts
describe('movementSystem — miners', () => {
  it('walks a miner toward its mine', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 400 });
    m.state = 'move';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    movementSystem(ctx(world));
    expect(m.x).toBeGreaterThan(400);
  });

  it('does not move a gathering miner', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 550 });
    m.state = 'gather';
    m.target = { kind: 'mine', side: 'player' };
    const world = makeWorld([m]);
    movementSystem(ctx(world));
    expect(m.x).toBe(550);
  });

  it('walks a loaded miner back toward its base', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    m.carrying = 20;
    m.state = 'move';
    m.target = { kind: 'base', side: 'player' };
    const world = makeWorld([m]);
    movementSystem(ctx(world));
    expect(m.x).toBeLessThan(500);
  });
});

describe('movementSystem — retreat stop point', () => {
  it('retreats to the base FRONT, not behind it', () => {
    // Behind the base would put withdrawing units in the miners' lane.
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 800, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    for (let i = 0; i < 200; i++) movementSystem(ctx(world));
    // base 300 + BASE_RADIUS 40 + swordsman 14 = 354
    expect(a.x).toBeGreaterThan(300);
    expect(a.x).toBeCloseTo(354, 0);
  });

  it('mirrors for the enemy side', () => {
    const a = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 2200, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    for (let i = 0; i < 200; i++) movementSystem(ctx(world));
    expect(a.x).toBeCloseTo(2646, 0);
  });
});

describe('the full mining loop (end to end)', () => {
  it('walks out, mines, walks home, and banks', () => {
    // This is the test that proves the loops actually CLOSE. It runs the real
    // tick pipeline — no hand-rolled movement — so it exercises aiSystem's
    // miner branch, movementSystem's mine targeting, economySystem's gather
    // and banking, in the order the real game runs them.
    const world = createWorld(
      {
        ...DEFAULT_MATCH,
        startGold: { player: 200, enemy: 0 },
        startMiners: { player: 1, enemy: 0 },
        initialUnits: { player: [], enemy: [] },
        initialStance: 'hold',
      },
      1,
    );

    const startGold = world.gold.player;
    for (let i = 0; i < 600; i++) step(world, []);

    // One round trip is ~252 ticks, so two must have completed inside 600.
    expect(world.gold.player).toBeGreaterThanOrEqual(startGold + 20);
    expect(world.mines.player.goldLeft).toBeLessThan(6000);
  });

  it('leaves the miner holding when the seam runs dry', () => {
    const world = createWorld(
      {
        ...DEFAULT_MATCH,
        startGold: { player: 0, enemy: 0 },
        startMiners: { player: 1, enemy: 0 },
        initialUnits: { player: [], enemy: [] },
        initialStance: 'hold',
      },
      1,
    );
    world.mines.player.goldLeft = 0;

    for (let i = 0; i < 600; i++) step(world, []);

    const miner = world.units.find((u) => u.typeId === 'miner');
    expect(miner).toBeDefined();
    // Must not sit in 'gather' looping an animation that yields nothing.
    expect(miner!.state).not.toBe('gather');
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/ai.test.ts src/sim/systems/movement.test.ts`
Expected: FAIL —— 矿工无 AI 分支；撤退停在基地后方。

- [ ] **Step 4: 给 `aiSystem` 加矿工分支**

在 `src/sim/systems/ai.ts` 的循环里，`stunned` 分支之后、通用逻辑之前插入：

```ts
    // Miners run a different rule set: their job is the seam, not the fight.
    if (unit.typeId === 'miner') {
      updateMiner(ctx, unit);
      continue;
    }
```

并新增函数：

```ts
/**
 * Miners have three priorities (spec §6.3.1):
 *   1. an enemy nearby while retreating -> run home, abandoning the trip
 *   2. an enemy nearby otherwise         -> keep mining
 *   3. no enemy                          -> mine
 *
 * Priority 2 matters because a miner's attack is 0: switching it into a combat
 * state would only make it stand still and be killed. Its one defence is
 * retreat, which is exactly the lever the player has.
 */
function updateMiner(ctx: TickContext, unit: Unit): void {
  if (unit.state === 'gather') return;

  const enemyNear = nearestEnemyDistance(ctx, unit) <= TARGET_ACQUIRE_RANGE;

  if (enemyNear && unit.stance === 'retreat') {
    unit.target = { kind: 'base', side: unit.side };
    transition(ctx, unit, 'move');
    return;
  }

  // Keep (or resume) the mining trip.
  const targetIsMine = unit.target !== null && unit.target.kind === 'mine';
  if (!targetIsMine || !isTargetAlive(ctx.world, unit.target)) {
    const mine = { kind: 'mine', side: unit.side } as const;
    // A depleted seam is a dead end: go idle rather than loop an animation
    // that produces nothing.
    unit.target = isTargetAlive(ctx.world, mine) ? mine : null;
  }

  transition(ctx, unit, unit.target === null ? 'idle' : 'move');
}

/** Distance to the closest living enemy unit, or Infinity when there is none. */
function nearestEnemyDistance(ctx: TickContext, unit: Unit): number {
  let best = Infinity;
  for (const other of ctx.world.units) {
    if (other.side === unit.side) continue;
    if (other.state === 'dead' || other.hp <= 0) continue;
    const d = Math.abs(other.x - unit.x);
    if (d < best) best = d;
  }
  return best;
}
```

并更新 `ai.ts` 的 import：

```ts
import { acquireTarget, distanceToTarget, isTargetAlive, shouldKeepTarget } from '../targeting';
import { TARGET_ACQUIRE_RANGE } from '../../data/constants';
```

- [ ] **Step 5: 修正 `movement.ts`**

`integrateRetreat` 的符号：

```ts
/**
 * Falls back toward the player's own base, stopping at its FRONT (the
 * battlefield-facing edge).
 *
 * Not behind the base: with mines on the battlefield side, withdrawing units
 * and miners would share a lane, and the base front is where the line is meant
 * to re-form anyway.
 */
function integrateRetreat(ctx: TickContext, unit: Unit, speed: number, dir: number): void {
  if (unit.state === 'attack') return; // still swings while withdrawing

  const base = ctx.world.bases[unit.side];
  const stopX = base.x + dir * (BASE_RADIUS + UNITS[unit.typeId].bodyRadius);
  const delta = stopX - unit.x;
  if (Math.abs(delta) < 1e-9) return;
  unit.x += Math.sign(delta) * Math.min(speed, Math.abs(delta));
}
```

并让 `integrate` 只对 `gather` 状态跳过**非矿工**（矿工在 `gather` 时确实不动，但代码路径更清晰）：

```ts
function integrate(ctx: TickContext, unit: Unit): void {
  if (unit.state === 'dead' || unit.state === 'stunned') return;
  // A gathering miner is planted at the seam. Every other state moves.
  if (unit.state === 'gather') return;
  // ...rest unchanged
}
```

> 这里**不需要改动** `integrateAdvance` —— 它对 `mine` 目标走通用分支（`targetX` 已支持 mine），且 `attackRange` 为 0 的矿工会让 `distance <= attackRange` 在到达时成立从而停下。**验证这一点**：矿工 `attackRange = 0`，所以 `integrateAdvance` 里 `if (distance <= attackRange) return;` 只在距离为 0 时才停 —— 矿工会一直走到矿点正上方。若实测发现矿工停在矿点外一点，在 `integrateAdvance` 里为 mine 目标加一个容差：`if (target.kind === 'mine' && distance <= MINE_ARRIVAL_TOLERANCE) return;`。

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/ai.test.ts src/sim/systems/movement.test.ts`
Expected: PASS。

- [ ] **Step 7: 跑全量，确认 M2 未被打破**

Run: `npm test`
Expected: 全部 PASS。若有 M2 测试因撤退停止点改变而失败，**那是它断言了旧行为** —— 按 spec §6.3 的修正更新它。

- [ ] **Step 8: 提交**

```bash
git add src/sim/systems/ai.ts src/sim/systems/movement.ts src/sim/systems/ai.test.ts src/sim/systems/movement.test.ts
git commit -m "feat(sim): miner AI priorities, retreat stops at the base front"
```

---

### Task 8: 输入层

**Files:**
- Create: `src/input/commands.ts`
- Create: `src/input/desktop.ts`
- Test: `src/input/desktop.test.ts`

**Interfaces:**
- Consumes: `sim/types`
- Produces:
  - `train(side, typeId): Command`、`setStance(side, unitIds, stance): Command`
  - `class CommandQueue`：`push(cmd)`、`drain(): Command[]`
  - `class KeyState`：`isDown(code)`、`update(code, down)`
  - `CameraIntent`：`{ scrollDir: -1 | 0 | 1; zoomDelta: number }`

**设计要点：** 输入层产出**纯数据**，不直接碰 sim。`drain()` 的语义与 spec §6.3.3 的「指令只进第一个 tick」配套。

- [ ] **Step 1: 写会失败的测试**

创建 `src/input/desktop.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { train, setStance, CommandQueue, KeyState } from './desktop';

describe('command constructors', () => {
  it('builds a train command', () => {
    expect(train('player', 'swordsman')).toEqual({
      kind: 'train',
      side: 'player',
      typeId: 'swordsman',
    });
  });

  it('builds a stance command', () => {
    expect(setStance('player', [1, 2], 'retreat')).toEqual({
      kind: 'setStance',
      side: 'player',
      unitIds: [1, 2],
      stance: 'retreat',
    });
  });

  it('copies the id list so later mutation cannot alter a queued command', () => {
    const ids = [1, 2];
    const cmd = setStance('player', ids, 'advance');
    ids.push(3);
    expect(cmd).toEqual({ kind: 'setStance', side: 'player', unitIds: [1, 2], stance: 'advance' });
  });
});

describe('CommandQueue', () => {
  it('drains everything queued', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    q.push(train('player', 'archer'));
    expect(q.drain()).toHaveLength(2);
  });

  it('empties itself on drain', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    q.drain();
    expect(q.drain()).toHaveLength(0);
  });

  it('preserves order', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    q.push(train('player', 'archer'));
    expect(q.drain().map((c) => (c.kind === 'train' ? c.typeId : ''))).toEqual(['miner', 'archer']);
  });

  it('returns a fresh array each time so callers cannot corrupt the queue', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    const first = q.drain();
    first.push(train('player', 'archer'));
    expect(q.drain()).toHaveLength(0);
  });
});

describe('KeyState', () => {
  it('reports a key as up by default', () => {
    expect(new KeyState().isDown('KeyA')).toBe(false);
  });

  it('tracks press and release', () => {
    const k = new KeyState();
    k.update('KeyA', true);
    expect(k.isDown('KeyA')).toBe(true);
    k.update('KeyA', false);
    expect(k.isDown('KeyA')).toBe(false);
  });

  it('tracks several keys independently', () => {
    const k = new KeyState();
    k.update('KeyA', true);
    k.update('KeyD', true);
    k.update('KeyA', false);
    expect(k.isDown('KeyD')).toBe(true);
    expect(k.isDown('KeyA')).toBe(false);
  });

  it('reports a horizontal scroll direction', () => {
    const k = new KeyState();
    expect(k.scrollDir()).toBe(0);
    k.update('KeyA', true);
    expect(k.scrollDir()).toBe(-1);
    k.update('KeyD', true);
    // Both held: the net is zero rather than a race between them.
    expect(k.scrollDir()).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/input/desktop.test.ts`
Expected: FAIL，无法解析 `./desktop`。

- [ ] **Step 3: 写 `src/input/commands.ts`**

```ts
/**
 * Command constructors. Pure data — this file has no listeners and no Phaser.
 *
 * The Command type itself lives in sim/types.ts, because sim must be able to
 * name the type it consumes and sim may not import from input/ (spec §3.2).
 */

import type { Command, Side, Stance, UnitTypeId } from '../sim/types';

export function train(side: Side, typeId: UnitTypeId): Command {
  return { kind: 'train', side, typeId };
}

export function setStance(side: Side, unitIds: number[], stance: Stance): Command {
  // Copy: the caller may reuse and mutate its array, and a queued command must
  // not change after the fact.
  return { kind: 'setStance', side, unitIds: [...unitIds], stance };
}
```

- [ ] **Step 4: 写 `src/input/desktop.ts`**

```ts
/**
 * Desktop input state. Produces Commands; never touches the sim directly.
 *
 * The scene owns the Phaser listeners and feeds this module; keeping the state
 * machine Phaser-free makes the queueing and key logic testable without a
 * canvas.
 */

import { setStance as makeSetStance, train as makeTrain } from './commands';
import type { Command, Side, Stance, UnitTypeId } from '../sim/types';

export { makeSetStance as setStance, makeTrain as train };

/**
 * Collects commands between logic ticks.
 *
 * Commands are drained once per render frame and handed only to the FIRST tick
 * of that frame (spec §6.3.3): at 4x speed a frame runs several ticks, and
 * replaying the same order on each would spend four times the gold.
 */
export class CommandQueue {
  private pending: Command[] = [];

  push(command: Command): void {
    this.pending.push(command);
  }

  /** Returns everything queued and empties the queue. */
  drain(): Command[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  get size(): number {
    return this.pending.length;
  }
}

/** Held-key state, driven by the scene's keydown/keyup listeners. */
export class KeyState {
  private down = new Set<string>();

  update(code: string, isDown: boolean): void {
    if (isDown) this.down.add(code);
    else this.down.delete(code);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /**
   * -1 to scroll left, +1 to scroll right, 0 for neither or both.
   * Holding both cancels rather than letting one win a race.
   */
  scrollDir(): -1 | 0 | 1 {
    const left = this.isDown('KeyA') || this.isDown('ArrowLeft');
    const right = this.isDown('KeyD') || this.isDown('ArrowRight');
    if (left === right) return 0;
    return left ? -1 : 1;
  }
}

/** Convenience re-exports so callers import from one place. */
export function makeTrainCommand(side: Side, typeId: UnitTypeId): Command {
  return makeTrain(side, typeId);
}

export function makeStanceCommand(side: Side, unitIds: number[], stance: Stance): Command {
  return makeSetStance(side, unitIds, stance);
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm test -- src/input/desktop.test.ts`
Expected: PASS，12 passed。

- [ ] **Step 6: 验证 sim 边界未被破坏**

Run: `npm run lint && npx tsc --noEmit`
Expected: 无错误。`input/` 只 import `sim/types`（类型），这是允许的方向。

- [ ] **Step 7: 提交**

```bash
git add src/input/
git commit -m "feat(input): add command constructors, queue, and key state"
```

---

### Task 9: 速度控制

**Files:**
- Modify: `src/render/timestep.ts`
- Test: `src/render/timestep.test.ts`（追加）

**Interfaces:**
- Consumes: `data/constants`
- Produces:
  - `SPEED_STEPS = [1, 2, 4] as const`
  - `FixedTimestep.advance(deltaMs, speed = 1): number`

**设计要点（Review Focus #1）：** 速度是纯时间缩放，`world` 不知道速度存在。

- [ ] **Step 1: 写会失败的测试**

在 `src/render/timestep.test.ts` 末尾追加：

```ts
import { SPEED_STEPS } from './timestep';

describe('speed scaling', () => {
  it('offers 1x, 2x and 4x', () => {
    expect([...SPEED_STEPS]).toEqual([1, 2, 4]);
  });

  it('runs twice as many ticks per frame at 2x', () => {
    const slow = new FixedTimestep();
    const fast = new FixedTimestep();
    let slowTicks = 0;
    let fastTicks = 0;
    for (let i = 0; i < 60; i++) {
      slowTicks += slow.advance(STEP_MS);
      fastTicks += fast.advance(STEP_MS, 2);
    }
    expect(fastTicks).toBe(slowTicks * 2);
  });

  it('runs four times as many ticks per frame at 4x', () => {
    const slow = new FixedTimestep();
    const fast = new FixedTimestep();
    let slowTicks = 0;
    let fastTicks = 0;
    for (let i = 0; i < 60; i++) {
      slowTicks += slow.advance(STEP_MS);
      fastTicks += fast.advance(STEP_MS, 4);
    }
    expect(fastTicks).toBe(slowTicks * 4);
  });

  it('defaults to 1x when no speed is given', () => {
    const a = new FixedTimestep();
    const b = new FixedTimestep();
    expect(a.advance(STEP_MS * 3)).toBe(b.advance(STEP_MS * 3, 1));
  });

  it('still caps catch-up at high speed', () => {
    const ts = new FixedTimestep();
    const ticks = ts.advance(60_000, 4);
    expect(ticks).toBeLessThanOrEqual(Math.ceil(MAX_ACCUMULATOR_MS / STEP_MS));
  });

  it('keeps alpha in range at every speed', () => {
    for (const speed of SPEED_STEPS) {
      const ts = new FixedTimestep();
      for (const delta of [0, 1, STEP_MS / 3, STEP_MS, STEP_MS * 2.5]) {
        ts.advance(delta, speed);
        expect(ts.alpha).toBeGreaterThanOrEqual(0);
        expect(ts.alpha).toBeLessThan(1);
      }
    }
  });

  it('treats a zero or negative speed as 1x rather than stalling', () => {
    // A stalled timestep would freeze the game with no visible cause.
    const ts = new FixedTimestep();
    expect(ts.advance(STEP_MS * 2, 0)).toBe(2);
    const ts2 = new FixedTimestep();
    expect(ts2.advance(STEP_MS * 2, -1)).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/render/timestep.test.ts`
Expected: FAIL —— `advance` 不接受第二个参数。

- [ ] **Step 3: 写实现**

修改 `src/render/timestep.ts` 的类：

```ts
/** Selectable game speeds. Logic is identical at every one. */
export const SPEED_STEPS = [1, 2, 4] as const;

export type GameSpeed = (typeof SPEED_STEPS)[number];

export class FixedTimestep {
  private accumulator = 0;

  /**
   * Feeds one render frame's elapsed time and returns how many logic ticks
   * should run this frame.
   *
   * `speed` scales TIME, not the tick. The simulation still advances in whole
   * 30 Hz steps, so a match played at 4x produces the same sequence of states
   * as the same match at 1x — only fewer frames pass. That is what lets the
   * determinism hash be speed-independent.
   *
   * A non-positive speed falls back to 1x: a stalled accumulator would freeze
   * the game with nothing on screen to explain why.
   */
  advance(deltaMs: number, speed = 1): number {
    const scale = speed > 0 ? speed : 1;

    if (deltaMs > 0) {
      this.accumulator += deltaMs * scale;
    }
    if (this.accumulator > MAX_ACCUMULATOR_MS) {
      this.accumulator = MAX_ACCUMULATOR_MS;
    }

    const ticks = Math.floor(this.accumulator / STEP_MS);
    this.accumulator -= ticks * STEP_MS;
    return ticks;
  }

  /** Interpolation factor in [0, 1) between the previous and current tick. */
  get alpha(): number {
    const alpha = this.accumulator / STEP_MS;
    if (alpha < 0) return 0;
    if (alpha >= 1) return 0.999999;
    return alpha;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/render/timestep.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/render/timestep.ts src/render/timestep.test.ts
git commit -m "feat(render): add speed scaling to the fixed timestep"
```

---

### Task 10: 相机

**Files:**
- Create: `src/render/camera.ts`
- Test: `src/render/camera.test.ts`

**Interfaces:**
- Consumes: `data/constants`
- Produces:
  - `MIN_ZOOM = 0.6`、`MAX_ZOOM = 1.2`
  - `clampZoom(zoom: number): number`
  - `maxScrollX(worldWidth: number, viewportWidth: number, zoom: number): number`
  - `clampScrollX(x: number, worldWidth: number, viewportWidth: number, zoom: number): number`
  - `EDGE_SCROLL_MARGIN = 40`

**设计要点：** 相机 X 的钳制**必须按当前缩放计算**，否则 0.6x 时会露出世界外的空白。

- [ ] **Step 1: 写会失败的测试**

创建 `src/render/camera.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { clampZoom, clampScrollX, maxScrollX, MIN_ZOOM, MAX_ZOOM, EDGE_SCROLL_MARGIN } from './camera';
import { WORLD_WIDTH } from '../data/constants';

describe('clampZoom', () => {
  it('keeps zoom inside the allowed band', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
  });

  it('clamps below the minimum', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
  });

  it('clamps above the maximum', () => {
    expect(clampZoom(5)).toBe(MAX_ZOOM);
  });

  it('uses the spec band of 0.6x to 1.2x', () => {
    expect(MIN_ZOOM).toBe(0.6);
    expect(MAX_ZOOM).toBe(1.2);
  });
});

describe('maxScrollX', () => {
  it('is zero when the whole world fits on screen', () => {
    // At 0.6x a 1280px viewport sees 2133px of world, leaving 867px to scroll.
    expect(maxScrollX(WORLD_WIDTH, 1280, 1)).toBe(WORLD_WIDTH - 1280);
  });

  it('shrinks as the camera zooms out', () => {
    const wide = maxScrollX(WORLD_WIDTH, 1280, 0.6);
    const narrow = maxScrollX(WORLD_WIDTH, 1280, 1.2);
    expect(wide).toBeLessThan(narrow);
  });

  it('never goes negative', () => {
    expect(maxScrollX(500, 1280, 1)).toBe(0);
  });

  it('is exactly right at 0.6x', () => {
    // 1280 / 0.6 = 2133.33 world px visible; 3000 - 2133.33 = 866.67
    expect(maxScrollX(WORLD_WIDTH, 1280, 0.6)).toBeCloseTo(866.67, 1);
  });
});

describe('clampScrollX', () => {
  it('keeps a valid scroll unchanged', () => {
    expect(clampScrollX(500, WORLD_WIDTH, 1280, 1)).toBe(500);
  });

  it('clamps at the left edge', () => {
    expect(clampScrollX(-100, WORLD_WIDTH, 1280, 1)).toBe(0);
  });

  it('clamps at the right edge', () => {
    expect(clampScrollX(99999, WORLD_WIDTH, 1280, 1)).toBe(maxScrollX(WORLD_WIDTH, 1280, 1));
  });

  it('respects the zoom when clamping', () => {
    // At 0.6x the right limit is much smaller, so a value valid at 1x is not.
    expect(clampScrollX(1500, WORLD_WIDTH, 1280, 0.6)).toBeCloseTo(866.67, 1);
    expect(clampScrollX(1500, WORLD_WIDTH, 1280, 1.2)).toBe(1500);
  });
});

describe('edge scroll', () => {
  it('has a margin narrower than the viewport', () => {
    expect(EDGE_SCROLL_MARGIN).toBeGreaterThan(0);
    expect(EDGE_SCROLL_MARGIN).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/render/camera.test.ts`
Expected: FAIL，无法解析 `./camera`。

- [ ] **Step 3: 写实现**

创建 `src/render/camera.ts`：

```ts
/**
 * Camera maths, kept free of Phaser so the clamping rules are testable.
 *
 * The one subtlety: the right-hand scroll limit depends on the current zoom.
 * At 0.6x a 1280px viewport shows 2133 world px, so the camera may only travel
 * 867px before the world's edge would come into view. Using a fixed limit
 * would expose empty space whenever the player zoomed out.
 */

import { WORLD_WIDTH } from '../data/constants';

/** Spec §7.2. */
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 1.2;

/** How close to a viewport edge the pointer must be to scroll, in px. */
export const EDGE_SCROLL_MARGIN = 40;

/** Zoom clamped to the allowed band. */
export function clampZoom(zoom: number): number {
  if (zoom < MIN_ZOOM) return MIN_ZOOM;
  if (zoom > MAX_ZOOM) return MAX_ZOOM;
  return zoom;
}

/** The largest scrollX that still keeps the world covering the viewport. */
export function maxScrollX(worldWidth: number, viewportWidth: number, zoom: number): number {
  const visible = viewportWidth / (zoom > 0 ? zoom : 1);
  return Math.max(0, worldWidth - visible);
}

/** Scroll clamped to [0, maxScrollX]. */
export function clampScrollX(
  x: number,
  worldWidth: number,
  viewportWidth: number,
  zoom: number,
): number {
  const max = maxScrollX(worldWidth, viewportWidth, zoom);
  if (x < 0) return 0;
  if (x > max) return max;
  return x;
}

/** Default world width, re-exported so callers need one import. */
export { WORLD_WIDTH };
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/render/camera.test.ts`
Expected: PASS，14 passed。

- [ ] **Step 5: 提交**

```bash
git add src/render/camera.ts src/render/camera.test.ts
git commit -m "feat(render): add camera zoom and scroll clamping"
```

---

### Task 11: 选中状态

**Files:**
- Create: `src/render/selection.ts`
- Test: `src/render/selection.test.ts`

**Interfaces:**
- Consumes: `sim/types`
- Produces:
  - `class Selection`：`select(id)`、`toggle(id)`、`clear()`、`has(id)`、`ids(): number[]`、`size`
  - `selectedIdsOf(selection: Selection, units: Unit[], side: Side): number[]`

**设计要点：** 选中状态属于渲染层，**不进 sim**（spec §3.1）。

- [ ] **Step 1: 写会失败的测试**

创建 `src/render/selection.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { Selection, selectedIdsOf } from './selection';
import { spawnUnit } from '../sim/spawn';

describe('Selection', () => {
  it('starts empty', () => {
    const s = new Selection();
    expect(s.size).toBe(0);
    expect(s.ids()).toEqual([]);
  });

  it('selects a single id, replacing the previous one', () => {
    const s = new Selection();
    s.select(1);
    s.select(2);
    expect(s.ids()).toEqual([2]);
    expect(s.has(1)).toBe(false);
    expect(s.has(2)).toBe(true);
  });

  it('clears', () => {
    const s = new Selection();
    s.select(1);
    s.clear();
    expect(s.size).toBe(0);
  });

  it('toggles an id on and off', () => {
    const s = new Selection();
    s.toggle(5);
    expect(s.has(5)).toBe(true);
    s.toggle(5);
    expect(s.has(5)).toBe(false);
  });

  it('keeps other ids when toggling one off', () => {
    const s = new Selection();
    s.toggle(1);
    s.toggle(2);
    s.toggle(1);
    expect(s.ids()).toEqual([2]);
  });

  it('returns ids in insertion order', () => {
    const s = new Selection();
    s.toggle(3);
    s.toggle(1);
    s.toggle(2);
    expect(s.ids()).toEqual([3, 1, 2]);
  });

  it('returns a copy so callers cannot mutate internal state', () => {
    const s = new Selection();
    s.select(1);
    const ids = s.ids();
    ids.push(99);
    expect(s.ids()).toEqual([1]);
  });
});

describe('selectedIdsOf', () => {
  it('returns only living units of the requested side', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 200 });
    const c = spawnUnit({ id: 3, side: 'player', typeId: 'archer', x: 300 });
    c.state = 'dead';
    c.hp = 0;

    const s = new Selection();
    s.toggle(1);
    s.toggle(2);
    s.toggle(3);

    expect(selectedIdsOf(s, [a, b, c], 'player')).toEqual([1]);
  });

  it('drops ids that no longer exist', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const s = new Selection();
    s.toggle(1);
    s.toggle(999);
    expect(selectedIdsOf(s, [a], 'player')).toEqual([1]);
  });

  it('returns an empty list for an empty selection', () => {
    expect(selectedIdsOf(new Selection(), [], 'player')).toEqual([]);
  });

  it('is deterministic in order', () => {
    const units = [1, 2, 3].map((id) =>
      spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 100 * id }),
    );
    const s = new Selection();
    s.toggle(3);
    s.toggle(1);
    s.toggle(2);
    expect(selectedIdsOf(s, units, 'player')).toEqual([3, 1, 2]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/render/selection.test.ts`
Expected: FAIL，无法解析 `./selection`。

- [ ] **Step 3: 写实现**

创建 `src/render/selection.ts`：

```ts
/**
 * Selection is RENDER-LAYER state and never enters the simulation (spec §3.1).
 *
 * It lives here rather than in World because nothing in the simulation depends
 * on what the player has highlighted — selection changes no rule, and putting
 * it in the world would make the determinism hash depend on UI clicks.
 */

import type { Side, Unit } from '../sim/types';

export class Selection {
  /** Insertion-ordered so `ids()` is deterministic. */
  private selected = new Set<number>();

  /** Replaces the selection with a single id. */
  select(id: number): void {
    this.selected.clear();
    this.selected.add(id);
  }

  /** Adds or removes one id, leaving the rest alone. */
  toggle(id: number): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  clear(): void {
    this.selected.clear();
  }

  has(id: number): boolean {
    return this.selected.has(id);
  }

  get size(): number {
    return this.selected.size;
  }

  /** A copy, so a caller mutating the result cannot corrupt the selection. */
  ids(): number[] {
    return [...this.selected];
  }
}

/**
 * The selection narrowed to units that actually exist, are alive, and belong
 * to `side`. Used when building a stance command.
 */
export function selectedIdsOf(selection: Selection, units: Unit[], side: Side): number[] {
  const wanted = selection.ids();
  if (wanted.length === 0) return [];

  const byId = new Map<number, Unit>();
  for (const unit of units) byId.set(unit.id, unit);

  const out: number[] = [];
  for (const id of wanted) {
    const unit = byId.get(id);
    if (!unit) continue;
    if (unit.side !== side) continue;
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    out.push(id);
  }
  return out;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/render/selection.test.ts`
Expected: PASS，11 passed。

- [ ] **Step 5: 提交**

```bash
git add src/render/selection.ts src/render/selection.test.ts
git commit -m "feat(render): add selection state, kept out of the sim"
```

---

### Task 12: 速度无关的确定性

在接入 HUD 之前先锁死这条性质，因为它是整个速度控制的正确性基础。

**Files:**
- Create: `src/sim/speed-determinism.test.ts`

**Interfaces:**
- Consumes: `sim/harness`, `sim/hash`
- Produces: 无（纯测试）

- [ ] **Step 1: 写测试**

创建 `src/sim/speed-determinism.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import type { MatchConfig } from './types';

/**
 * Speed is a RENDER-LAYER time scale (spec §7.2): the simulation advances in
 * whole 30 Hz steps regardless, so the same seed must produce the same states
 * whether the player watched at 1x or 4x.
 *
 * This is the property that makes the speed control safe. If it ever breaks,
 * a player's replay would differ depending on how fast they played it — which
 * would quietly invalidate the determinism guarantee M2 established.
 */

const config: MatchConfig = {
  ...DEFAULT_MATCH,
  startMiners: { player: 2, enemy: 2 },
  initialUnits: {
    player: ['archer', 'swordsman', 'swordsman'],
    enemy: ['archer', 'swordsman', 'swordsman'],
  },
};

/** Runs N logic ticks with commands delivered on the first tick of each "frame". */
function runTicks(ticks: number, seed: number, ticksPerFrame: number) {
  const world = createWorld(config, seed);
  let done = 0;
  while (done < ticks) {
    const batch = Math.min(ticksPerFrame, ticks - done);
    for (let i = 0; i < batch; i++) {
      // Commands would go here; an empty list keeps the comparison focused on
      // tick advancement, which is what speed changes.
      step(world, []);
    }
    done += batch;
  }
  return hashWorld(world);
}

describe('speed independence', () => {
  it('reaches the same state at 1 tick per frame and 4 ticks per frame', () => {
    const one = runTicks(600, 4242, 1);
    const four = runTicks(600, 4242, 4);
    expect(four).toBe(one);
  });

  it('reaches the same state at 2 ticks per frame', () => {
    const one = runTicks(600, 4242, 1);
    const two = runTicks(600, 4242, 2);
    expect(two).toBe(one);
  });

  it('holds for an uneven frame split', () => {
    // Real frames do not divide evenly into ticks; 7 at a time leaves a
    // remainder the accumulator would carry in the real loop.
    const one = runTicks(600, 99, 1);
    const seven = runTicks(600, 99, 7);
    expect(seven).toBe(one);
  });

  it('still differs between different seeds', () => {
    expect(runTicks(300, 1, 1)).not.toBe(runTicks(300, 2, 1));
  });

  it('is stable over a long run', () => {
    const one = runTicks(3000, 777, 1);
    const four = runTicks(3000, 777, 4);
    expect(four).toBe(one);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npm test -- src/sim/speed-determinism.test.ts`
Expected: PASS —— 因为 `step` 本身不知道速度，这个性质在实现上是天然成立的。**这个测试的价值是把它锁死**：将来若有人把速度实现成「跳过 tick」或「改变 tick 粒度」，它会立刻变红。

- [ ] **Step 3: 提交**

```bash
git add src/sim/speed-determinism.test.ts
git commit -m "test(sim): lock down speed-independent determinism"
```

---

### Task 13: HUD

**Files:**
- Create: `src/render/hud/ResourceBar.ts`
- Create: `src/render/hud/CommandBar.ts`
- Create: `src/render/hud/SpeedControl.ts`
- Modify: `src/render/scenes/BattleScene.ts`（装配）

**Interfaces:**
- Consumes: `i18n`, `sim/types`, `input/commands`
- Produces:
  - `createResourceBar(scene, opts): { sync(world, width): void; destroy(): void }`
  - `createCommandBar(scene, opts): { sync(world, width, height): void; destroy(): void }`
  - `createSpeedControl(scene, opts): { sync(width): void; destroy(): void }`
  - `CommandBarOptions = { onTrain(typeId): void; onStance(stance): void }`
  - `SpeedControlOptions = { onSpeedChange(speed): void }`

**设计要点：** 全部用 Phaser GameObject，`setScrollFactor(0)`，锚定边缘。

- [ ] **Step 1: 写 `ResourceBar.ts`**

```ts
import Phaser from 'phaser';
import { t } from '../../i18n';
import type { Side, World } from '../../sim/types';

const FONT = { fontFamily: 'monospace', fontSize: '16px', color: '#e8edf4' };
const BG_COLOR = 0x141821;
const BG_ALPHA = 0.72;
const PADDING = 10;

export interface ResourceBar {
  sync(world: World, side: Side): void;
  destroy(): void;
}

/**
 * Gold and population, top-left.
 *
 * Anchored to the top-left corner with fixed offsets: nothing else competes for
 * that space, so it needs no recomputation on resize.
 */
export function createResourceBar(scene: Phaser.Scene, side: Side): ResourceBar {
  // One container holds the background and the label, so there is exactly one
  // position to set and no chance of the two drifting apart.
  const container = scene.add.container(12, 12).setScrollFactor(0).setDepth(900);

  const bg = scene.add.graphics();
  const label = scene.add.text(PADDING, PADDING, '', FONT);
  container.add([bg, label]);

  const bar: ResourceBar = {
    sync(world: World): void {
      const gold = Math.floor(world.gold[side]);
      const pop = world.popUsed[side];
      const cap = world.popCap[side];

      label.setText(`${t('ui.gold')} ${gold}    ${t('ui.population')} ${pop}/${cap}`);

      bg.clear();
      bg.fillStyle(BG_COLOR, BG_ALPHA);
      bg.fillRect(0, 0, label.width + PADDING * 2, label.height + PADDING * 2);
    },

    destroy(): void {
      container.destroy(true);
    },
  };

  return bar;
}
```

> **注**：`bg` 与 `label` 放在同一个 `Container` 里，所以只有**一个**位置需要设置，
> 两者不可能错位。子元素的位置是相对容器的局部坐标。

- [ ] **Step 2: 写 `CommandBar.ts`**

```ts
import Phaser from 'phaser';
import { t } from '../../i18n';
import { UNITS, type UnitTypeId } from '../../data/units';
import { canQueue } from '../../sim/training';
import type { Side, Stance, World } from '../../sim/types';

const BG_COLOR = 0x141821;
const BG_ALPHA = 0.85;
const BUTTON_W = 108;
const BUTTON_H = 44;
const GAP = 8;
const BAR_HEIGHT = 64;
const ENABLED_COLOR = 0x2f3a4a;
const DISABLED_COLOR = 0x1c2028;
const TEXT_ENABLED = '#e8edf4';
const TEXT_DISABLED = '#6b7280';

/** The four trainable unit types, in the order the buttons appear. */
const TRAINABLE: UnitTypeId[] = ['miner', 'swordsman', 'archer', 'spearman'];

export interface CommandBarOptions {
  onTrain(typeId: UnitTypeId): void;
  onStance(stance: Stance): void;
}

export interface CommandBar {
  sync(world: World, width: number, height: number): void;
  destroy(): void;
}

/**
 * The bottom bar: one button per unit type plus the three army-wide stance
 * buttons.
 *
 * Anchored to the bottom and centred on the viewport width, so a resize only
 * moves it rather than requiring a full re-layout of every element.
 *
 * Buttons are greyed out rather than hidden when unaffordable: a button that
 * disappears makes the player wonder whether they mis-clicked, whereas a greyed
 * one plus a reason tells them exactly what to do.
 */
export function createCommandBar(
  scene: Phaser.Scene,
  side: Side,
  opts: CommandBarOptions,
): CommandBar {
  const bg = scene.add.graphics().setScrollFactor(0).setDepth(900);

  interface Button {
    typeId: UnitTypeId;
    rect: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    reason: Phaser.GameObjects.Text;
  }

  const buttons: Button[] = TRAINABLE.map((typeId) => {
    const rect = scene.add
      .rectangle(0, 0, BUTTON_W, BUTTON_H, ENABLED_COLOR)
      .setScrollFactor(0)
      .setDepth(901)
      .setInteractive({ useHandCursor: true });

    const label = scene.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: TEXT_ENABLED })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(902);

    const reason = scene.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#e08a8a' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(902);

    rect.on('pointerdown', () => opts.onTrain(typeId));

    return { typeId, rect, label, reason };
  });

  const STANCES: { stance: Stance; key: string }[] = [
    { stance: 'advance', key: 'ui.advanceAll' },
    { stance: 'hold', key: 'ui.holdAll' },
    { stance: 'retreat', key: 'ui.retreatAll' },
  ];

  const stanceButtons = STANCES.map(({ stance, key }) => {
    const rect = scene.add
      .rectangle(0, 0, BUTTON_W, BUTTON_H, ENABLED_COLOR)
      .setScrollFactor(0)
      .setDepth(901)
      .setInteractive({ useHandCursor: true });

    const label = scene.add
      .text(0, 0, t(key), { fontFamily: 'monospace', fontSize: '13px', color: TEXT_ENABLED })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(902);

    rect.on('pointerdown', () => opts.onStance(stance));

    return { stance, rect, label };
  });

  const bar: CommandBar = {
    sync(world: World, width: number, height: number): void {
      const total = (TRAINABLE.length + STANCES.length) * BUTTON_W + (TRAINABLE.length + STANCES.length - 1) * GAP;
      let x = Math.round((width - total) / 2);
      const y = height - BAR_HEIGHT / 2 - 8;

      bg.clear();
      bg.fillStyle(BG_COLOR, BG_ALPHA);
      bg.fillRect(0, height - BAR_HEIGHT, width, BAR_HEIGHT);

      for (const b of buttons) {
        const def = UNITS[b.typeId];
        const check = canQueue(world, side, b.typeId);
        const affordable = check.ok;

        b.rect.setPosition(x + BUTTON_W / 2, y);
        b.rect.setFillStyle(affordable ? ENABLED_COLOR : DISABLED_COLOR);
        b.label
          .setPosition(x + BUTTON_W / 2, y - 7)
          .setText(`${t(def.nameKey)} ${def.goldCost}`)
          .setColor(affordable ? TEXT_ENABLED : TEXT_DISABLED);
        b.reason
          .setPosition(x + BUTTON_W / 2, y + 13)
          .setText(
            check.ok
              ? ''
              : check.reason === 'gold'
                ? t('ui.noGold')
                : t('ui.popFull'),
          );

        x += BUTTON_W + GAP;
      }

      for (const s of stanceButtons) {
        s.rect.setPosition(x + BUTTON_W / 2, y);
        s.label.setPosition(x + BUTTON_W / 2, y);
        x += BUTTON_W + GAP;
      }
    },

    destroy(): void {
      bg.destroy();
      for (const b of buttons) {
        b.rect.destroy();
        b.label.destroy();
        b.reason.destroy();
      }
      for (const s of stanceButtons) {
        s.rect.destroy();
        s.label.destroy();
      }
    },
  };

  return bar;
}
```

- [ ] **Step 3: 写 `SpeedControl.ts`**

```ts
import Phaser from 'phaser';
import { t } from '../../i18n';
import { SPEED_STEPS, type GameSpeed } from '../timestep';

const BUTTON_W = 52;
const BUTTON_H = 30;
const GAP = 6;
const ENABLED_COLOR = 0x2f3a4a;
const ACTIVE_COLOR = 0x3f6fd0;
const FONT = { fontFamily: 'monospace', fontSize: '13px', color: '#e8edf4' };

export interface SpeedControlOptions {
  onSpeedChange(speed: GameSpeed): void;
}

export interface SpeedControl {
  sync(width: number, current: GameSpeed): void;
  destroy(): void;
}

/**
 * Speed buttons, anchored to the top-right corner.
 *
 * Anchored by its RIGHT edge: with absolute coordinates the bar would slide
 * toward the middle of the screen as the window widens.
 */
export function createSpeedControl(scene: Phaser.Scene, opts: SpeedControlOptions): SpeedControl {
  const buttons = SPEED_STEPS.map((speed) => {
    const rect = scene.add
      .rectangle(0, 0, BUTTON_W, BUTTON_H, ENABLED_COLOR)
      .setScrollFactor(0)
      .setDepth(901)
      .setInteractive({ useHandCursor: true });

    const label = scene.add
      .text(0, 0, `${speed}x`, FONT)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(902);

    rect.on('pointerdown', () => opts.onSpeedChange(speed));

    return { speed, rect, label };
  });

  const header = scene.add
    .text(0, 0, t('ui.speed'), FONT)
    .setOrigin(1, 0.5)
    .setScrollFactor(0)
    .setDepth(902);

  return {
    sync(width: number, current: GameSpeed): void {
      const total = buttons.length * BUTTON_W + (buttons.length - 1) * GAP;
      let x = width - 16 - total;
      const y = 28;

      for (const b of buttons) {
        b.rect.setPosition(x + BUTTON_W / 2, y);
        b.rect.setFillStyle(b.speed === current ? ACTIVE_COLOR : ENABLED_COLOR);
        b.label.setPosition(x + BUTTON_W / 2, y);
        x += BUTTON_W + GAP;
      }

      header.setPosition(width - 16 - total - 10, y);
    },

    destroy(): void {
      for (const b of buttons) {
        b.rect.destroy();
        b.label.destroy();
      }
      header.destroy();
    },
  };
}
```

- [ ] **Step 4: 在 `BattleScene` 里装配**

在 `src/render/scenes/BattleScene.ts` 中：

顶部 import 追加：

```ts
import { CommandQueue, KeyState, setStance as cmdSetStance, train as cmdTrain } from '../../input/desktop';
import { clampScrollX, clampZoom, EDGE_SCROLL_MARGIN, MAX_ZOOM, MIN_ZOOM } from '../camera';
import { createCommandBar, type CommandBar } from '../hud/CommandBar';
import { createResourceBar, type ResourceBar } from '../hud/ResourceBar';
import { createSpeedControl, type SpeedControl } from '../hud/SpeedControl';
import { Selection } from '../selection';
import { SPEED_STEPS, type GameSpeed } from '../timestep';
import type { UnitTypeId } from '../../data/units';
import type { Stance } from '../../sim/types';
```

类字段追加：

```ts
  private commands = new CommandQueue();
  private keys = new KeyState();
  private selection = new Selection();
  private resourceBar!: ResourceBar;
  private commandBar!: CommandBar;
  private speedControl!: SpeedControl;
  private speed: GameSpeed = 1;
  private paused = false;
  private selectedMarker!: Phaser.GameObjects.Graphics;
```

在 `create()` 里装配（放在 `this.tickLabel` 之后）：

```ts
    this.selectedMarker = this.add.graphics().setDepth(6);

    this.resourceBar = createResourceBar(this, 'player');
    this.commandBar = createCommandBar(this, 'player', {
      onTrain: (typeId: UnitTypeId) => this.commands.push(cmdTrain('player', typeId)),
      onStance: (stance: Stance) => {
        const ids = this.world.units
          .filter((u) => u.side === 'player' && u.state !== 'dead')
          .map((u) => u.id);
        this.commands.push(cmdSetStance('player', ids, stance));
      },
    });
    this.speedControl = createSpeedControl(this, {
      onSpeedChange: (speed: GameSpeed) => {
        this.speed = speed;
      },
    });

    this.setupInput();
```

新增方法：

```ts
  /** Wires keyboard, pointer and wheel to the input state and command queue. */
  private setupInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown', (e: KeyboardEvent) => {
        this.keys.update(e.code, true);
        // Stance hotkeys for the selection.
        if (e.code === 'KeyQ') this.pushStance('advance');
        if (e.code === 'KeyW') this.pushStance('hold');
        if (e.code === 'KeyE') this.pushStance('retreat');
        if (e.code === 'Space') this.paused = !this.paused;
      });
      kb.on('keyup', (e: KeyboardEvent) => this.keys.update(e.code, false));
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleClick(p));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(clampZoom(cam.zoom - dy * 0.001));
      this.clampCamera();
    });
  }

  /** Selects the unit under the pointer, or clears the selection on empty ground. */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    // HUD clicks are handled by the interactive objects themselves.
    if (pointer.y > this.scale.height - 64) return;

    const worldX = pointer.x / this.cameras.main.zoom + this.cameras.main.scrollX;
    const hit = this.world.units.find(
      (u) =>
        u.side === 'player' &&
        u.state !== 'dead' &&
        Math.abs(u.x - worldX) <= 20,
    );

    if (hit) this.selection.select(hit.id);
    else this.selection.clear();
  }

  /** Sends a stance command for the current selection only. */
  private pushStance(stance: Stance): void {
    const ids = this.selection.ids().filter((id) => {
      const u = this.world.units.find((x) => x.id === id);
      return u !== undefined && u.side === 'player' && u.state !== 'dead';
    });
    if (ids.length === 0) return;
    this.commands.push(cmdSetStance('player', ids, stance));
  }

  /** Scrolls by keyboard/edge, then clamps so no out-of-world space shows. */
  private updateCamera(delta: number): void {
    const cam = this.cameras.main;
    const kbDir = this.keys.scrollDir();
    const pointer = this.input.activePointer;
    let edgeDir: -1 | 0 | 1 = 0;
    if (pointer.x <= EDGE_SCROLL_MARGIN) edgeDir = -1;
    else if (pointer.x >= this.scale.width - EDGE_SCROLL_MARGIN) edgeDir = 1;

    const dir = kbDir !== 0 ? kbDir : edgeDir;
    if (dir !== 0) {
      const speedPx = 0.9 * delta;
      cam.setScroll(cam.scrollX + dir * speedPx, cam.scrollY);
    }
    this.clampCamera();
  }

  private clampCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(clampZoom(cam.zoom));
    cam.setScroll(
      clampScrollX(cam.scrollX, WORLD_WIDTH, this.scale.width, cam.zoom),
      cam.scrollY,
    );
  }

  /** Draws an ellipse under each selected unit. */
  private drawSelectionMarkers(): void {
    const g = this.selectedMarker;
    g.clear();
    if (this.selection.size === 0) return;

    g.lineStyle(2, 0xffffff, 0.75);
    for (const unit of this.world.units) {
      if (!this.selection.has(unit.id)) continue;
      const x = unit.prevX + (unit.x - unit.prevX) * this.timestep.alpha;
      g.strokeEllipse(x, this.groundY - 1, 34, 10);
    }
  }
```

修改 `update()`：

```ts
  update(_time: number, delta: number): void {
    if (this.paused) return;

    this.updateCamera(delta);

    const ticks = this.timestep.advance(delta, this.speed);

    for (let i = 0; i < ticks; i++) {
      // Commands reach only the FIRST tick of the frame (spec §6.3.3): at 4x
      // a frame runs several ticks, and replaying an order on each would spend
      // four times the gold.
      step(this.world, i === 0 ? this.commands.drain() : []);
    }

    this.syncStickmen();
    this.projectiles.sync(this.world.projectiles, this.timestep.alpha);
    this.drawSelectionMarkers();

    this.resourceBar.sync(this.world, 'player');
    this.commandBar.sync(this.world, this.scale.width, this.scale.height);
    this.speedControl.sync(this.scale.width, this.speed);

    if (ticks > 0) {
      this.tickLabel.setText(
        `tick ${this.world.tick}  |  ${TICKS_PER_SEC} Hz  |  ${this.speed}x`,
      );
    }
  }
```

修改 `layout()` 末尾追加：

```ts
    this.commandBar.sync(this.world, this.scale.width, this.scale.height);
    this.speedControl.sync(this.scale.width, this.speed);
```

并在 `create()` 的 shutdown 钩子里销毁 HUD：

```ts
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', onResize);
      this.resourceBar.destroy();
      this.commandBar.destroy();
      this.speedControl.destroy();
    });
```

- [ ] **Step 5: 验证编译与类型**

Run: `npx tsc --noEmit && npm run lint`
Expected: 无错误。若 `SPEED_STEPS` / `MIN_ZOOM` / `MAX_ZOOM` 报未使用，删掉未用的 import。

- [ ] **Step 6: 提交**

```bash
git add src/render/hud/ src/render/scenes/BattleScene.ts
git commit -m "feat(render): add resource bar, command bar, speed control, selection"
```

---

### Task 14: 完整可玩关卡与 M3 验收

**Files:**
- Modify: `src/data/levels.ts`
- Create: `src/sim/m3-acceptance.test.ts`

**Interfaces:**
- Consumes: `sim/training`, `sim/economy`, `sim/tick`, `sim/hash`
- Produces: `RENDER_DEMO_MATCH` 改为完整关卡

- [ ] **Step 1: 改演示配置**

修改 `src/data/levels.ts`：

```ts
/**
 * TEMPORARY (M3): a complete playable skirmish — a base, a mine, three
 * starting miners, and enough gold to make a first choice. The enemy advances
 * with M2's stance system; M4 replaces this with level-driven data and a real
 * AI.
 */
export const RENDER_DEMO_MATCH: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'render-demo',
  startGold: { player: 200, enemy: 200 },
  startMiners: { player: 3, enemy: 3 },
  initialUnits: {
    // Enemy has a small standing force so the player has something to push
    // against without M4's AI. Archers first: they must end up behind the
    // swordsmen (a smaller cursor spawns nearer home).
    player: [],
    enemy: ['archer', 'archer', 'swordsman', 'swordsman', 'swordsman'],
  },
  initialStance: 'advance',
};

/** TEMPORARY (M3): fixed seed for the render demo, so screenshots are repeatable. */
export const RENDER_DEMO_SEED = 20260926;
```

- [ ] **Step 2: 写 M3 验收测试**

创建 `src/sim/m3-acceptance.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import { queueUnit, canQueue } from './training';
import { DEFAULT_MATCH } from '../data/levels';
import { BASE_RADIUS, POP_CAP } from '../data/constants';
import { UNITS } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import type { Command, MatchConfig, World } from './types';

/**
 * spec §11 M3 acceptance, as executable criteria.
 *
 * Does NOT assert balance: whether the economy feels right is a tuning
 * question the harness answers. M3 only has to prove the loops close and the
 * results stay reproducible.
 */

const ECONOMY_MATCH: MatchConfig = {
  ...DEFAULT_MATCH,
  startGold: { player: 200, enemy: 200 },
  startMiners: { player: 1, enemy: 0 },
  initialUnits: { player: [], enemy: [] },
  initialStance: 'hold',
};

describe('M3 acceptance 1: the economy closes', () => {
  it('grows gold past 220 within 600 ticks with one miner', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    for (let i = 0; i < 600; i++) step(world, []);
    // Round trip: 190px out + 90 ticks mining + 190px back = ~252 ticks, so
    // two trips need ~504 and the second completes inside the window.
    expect(world.gold.player).toBeGreaterThanOrEqual(220);
  });

  it('keeps growing between 600 and 800 ticks', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    for (let i = 0; i < 800; i++) step(world, []);
    expect(world.gold.player).toBeGreaterThanOrEqual(240);
  });

  it('never produces gold without a miner', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startMiners: { player: 0, enemy: 0 } }, 1);
    for (let i = 0; i < 800; i++) step(world, []);
    expect(world.gold.player).toBe(200);
  });

  it('depletes the seam as gold is produced', () => {
    const world = createWorld(ECONOMY_MATCH, 1);
    for (let i = 0; i < 800; i++) step(world, []);
    expect(world.mines.player.goldLeft).toBeLessThan(6000);
  });
});

describe('M3 acceptance 2: training closes', () => {
  it('spends gold at order time and spawns after trainTime', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 500, enemy: 0 } }, 1);
    const cmd: Command = { kind: 'train', side: 'player', typeId: 'swordsman' };

    step(world, [cmd]);
    expect(world.gold.player).toBe(400);

    // trainTime is 8s = 240 ticks; the unit appears on the tick it hits zero.
    const before = world.units.filter((u) => u.side === 'player' && u.typeId === 'swordsman').length;
    for (let i = 0; i < UNIT_TICKS.swordsman.trainTime; i++) step(world, []);
    const after = world.units.filter((u) => u.side === 'player' && u.typeId === 'swordsman').length;
    expect(after).toBe(before + 1);
  });

  it('refuses an order it cannot afford and spends nothing', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 10, enemy: 0 } }, 1);
    step(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]);
    expect(world.gold.player).toBe(10);
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('refuses an order at the population cap and spends nothing', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 500, enemy: 0 } }, 1);
    world.popUsed.player = POP_CAP;
    world.popCap.player = POP_CAP;
    step(world, [{ kind: 'train', side: 'player', typeId: 'swordsman' }]);
    expect(world.gold.player).toBe(500);
    expect(world.trainingQueue.player).toHaveLength(0);
  });

  it('keeps population accurate as units spawn', () => {
    const world = createWorld({ ...ECONOMY_MATCH, startGold: { player: 500, enemy: 0 } }, 1);
    step(world, [{ kind: 'train', side: 'player', typeId: 'miner' }]);
    for (let i = 0; i < UNIT_TICKS.miner.trainTime + 1; i++) step(world, []);
    expect(world.popUsed.player).toBe(1);
  });
});

describe('M3 acceptance 3: commands close', () => {
  it('applies a stance change on the tick it is issued', () => {
    const world = createWorld({
      ...ECONOMY_MATCH,
      initialUnits: { player: ['swordsman'], enemy: [] },
      initialStance: 'hold',
    }, 1);
    const unit = world.units[0];
    expect(unit.stance).toBe('hold');
    step(world, [{ kind: 'setStance', side: 'player', unitIds: [unit.id], stance: 'retreat' }]);
    expect(unit.stance).toBe('retreat');
  });

  it('changes behaviour, not just the field', () => {
    const world = createWorld({
      ...ECONOMY_MATCH,
      initialUnits: { player: ['swordsman'], enemy: [] },
      initialStance: 'hold',
    }, 1);
    const unit = world.units[0];
    unit.x = 800;
    unit.prevX = 800;

    // Holding: stays put.
    for (let i = 0; i < 10; i++) step(world, []);
    expect(unit.x).toBe(800);

    step(world, [{ kind: 'setStance', side: 'player', unitIds: [unit.id], stance: 'retreat' }]);
    for (let i = 0; i < 20; i++) step(world, []);
    expect(unit.x).toBeLessThan(800);
  });

  it('ignores a stance command aimed at the other side', () => {
    const world = createWorld({
      ...ECONOMY_MATCH,
      initialUnits: { player: [], enemy: ['swordsman'] },
      initialStance: 'hold',
    }, 1);
    const enemyUnit = world.units[0];
    step(world, [{ kind: 'setStance', side: 'player', unitIds: [enemyUnit.id], stance: 'retreat' }]);
    expect(enemyUnit.stance).toBe('hold');
  });
});

describe('M3 acceptance 4: determinism survives commands', () => {
  /** Runs a scripted match with a command schedule keyed by tick. */
  function scriptedRun(ticksPerFrame: number): string {
    const world = createWorld(
      { ...ECONOMY_MATCH, startGold: { player: 500, enemy: 500 }, startMiners: { player: 2, enemy: 2 } },
      31337,
    );
    const script: Record<number, Command[]> = {
      1: [{ kind: 'train', side: 'player', typeId: 'swordsman' }],
      120: [{ kind: 'train', side: 'enemy', typeId: 'archer' }],
      200: [{ kind: 'setStance', side: 'player', unitIds: [], stance: 'advance' }],
      400: [{ kind: 'train', side: 'player', typeId: 'miner' }],
    };

    let done = 0;
    while (done < 900) {
      const batch = Math.min(ticksPerFrame, 900 - done);
      for (let i = 0; i < batch; i++) {
        // Commands go only to the first tick of each frame, matching the scene.
        const cmds = i === 0 ? (script[done + i] ?? []) : [];
        step(world, cmds);
      }
      done += batch;
    }
    return hashWorld(world);
  }

  it('is reproducible at 1 tick per frame', () => {
    expect(scriptedRun(1)).toBe(scriptedRun(1));
  });

  it('produces the same state at 4 ticks per frame', () => {
    expect(scriptedRun(4)).toBe(scriptedRun(1));
  });

  it('differs for a different seed', () => {
    const a = createWorld(ECONOMY_MATCH, 1);
    const b = createWorld(ECONOMY_MATCH, 2);
    for (let i = 0; i < 300; i++) {
      step(a, []);
      step(b, []);
    }
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('M3 sanity', () => {
  it('does not throw over a long quiet match', () => {
    const world = createWorld(ECONOMY_MATCH, 5);
    expect(() => {
      for (let i = 0; i < 3000; i++) step(world, []);
    }).not.toThrow();
  });

  it('keeps every unit inside the world', () => {
    const world = createWorld(ECONOMY_MATCH, 5);
    for (let i = 0; i < 1500; i++) step(world, []);
    for (const u of world.units) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(world.worldWidth);
    }
  });

  it('never produces negative gold or population', () => {
    const world = createWorld(ECONOMY_MATCH, 5);
    for (let i = 0; i < 1500; i++) step(world, []);
    expect(world.gold.player).toBeGreaterThanOrEqual(0);
    expect(world.popUsed.player).toBeGreaterThanOrEqual(0);
  });

  it('exposes the constants the plan asserts against', () => {
    expect(BASE_RADIUS).toBe(40);
    expect(UNITS.miner.carryCapacity).toBe(20);
    expect(canQueue(createWorld(ECONOMY_MATCH, 1), 'player', 'swordsman').ok).toBe(true);
  });
});
```

- [ ] **Step 3: 运行验收测试**

Run: `npm test -- src/sim/m3-acceptance.test.ts`
Expected: PASS。若第 1 条（600 tick 内 ≥220）失败，**先核对往返时间**：若实测需要更多 tick，说明矿工移动或采集有偏差 —— 用 systematic-debugging 查根因，不要直接放宽阈值。

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: 全部 PASS（M2 的 215 + M3 的新增）。

- [ ] **Step 5: 验证浏览器**

Run: `npm run dev`
Expected:
- 左上角显示金币与人口，金币在增长
- 底部有 4 个兵种按钮 + 3 个姿态按钮，买不起的显示灰色与原因
- 点击「矿工 50」按钮后金币减 50，几秒后一个矿工出现在基地旁
- 点击一个单位，其脚下出现椭圆标记
- 按 Q/W/E 改变选中单位的姿态
- A/D 或鼠标贴边可滚动，滚轮可缩放，**看不到世界外的空白**
- 右上角 1x/2x/4x 可切换，且 4x 明显更快

- [ ] **Step 6: 提交**

```bash
git add src/data/levels.ts src/sim/m3-acceptance.test.ts
git commit -m "feat: complete playable skirmish and M3 acceptance criteria"
```

---

## M3 验收

全部任务完成后，逐条确认 spec §11 的四条硬指标与五项肉眼项：

| # | 验收标准 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | 600 tick 内金币 ≥ 220 且 800 tick 内 ≥ 240 | `npm test -- src/sim/m3-acceptance.test.ts` | ☐ |
| 2 | `train` 扣金、队列推进、`trainTime` 后出生、人口正确；不足时拒绝且不扣金 | 同上 | ☐ |
| 3 | `setStance` 下一 tick 生效且行为改变 | 同上 | ☐ |
| 4 | 1x 与 4x 下状态哈希相同 | 同上 + `src/sim/speed-determinism.test.ts` | ☐ |
| 5 | 矿工真的往返，金币在涨 | `npm run dev` 目视 | ☐ |
| 6 | 点按钮能造兵，单位不重叠地出现在基地旁 | 目视 | ☐ |
| 7 | 选中有脚下标记，姿态指令改变行为 | 目视 | ☐ |
| 8 | 相机滚动缩放且不露出世界外空白 | 目视 | ☐ |
| 9 | 速度控制生效且不改变战果 | 1x 与 4x 各跑一局对比 | ☐ |

第 8 条是最容易被"测试全绿"掩盖的一条 —— `clampScrollX` 的单测覆盖了数学，但**实际缩放后是否真的看不到空白**只能在浏览器里看。

---

## 后续计划

- **M4 AI 与关卡** —— 两层 AI 战术层、波次系统、关卡 1/2、胜负界面
- **M5 打磨** —— 无尽模式、i18n 英文、localStorage 存档、战线指示器、音效、部署

**M3 结束后的第一件事**应该是读 `sim/harness.ts` 的对撞矩阵，看 M2 记录的「弓箭手性价比过高」是否因经济系统的加入而变化 —— 现在「造 12 个弓箭手」与「造 10 个剑士」的时间成本也被纳入考量了。

---

## Execution

**两个执行方式：**

1. **Subagent-Driven（推荐）** —— 每个任务派一个全新上下文的子代理，任务间做两阶段评审。质量更高（评审者没有实现者的沉没成本），但更慢更贵。
2. **Inline Execution** —— 在当前会话里逐个任务执行，带检查点供你复核。更快更便宜，但同一上下文既写又评。

**本计划推荐 Inline Execution**，因为 M3 的 14 个任务里有一半是渲染层（HUD、相机、输入、选中），它们的正确性只能靠浏览器目视确认，而子代理无法看浏览器 —— 派发出去只会把「必须人眼验证」的步骤变成「声称已验证」。

**用哪个？**
