# M4b 关卡、胜利条件与结算界面 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让基地真正决定胜负（关卡 2 必须拆基地才能赢）、让远程单位能打基地、让玩家看见结果并能进入下一关。**这是本计划与前三个里程碑最大的不同：它改变胜负语义，所以「关卡 1 行为不变」是一条硬约束。**

**Architecture:** 胜利条件由 `MatchConfig.winCondition` 显式选择（不从 `enemyAi` 推导）；敌方档案从硬编码改为注册表；结果浮层走项目既有的「Phaser-free 纯模块 + 薄渲染器」模式。

**Tech Stack:** TypeScript ^5.7.2 / Vitest ^3 / Phaser 4.2.1 / npm

**Spec:** `docs/superpowers/specs/2026-09-25-stick-war-web-design.md`（§6.6 死亡与胜负、§8.4 关卡/波次/胜利条件、§13.7 M4b 决策记录、§15 未启用字段登记）

## Global Constraints

逐字取自 spec / AGENTS.md，**每个任务都隐含包含本节**。

- 逻辑帧率固定 **30 Hz**；所有计时器为**整数 tick**
- 数据表用**秒**书写，经 `toTicks()` 转换**一次**（`data/unitTicks.ts` 是唯一转换点）
- `src/sim/**` **禁止** import `phaser`、`render/`、`input/`、`i18n/`
- sim 内**禁止** `Math.random()`、`Date.now()`、`performance.now()`
- **tick 六步顺序不可换**：经济 → 指令 → AI → 运动 → 战斗 → 清理
- 排序比较器**必须是全序**（同值以 `unit.id` 决胜）
- 代码标识符与注释用**英文**；UI 文案用中文走 i18n 键
- **渲染层的可判定逻辑必须抽成 Phaser-free 模块并配测试**（项目铁律）
- **新增 `World` 字段必须同步进 `hashWorld`**
- **M4a 的 567 个测试是安全网**：任何变红说明改动越界

## 本计划的两条特殊约束

**① 关卡 1 的行为一个字节都不能变。**

M4b 改的是胜负语义与远程伤害路径，两者都在关卡 1 的路径上。关卡 1 的 `winCondition` 是 `'annihilation'`（默认值），**其逐 tick 行为必须与 M4a 完全一致**。

**注意一个陷阱**：`winCondition` 必须进 `hashWorld`（否则是新的确定性漏检点），而**加一个哈希字段会改变每一个哈希字符串**。所以「哈希不变」**不能**用来证明行为不变 —— 必须用一个**与哈希字段列表无关**的指纹。

**已捕获的黄金指纹（M4a 状态下实测，5 个种子完全一致，因为关卡 1 的路径不消耗随机数）：**

```
units-only 指纹，在 tick 300 / 1500 / 3300 / 5400 / 6000：
  t300 = e1f9e800
  t1500 = 3a014bc5
  t3300 = 2c8f6ead
  t5400 = 988487fd
  t6000 = 3e759661
判定 tick = 6593，outcome = playerWin，终局指纹 = 84670d95
```

指纹的定义（只取单位状态，不取任何 match 级字段）：

```ts
const unitsFingerprint = (w: World): string => {
  let h = 0x811c9dc5;
  const s = w.units
    .map((u) => `${u.id}:${u.side}:${u.typeId}:${u.x.toFixed(4)}:${u.hp}:${u.state}:${u.stance}:${u.target === null ? '-' : u.target.kind + (u.target.kind === 'unit' ? u.target.id : u.target.side)}:${u.windupTicksLeft}:${u.cooldownTicksLeft}:${u.gatherTicksLeft}:${u.carrying}`)
    .join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
```

Task 1 会把它固化成 `src/sim/level-1-regression.test.ts`。**若这条测试变红，说明 M4b 改了关卡 1 的行为 —— 那不是「数值变了」，是缺陷。**

**② 不新增未哈希字段。** 本计划新增 `winCondition`（World 级）与 `enemyProfile`（World 级），**两者都必须在同一任务内进 `hashWorld`**。项目已在这件事上漏过两次（M4a 的 `waves`/`aiProfile`、M4b 的 `endless`）。

## Review Focus

spec 隐含、但最容易在实现中被打穿的五类失效模式。

| # | 输入 / 条件 | 合理预期 | 承接任务 |
|---|---|---|---|
| 1 | 关卡 1 在 M4b 之后重跑 | **单位状态逐 tick 与 M4a 完全一致**（黄金指纹） | Task 1 |
| 2 | `'base'` 条件 + 敌方单位归零但基地未倒 | **不判胜**，玩家可以继续推基地 | Task 2 |
| 3 | `'base'` 条件 + 玩家单位归零 | **立刻判负**（不给翻盘幻觉） | Task 2 |
| 4 | 弓箭手攻击基地 | **基地 HP 真的下降**（此前静默为零伤害） | Task 4 |
| 5 | 修完远程打基地后 | **§6.5 相克矩阵仍全体一致**（远程伤害路径变了） | Task 4 |

---

## File Structure

```
src/
├── data/
│   ├── types.ts            # 修改：MatchConfig 加 winCondition、enemyProfile
│   └── levels.ts           # 修改：LEVEL_2、LEVELS 注册表、删 RENDER_DEMO_*
├── sim/
│   ├── ai-profile.ts       # 修改：档案注册表 + 关卡 2 专用档案
│   ├── types.ts            # 修改：World 加 winCondition、aiProfile 改 id
│   ├── createWorld.ts      # 修改：拷贝新字段
│   ├── hash.ts             # 修改：纳入 winCondition、enemyProfile
│   ├── harness.ts          # 修改：runMatch 支持 base 条件与自定义敌方档案
│   ├── systems/
│   │   ├── cleanup.ts      # 修改：按 winCondition 分派
│   │   ├── commands.ts     # 修改：从注册表取敌方档案
│   │   └── combat.ts       # 修改：弹丸携带目标引用
│   ├── level-1-regression.test.ts  # 新建：黄金指纹
│   ├── level-2.test.ts             # 新建
│   └── win-condition.test.ts       # 新建
├── i18n/zh-CN.ts           # 修改：结果浮层与关卡名文案
└── render/
    ├── result/
    │   ├── layout.ts       # 新建：纯函数
    │   ├── layout.test.ts  # 新建
    │   └── index.ts        # 新建：薄渲染器
    └── scenes/BattleScene.ts  # 修改：init(data)、结果浮层、停推进、R 键
```

---

### Task 1: 关卡 1 的黄金回归（先立安全网，再动任何代码）

这是**第一个任务**，因为 M4b 会改胜负语义与远程伤害路径，两者都在关卡 1 的路径上。安全网必须在改动之前立起来。

**Files:**
- Create: `src/sim/level-1-regression.test.ts`

**Interfaces:**
- Consumes: `createWorld`、`step`、`decideCommands`、`PLAYER_REFERENCE`、`LEVEL_1`
- Produces: 无导出，仅测试

- [ ] **Step 1: 写测试，用已捕获的黄金值**

创建 `src/sim/level-1-regression.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { decideCommands } from './tactic';
import { PLAYER_REFERENCE } from './ai-profile';
import { step } from './tick';
import { LEVEL_1 } from '../data/levels';
import type { World } from './types';

/**
 * Level 1's behaviour is FROZEN.
 *
 * M4b changes the win-condition semantics and the ranged damage path, and both
 * sit on level 1's code path. This test is the safety net that proves the
 * milestone did not disturb it.
 *
 * It fingerprints UNIT STATE ONLY, not the world hash. That distinction is
 * load-bearing: M4b adds `winCondition` to hashWorld, and adding a hashed field
 * changes EVERY hash string, so "the hash is unchanged" is not available as
 * evidence here. Unit state is what "behaviour" means.
 *
 * The values below were captured on M4a (567 tests green) and are identical
 * across all five seeds, because level 1's scripted path consumes no RNG.
 */
function unitsFingerprint(w: World): string {
  let h = 0x811c9dc5;
  const s = w.units
    .map(
      (u) =>
        `${u.id}:${u.side}:${u.typeId}:${u.x.toFixed(4)}:${u.hp}:${u.state}:${u.stance}:${
          u.target === null
            ? '-'
            : u.target.kind + (u.target.kind === 'unit' ? u.target.id : u.target.side)
        }:${u.windupTicksLeft}:${u.cooldownTicksLeft}:${u.gatherTicksLeft}:${u.carrying}`,
    )
    .join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const SEEDS = [1, 7, 99, 4242, 20260926];
const CHECKPOINTS: Record<number, string> = {
  300: 'e1f9e800',
  1500: '3a014bc5',
  3300: '2c8f6ead',
  5400: '988487fd',
  6000: '3e759661',
};

function play(seed: number): { world: World; decidedAt: number } {
  const world = createWorld(LEVEL_1, seed);
  for (let t = 1; t <= 12000; t++) {
    step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
    if (world.outcome !== 'ongoing') return { world, decidedAt: t };
  }
  return { world, decidedAt: -1 };
}

describe('level 1 is frozen (M4a golden)', () => {
  for (const seed of SEEDS) {
    it(`matches the golden unit fingerprint at every checkpoint (seed ${seed})`, () => {
      const world = createWorld(LEVEL_1, seed);
      const seen: Record<number, string> = {};
      for (let t = 1; t <= 6000; t++) {
        step(world, decideCommands(world, 'player', PLAYER_REFERENCE));
        if (CHECKPOINTS[t] !== undefined) seen[t] = unitsFingerprint(world);
      }
      for (const [tick, expected] of Object.entries(CHECKPOINTS)) {
        expect(seen[Number(tick)], `tick ${tick} (seed ${seed})`).toBe(expected);
      }
    });
  }

  for (const seed of SEEDS) {
    it(`reaches the same verdict at the same tick (seed ${seed})`, () => {
      const { world, decidedAt } = play(seed);
      expect(world.outcome).toBe('playerWin');
      expect(decidedAt).toBe(6593);
      expect(unitsFingerprint(world)).toBe('84670d95');
    });
  }

  it('is still a level you can LOSE', () => {
    // The golden values above all describe the WINNING path. A regression test
    // that only covers the win would not notice if M4b made the level
    // unwinnable-or-unlosable.
    const world = createWorld(LEVEL_1, 1);
    for (let t = 0; t < 12000 && world.outcome === 'ongoing'; t++) step(world, []);
    expect(world.outcome).toBe('playerLose');
  });
});
```

- [ ] **Step 2: 运行，确认全绿**

Run: `npm test -- src/sim/level-1-regression.test.ts`
Expected: PASS。**这一步必须绿** —— 它测的是**改动前**的状态。如果它红了，说明黄金值捕获有误，先修正再继续。

- [ ] **Step 3: 变异验证（证明这条测试能失败）**

临时把 `CHECKPOINTS[300]` 的期望值改成 `'deadbeef'`，重跑，确认**恰好 5 条**失败（每个种子一条）。然后改回。

再临时把 `decidedAt` 的期望 `6593` 改成 `6594`，确认 5 条失败，改回。

> 理由：项目已被**同型问题咬过三次**（测试无法失败）。一条永远为真的回归测试比没有测试更糟，因为它给出虚假的安全感。

- [ ] **Step 4: 提交**

```bash
git add src/sim/level-1-regression.test.ts
git commit -m "test(sim): freeze level 1's behaviour before changing win semantics"
```

---

### Task 2: `winCondition` —— 让基地决定胜负

**Files:**
- Modify: `src/data/types.ts`、`src/sim/types.ts`、`src/sim/createWorld.ts`、`src/sim/hash.ts`、`src/sim/systems/cleanup.ts`
- Test: `src/sim/win-condition.test.ts`（新建）、`src/sim/hash.test.ts`（追加）

**Interfaces:**
- Produces: `MatchConfig.winCondition?: 'annihilation' | 'base'`（缺省 `'annihilation'`）
- Produces: `World.winCondition: 'annihilation' | 'base'`
- Produces: `World.outcome` 语义变更（`'base'` 下敌方单位归零不判胜）

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/win-condition.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import type { MatchConfig, Side } from './types';

/** A base-condition economy match: the enemy has an economy and can rebuild. */
function baseMatch(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'win-probe',
    winCondition: 'base',
    startGold: { player: 200, enemy: 200 },
    startMiners: { player: 1, enemy: 1 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
    ...over,
  };
}

const kill = (world: ReturnType<typeof createWorld>, side: Side) => {
  for (const u of world.units) {
    if (u.side === side) {
      u.state = 'dead';
      u.hp = 0;
    }
  }
};

describe("winCondition: 'base'", () => {
  it('does NOT declare a win when the enemy is out of units but its base stands', () => {
    const world = createWorld(baseMatch(), 1);
    step(world, []);
    kill(world, 'enemy');
    step(world, []);
    expect(world.outcome, 'an empty enemy field is not victory under base rules').toBe('ongoing');
  });

  it('declares a win when the enemy base falls', () => {
    const world = createWorld(baseMatch(), 1);
    world.bases.enemy.hp = 0;
    step(world, []);
    expect(world.outcome).toBe('playerWin');
  });

  it('declares a LOSS immediately when the player is out of units', () => {
    // No comeback mechanic exists, so a wiped player is defeated even though
    // its base still stands. Pretending otherwise would show a "you can still
    // win" state that has no way to resolve.
    const world = createWorld(baseMatch(), 1);
    step(world, []);
    kill(world, 'player');
    step(world, []);
    expect(world.outcome).toBe('playerLose');
  });

  it('declares a LOSS when the player base falls', () => {
    const world = createWorld(baseMatch(), 1);
    world.bases.player.hp = 0;
    step(world, []);
    expect(world.outcome).toBe('playerLose');
  });

  it('reaches a verdict in a real match (no stalemate)', () => {
    // Spec §8.4.1: finite mine reserves mean a breakthrough always arrives.
    const world = createWorld(baseMatch(), 1);
    let t = 0;
    while (t < 90000 && world.outcome === 'ongoing') {
      step(world, []);
      t++;
    }
    expect(world.outcome, `still ongoing after ${t} ticks`).not.toBe('ongoing');
    expect(world.outcome).toBe('playerLose'); // neither side has an army here
  });
});

describe("winCondition: 'annihilation' (the default)", () => {
  it('declares a win as soon as the enemy is out of units', () => {
    const world = createWorld(baseMatch({ winCondition: 'annihilation' }), 1);
    step(world, []);
    kill(world, 'enemy');
    step(world, []);
    expect(world.outcome).toBe('playerWin');
  });

  it('is what an unspecified config gets', () => {
    const world = createWorld({ ...DEFAULT_MATCH, levelId: 'default-probe' }, 1);
    expect(world.winCondition).toBe('annihilation');
  });

  it('still suppresses annihilation while waves are pending', () => {
    // M4a's rule must survive the new dispatch, or level 1 breaks again.
    const world = createWorld(
      baseMatch({
        winCondition: 'annihilation',
        waves: [{ atTick: 300, units: ['swordsman'] }],
      }),
      1,
    );
    step(world, []);
    expect(world.outcome).toBe('ongoing');
  });

  it('never lets ENDLESS be won by clearing the field', () => {
    const world = createWorld(baseMatch({ winCondition: 'annihilation', endless: true }), 1);
    for (let i = 0; i < 30; i++) step(world, []);
    expect(world.outcome).not.toBe('playerWin');
  });
});
```

在 `src/sim/hash.test.ts` 末尾追加：

```ts
describe('hashWorld — M4b match flags', () => {
  const base: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'hash-m4b',
    startMiners: { player: 1, enemy: 0 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
  };

  it('changes when winCondition changes', () => {
    const a = createWorld({ ...base, winCondition: 'annihilation' }, 1);
    const b = createWorld({ ...base, winCondition: 'base' }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/sim/win-condition.test.ts src/sim/hash.test.ts`
Expected: FAIL —— `winCondition` 未定义（第一条断言 `'ongoing'` 会收到 `'playerWin'`）。

- [ ] **Step 3: 加类型与拷贝**

`src/data/types.ts` 的 `MatchConfig` 加：

```ts
  /**
   * How the match is won. `annihilation` (default) is the historical rule:
   * either side's base falling OR either side's unit count reaching zero ends
   * the match. `base` requires the enemy BASE to fall — an empty enemy field is
   * not a terminal state, which matters in an economy level where the enemy
   * rebuilds.
   *
   * Deliberately NOT derived from `enemyAi`: "does the enemy have an economy"
   * and "what counts as winning" are different questions that merely happen to
   * coincide in this game's two levels.
   */
  winCondition?: 'annihilation' | 'base';
```

`src/sim/types.ts` 的 `World` 加：

```ts
  /** How this match is won. Copied off MatchConfig; see its doc comment. */
  winCondition: 'annihilation' | 'base';
```

`src/sim/createWorld.ts` 的返回对象加：

```ts
    winCondition: config.winCondition ?? 'annihilation',
```

- [ ] **Step 4: 按条件分派 `resolveOutcome`**

`src/sim/systems/cleanup.ts`，把 `resolveOutcome` 改为：

```ts
function resolveOutcome(world: World): void {
  if (world.outcome !== 'ongoing') return;

  const playerBaseDown = world.bases.player.hp <= 0;
  const enemyBaseDown = world.bases.enemy.hp <= 0;

  const playerUnits = world.units.filter((u) => u.side === 'player').length;
  const enemyUnits = world.units.filter((u) => u.side === 'enemy').length;

  // The PLAYER's condition does not depend on winCondition: there is no comeback
  // mechanic, so a wiped player is defeated whatever the mode. Letting the base
  // rule defer it would show a "you can still win" state with no way to resolve.
  const playerWiped = playerUnits === 0;

  if (playerBaseDown || playerWiped) {
    world.outcome = 'playerLose';
    return;
  }

  if (enemyBaseDown) {
    world.outcome = 'playerWin';
    return;
  }

  // Under base rules an empty enemy field is NOT a terminal state — the enemy
  // rebuilds, so the player must actually demolish the base. This is what makes
  // the base the objective instead of scenery (spec §8.4.1).
  if (world.winCondition === 'base') return;

  const enemyWiped = enemyUnits === 0 && !enemyHasUnitsPending(world);
  if (enemyWiped) {
    world.outcome = 'playerWin';
  }
}
```

`enemyHasUnitsPending` **保持不变**（M4a 已写，含 `endless` 分支）。

- [ ] **Step 5: 哈希纳入 `winCondition`**

`src/sim/hash.ts`，在 `endless` 那行旁边加：

```ts
  parts.push(`win=${world.winCondition}`);
```

- [ ] **Step 6: 运行，确认通过**

Run: `npm test -- src/sim/win-condition.test.ts src/sim/hash.test.ts src/sim/level-1-regression.test.ts`
Expected: PASS。

- [ ] **Step 7: 全量 + 类型检查**

Run: `npx tsc --noEmit && npm test`
Expected: 全部 PASS，**特别是 `level-1-regression.test.ts`** —— 它是这一步唯一能证明「没改坏关卡 1」的东西。若它变红，**回退而不是放宽它**。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(sim): let the win condition require the enemy base to fall"
```

---

### Task 3: 敌方档案注册表

**Files:**
- Modify: `src/data/types.ts`、`src/sim/ai-profile.ts`、`src/sim/types.ts`、`src/sim/createWorld.ts`、`src/sim/hash.ts`、`src/sim/systems/commands.ts`
- Test: `src/sim/systems/commands.test.ts`（追加）、`src/sim/hash.test.ts`（追加）

**Interfaces:**
- Produces: `type AiProfileId = 'none' | 'standard' | 'level-2'`
- Produces: `AI_PROFILES: Record<AiProfileId, AiProfile | null>`、`profileFor(id): AiProfile | null`
- Produces: `MatchConfig.enemyProfile?: AiProfileId`、`World.aiProfile: AiProfileId`

> **注**：`World.aiProfile` 从 `'none' | 'standard'` 扩为 `AiProfileId`。这是**同一个字段的类型扩展**，不是新字段 —— 但它仍必须进哈希（已是 id 字符串，改动只是可能的值变多）。

- [ ] **Step 1: 写会失败的测试**

在 `src/sim/systems/commands.test.ts` 末尾追加：

```ts
describe('commandsSystem — enemy profile registry', () => {
  it('uses the profile named by the config, not a hardcoded one', () => {
    // Before M4b the enemy profile was hardcoded, so a level could not have its
    // own settings and a true mirror match was untestable.
    const world = makeWorld([]);
    world.aiProfile = 'level-2';
    world.tick = 0;
    world.gold.enemy = 500;
    commandsSystem(ctx(world, []));
    // Both profiles buy a miner first when below target, so this only proves it
    // RAN. The value check is in the profile test below.
    expect(world.trainingQueue.enemy.length).toBeGreaterThan(0);
  });

  it('does not run the tactical layer for the none profile', () => {
    const world = makeWorld([]);
    world.aiProfile = 'none';
    world.tick = 0;
    world.gold.enemy = 500;
    commandsSystem(ctx(world, []));
    expect(world.trainingQueue.enemy).toHaveLength(0);
  });
});
```

在 `src/sim/hash.test.ts` 末尾追加：

```ts
describe('hashWorld — enemy profile id', () => {
  const cfg: MatchConfig = {
    ...DEFAULT_MATCH,
    levelId: 'hash-profile',
    startMiners: { player: 0, enemy: 1 },
    initialUnits: { player: [], enemy: [] },
    waves: [],
  };

  it('distinguishes the profiles a level can select', () => {
    const a = createWorld({ ...cfg, enemyProfile: 'standard' }, 1);
    const b = createWorld({ ...cfg, enemyProfile: 'level-2' }, 1);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/sim/systems/commands.test.ts src/sim/hash.test.ts`
Expected: FAIL（`'level-2'` 不在类型里 / 未定义）。

- [ ] **Step 3: 建注册表**

`src/sim/ai-profile.ts` 追加：

```ts
/** Ids a MatchConfig may name. `none` means "no tactical layer at all". */
export type AiProfileId = 'none' | 'standard' | 'level-2';

/**
 * The registry a level selects from.
 *
 * A registry rather than an inline object on MatchConfig: the profile id is a
 * short string that hashes cheaply, and `World` already carried an
 * `aiProfile` field from M4a — extending its values is a smaller change than
 * introducing a second way to express the same thing.
 *
 * `none` is `null`, not a profile: it means the tactical layer is SKIPPED, which
 * is what a scripted level (no enemy economy) and the balance harness both need.
 */
export const AI_PROFILES: Record<AiProfileId, AiProfile | null> = {
  none: null,
  standard: ENEMY_STANDARD,
  'level-2': LEVEL_2_ENEMY,
};

export function profileFor(id: AiProfileId): AiProfile | null {
  return AI_PROFILES[id];
}
```

并在同文件加 `LEVEL_2_ENEMY`（**取值在 Task 7 扫描后定，此处先用占位并在注释里写明待扫描**）：

```ts
/**
 * Level 2's enemy. A placeholder until Task 7's sweep fixes the values.
 *
 * Task 7 scans minerTarget x decisionIntervalTicks against level 2 and records
 * the measured result here, the way `PLAYER_REFERENCE.minerTarget` records its
 * own sweep. Do not hand-tune this without re-running that sweep.
 */
export const LEVEL_2_ENEMY: AiProfile = {
  decisionIntervalTicks: 45,
  minerTarget: 3,
  buildOrder: ['swordsman', 'archer', 'swordsman', 'spearman'],
  advanceRatio: 1.0,
  retreatRatio: 0.4,
};
```

- [ ] **Step 4: 类型、拷贝、哈希、消费**

`src/data/types.ts` 的 `MatchConfig` 加：

```ts
  /**
   * Which tactical profile the enemy runs. Defaults from `enemyAi` when absent
   * (`economy` -> `standard`, `scripted` -> `none`), so existing configs keep
   * working; a level names it explicitly when it wants its own.
   */
  enemyProfile?: AiProfileId;
```

> `AiProfileId` 从 `sim/` 导入会**破坏依赖方向**（data 不得依赖 sim）。因此把它定义在 `data/types.ts` 里、由 `ai-profile.ts` 反过来 import。见 Step 5。

`src/sim/createWorld.ts` 的 `aiProfile` 行改为：

```ts
    aiProfile: config.enemyProfile ?? (config.enemyAi === 'economy' ? 'standard' : 'none'),
```

`src/sim/types.ts` 的 `aiProfile` 字段类型改为 `AiProfileId`（从 `data/types` 导入）。

`src/sim/hash.ts` 把原来的 `ai=${world.aiProfile}` **保留**（它现在承载 id，值域变宽但机制不变）。

`src/sim/systems/commands.ts` 改为：

```ts
  const enemyProfile = profileFor(world.aiProfile);
  if (enemyProfile !== null) {
    for (const command of decideCommands(world, 'enemy', enemyProfile)) {
      consume(world, command);
    }
  }
```

- [ ] **Step 5: 处理依赖方向**

把 `AiProfileId` 定义在 `src/data/types.ts`（data 层），`src/sim/ai-profile.ts` 从那里 import 并 re-export。**`data/types.ts` 不得 import `sim/`** —— 这是项目的一向铁律（ESLint 不检查这条，但它是设计约束）。

- [ ] **Step 6: 运行，确认通过**

Run: `npx tsc --noEmit && npm test`
Expected: PASS，含 `level-1-regression.test.ts`。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(sim): select the enemy profile from a registry instead of hardcoding"
```

---

### Task 4: 弹丸携带目标引用（修弓箭手打不到基地）

这是 M2 遗留的**缺陷**：`spawnProjectile` 只处理 `target.kind === 'unit'`，对基地**静默返回**。近战路径处理基地，所以这是远程路径漏了一种目标类型。

**Files:**
- Modify: `src/sim/types.ts`（`Projectile`）、`src/sim/systems/combat.ts`、`src/sim/hash.ts`
- Test: `src/sim/base-damage.test.ts`（新建）、`src/sim/systems/combat.test.ts`（追加）

**Interfaces:**
- Produces: `Projectile.target: TargetRef`（替代 `targetId: number`）

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/base-damage.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from './createWorld';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import { UNITS, type UnitTypeId } from '../data/units';
import type { MatchConfig } from './types';

/**
 * Ranged units must be able to damage a base.
 *
 * They could not: `spawnProjectile` handled only `target.kind === 'unit'` and
 * returned silently for a base, so ten archers could ring a base forever with
 * zero effect and no error. Melee worked, which is exactly why it went
 * unnoticed — the bug was in one branch of a two-branch dispatch.
 *
 * This matters from M4b on, because level 2 is won by destroying the base.
 */
function siege(units: UnitTypeId[], over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    ...DEFAULT_MATCH,
    levelId: 'siege-probe',
    startMiners: { player: 0, enemy: 0 },
    initialUnits: { player: units, enemy: [] },
    initialStance: 'advance',
    enemyAi: 'scripted',
    waves: [],
    ...over,
  };
}

describe('ranged units vs a base', () => {
  it('archers reduce base HP', () => {
    const world = createWorld(siege(['archer', 'archer', 'archer']), 1);
    const before = world.bases.enemy.hp;
    for (let i = 0; i < 3000; i++) step(world, []);
    expect(world.bases.enemy.hp, 'archers must damage the base').toBeLessThan(before);
  });

  it('archers can eventually destroy it', () => {
    const world = createWorld(siege(Array<UnitTypeId>(10).fill('archer')), 1);
    for (let i = 0; i < 30000 && world.bases.enemy.hp > 0; i++) step(world, []);
    expect(world.bases.enemy.hp, 'ten archers should be able to finish it').toBe(0);
  });

  it('a projectile at a base carries a base target, not a unit id', () => {
    const world = createWorld(siege(['archer']), 1);
    // Run until a shot is in flight.
    let sawBaseProjectile = false;
    for (let i = 0; i < 3000 && !sawBaseProjectile; i++) {
      step(world, []);
      sawBaseProjectile = world.projectiles.some((p) => p.target?.kind === 'base');
    }
    expect(sawBaseProjectile, 'expected an arrow aimed at the base').toBe(true);
  });

  it('melee still damages the base (no regression)', () => {
    const world = createWorld(siege(['swordsman', 'swordsman', 'swordsman']), 1);
    const before = world.bases.enemy.hp;
    for (let i = 0; i < 3000; i++) step(world, []);
    expect(world.bases.enemy.hp).toBeLessThan(before);
  });

  it('a shot whose target base is already destroyed is dropped', () => {
    const world = createWorld(siege(['archer']), 1);
    for (let i = 0; i < 600; i++) step(world, []);
    if (world.projectiles.length > 0) {
      world.bases.enemy.hp = 0;
      expect(() => step(world, [])).not.toThrow();
    }
  });
});

describe('base damage rates (measured, for the spearman review)', () => {
  it('records DPS per unit type against 3000 HP', () => {
    const rows: string[] = [];
    for (const typeId of ['swordsman', 'archer', 'spearman'] as UnitTypeId[]) {
      const world = createWorld(siege(Array<UnitTypeId>(10).fill(typeId)), 1);
      let ticks = -1;
      for (let i = 0; i < 60000; i++) {
        step(world, []);
        if (world.bases.enemy.hp <= 0) {
          ticks = i + 1;
          break;
        }
      }
      rows.push(`${typeId}: ${ticks < 0 ? 'never' : (ticks / 30).toFixed(1) + 's'}`);
    }
    console.log('BASE DEMOLITION (10 units vs 3000 HP)\n  ' + rows.join('\n  '));
    // The assertion is only that RANGED is now non-zero — the exact numbers are
    // a tuning report, not a gate (spec §9.3).
    expect(rows[1]).not.toContain('never');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/sim/base-damage.test.ts`
Expected: FAIL —— 弓箭手那条得到 `3000`（未下降）。

- [ ] **Step 3: 改 `Projectile`**

`src/sim/types.ts`：

```ts
export interface Projectile {
  id: number;
  side: Side;
  x: number;
  /** X at the start of this tick. Used ONLY by the renderer for interpolation. */
  prevX: number;
  /**
   * What this shot is aimed at. A full target reference, not a unit id: a base
   * is a legal target and a numeric id cannot express it. That inability was
   * the root of a defect where ranged units dealt zero damage to bases while
   * appearing to attack them.
   */
  target: TargetRef;
  damage: number;
  /** Ticks until the projectile lands and resolves damage. */
  ticksToImpact: number;
}
```

- [ ] **Step 4: 改 `combat.ts`**

`spawnProjectile` 去掉 unit-only 的早退：

```ts
function spawnProjectile(world: World, unit: Unit, distance: number, damage: number): void {
  const target = unit.target;
  if (target === null || target.kind === 'mine') return;

  const speed = UNIT_TICKS[unit.typeId].projectilePerTick;
  // Never zero: a same-position shot must still take a tick, or the projectile
  // would resolve in the same tick it was created and break ordering.
  const ticksToImpact = speed > 0 ? Math.max(1, Math.round(distance / speed)) : 1;

  world.projectiles.push({
    id: world.nextProjectileId++,
    side: unit.side,
    x: unit.x,
    prevX: unit.x,
    target,
    damage,
    ticksToImpact,
  });
}
```

`advanceProjectiles` 用引用而非 id：

```ts
function advanceProjectiles(world: World): void {
  const surviving: typeof world.projectiles = [];

  for (const p of world.projectiles) {
    if (!isTargetAlive(world, p.target)) continue;

    const targetPos = targetX(world, p.target);
    if (targetPos === null) continue;

    p.ticksToImpact -= 1;
    p.prevX = p.x;

    if (p.ticksToImpact > 0) {
      p.x += (targetPos - p.x) / (p.ticksToImpact + 1);
      surviving.push(p);
      continue;
    }

    p.x = targetPos;
    applyDamage(world, p.side, p.target, p.damage);
  }

  world.projectiles = surviving;
}
```

- [ ] **Step 5: 改哈希与其余 `targetId` 引用**

`src/sim/hash.ts` 的弹丸行改为：

```ts
  for (const p of world.projectiles) {
    const t = p.target;
    const tag = t === null ? '-' : t.kind === 'unit' ? `u${t.id}` : `${t.kind[0]}${t.side}`;
    parts.push(`p${p.id}:${p.side}:${quantise(p.x)}:${tag}:${p.damage}:${p.ticksToImpact}`);
  }
```

修 `src/sim/hash.test.ts:79` 与 `src/sim/systems/cleanup.test.ts:177` 的 `targetId: 0` / `targetId: 99` 桩，改为 `target: { kind: 'unit', id: 0 }` / `{ kind: 'unit', id: 99 }`。

- [ ] **Step 6: 运行，确认通过**

Run: `npm test -- src/sim/base-damage.test.ts`
Expected: PASS。

- [ ] **Step 7: 关键回归 —— 重跑相克矩阵**

Run: `npm test -- src/sim/counter-relations.test.ts`
Expected: **12 tests PASS**（10 场景 × 6 种子全体一致）。

> **这一步是本任务最重要的验证。** 远程伤害路径被改了，而 §6.5 的兵种相克全部建立在远程伤害之上。若矩阵变红，说明修复引入了新的失衡 —— 那是**必须解决**的，不是可以放宽的。

- [ ] **Step 8: 全量 + 黄金回归**

Run: `npx tsc --noEmit && npm test`
Expected: PASS，含 `level-1-regression.test.ts`。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "fix(sim): let ranged attacks damage a base

Projectiles carried only a numeric unit id, so a base was inexpressible as a
target and spawnProjectile returned silently for one. Ten archers could ring a
base forever with zero effect and no error. Melee worked, which is why a
two-branch dispatch with one branch missing went unnoticed."
```

---

### Task 5: 关卡 2 的数据

**Files:**
- Modify: `src/data/levels.ts`
- Test: `src/sim/level-2.test.ts`（新建）

**Interfaces:**
- Produces: `LEVEL_2: MatchConfig`
- Produces: `LEVELS: readonly MatchConfig[]`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/level-2.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { LEVEL_1, LEVEL_2, LEVELS } from '../data/levels';
import { createWorld } from './createWorld';
import { step } from './tick';

describe('LEVEL_2 — shape (spec §8.4.3)', () => {
  it('is a symmetric economy level with no waves', () => {
    expect(LEVEL_2.enemyAi).toBe('economy');
    expect(LEVEL_2.waves).toEqual([]);
    expect(LEVEL_2.endless).toBe(false);
  });

  it('gives BOTH sides the same economy', () => {
    expect(LEVEL_2.startMiners).toEqual({ player: 3, enemy: 3 });
    expect(LEVEL_2.startGold).toEqual({ player: 200, enemy: 200 });
    expect(LEVEL_2.mineGold).toEqual(LEVEL_1.mineGold);
    expect(LEVEL_2.popCap).toEqual({ player: 60, enemy: 60 });
  });

  it('requires the enemy base to fall', () => {
    // The whole point of level 2: the enemy rebuilds, so "out of units" is not
    // a terminal state and the base is the objective.
    expect(LEVEL_2.winCondition).toBe('base');
  });

  it('has a 1500 HP enemy base', () => {
    expect(LEVEL_2.baseHp.enemy).toBe(1500);
    expect(LEVEL_2.baseHp.player).toBe(3000);
  });

  it('names its own enemy profile', () => {
    expect(LEVEL_2.enemyProfile).toBe('level-2');
  });

  it('starts neither side with an army', () => {
    expect(LEVEL_2.initialUnits?.player ?? []).toEqual([]);
    expect(LEVEL_2.initialUnits?.enemy ?? []).toEqual([]);
  });
});

describe('LEVELS registry', () => {
  it('lists the levels in play order', () => {
    expect(LEVELS).toEqual([LEVEL_1, LEVEL_2]);
  });

  it('has unique level ids', () => {
    const ids = LEVELS.map((l) => l.levelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every level is playable to a verdict without throwing', () => {
    for (const level of LEVELS) {
      const world = createWorld(level, 1);
      expect(() => {
        for (let i = 0; i < 120 && world.outcome === 'ongoing'; i++) step(world, []);
      }).not.toThrow();
    }
  });
});

describe('LEVEL_2 — the old win condition is gone', () => {
  it('does not end just because the enemy field is empty at t=0', () => {
    const world = createWorld(LEVEL_2, 1);
    for (let i = 0; i < 10; i++) step(world, []);
    expect(world.outcome).toBe('ongoing');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/sim/level-2.test.ts`
Expected: FAIL，`LEVEL_2` 未导出。

- [ ] **Step 3: 写数据**

`src/data/levels.ts` 追加：

```ts
/**
 * Level 2 — the symmetric economy level (spec §8.4.3).
 *
 * Both sides get the same start, and the enemy runs its own tactical profile.
 * `winCondition: 'base'` is the important field: the enemy REBUILDS, so an
 * empty enemy field is not a terminal state, and only the base falling ends the
 * match. That is what makes the base an objective instead of scenery — measured
 * on the old rule, thirty matches ended with both bases untouched at 3000/3000.
 *
 * The enemy base is 1500, matching level 1's: at 3000 the breakthrough is
 * followed by ~43s of unopposed base-chewing, and halving it cuts that to ~22s.
 */
export const LEVEL_2: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'level-2',
  baseHp: { player: BASE_HP, enemy: 1500 },
  startGold: { player: START_GOLD, enemy: START_GOLD },
  startMiners: { player: 3, enemy: 3 },
  initialUnits: { player: [], enemy: [] },
  enemyAi: 'economy',
  enemyProfile: 'level-2',
  winCondition: 'base',
  waves: [],
  endless: false,
};

/**
 * The campaign, in play order. The ARRAY ORDER is the level order — there is no
 * `order` field on MatchConfig, because two sources of truth for the same fact
 * is one too many.
 */
export const LEVELS: readonly MatchConfig[] = [LEVEL_1, LEVEL_2];
```

同时**删除** `RENDER_DEMO_MATCH` 与 `RENDER_DEMO_SEED`（二者标着 TEMPORARY，且 `BattleScene` 将在 Task 8 改为使用 `LEVELS`）。

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/sim/level-2.test.ts`
Expected: PASS。

> **注意**：删掉 `RENDER_DEMO_MATCH` 会让 `BattleScene` 编译失败。这是**预期的** —— Task 8 会修它。为避免中间态无法构建，**本步骤先把 `BattleScene` 的 import 换成 `LEVELS[0]`**（一行改动，不引入其他行为）：

```ts
import { LEVELS } from '../../data/levels';
// ...
this.world = createWorld(LEVELS[0], RENDER_DEMO_SEED_REPLACEMENT);
```

`RENDER_DEMO_SEED` 也删了，所以临时用固定常量 `20260926` 并加注释说明 Task 8 会把它换成场景数据。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(data): add level 2 and the LEVELS registry"
```

---

### Task 6: 结果浮层的纯逻辑

**Files:**
- Create: `src/render/result/layout.ts`、`src/render/result/layout.test.ts`

**Interfaces:**
- Produces: `shouldShowResult(world): boolean`
- Produces: `resultPanelRect(w, h): HudRect`、`resultButtonRects(w, h): { replay, next }`
- Produces: `resultTitle(outcome): string`、`resultSubtitle(levelId, ticks): string`、`formatDuration(ticks): string`
- Produces: `RESULT_PANEL` 常量

- [ ] **Step 1: 写会失败的测试**

创建 `src/render/result/layout.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  resultButtonRects,
  resultPanelRect,
  resultSubtitle,
  resultTitle,
  shouldShowResult,
} from './layout';
import { createWorld } from '../../sim/createWorld';
import { DEFAULT_MATCH } from '../../data/levels';

const world = (outcome: 'ongoing' | 'playerWin' | 'playerLose') => {
  const w = createWorld({ ...DEFAULT_MATCH, levelId: 'level-1' }, 1);
  w.outcome = outcome;
  return w;
};

describe('shouldShowResult', () => {
  it('hides while the match is ongoing', () => {
    expect(shouldShowResult(world('ongoing'))).toBe(false);
  });

  it('shows on a win', () => {
    expect(shouldShowResult(world('playerWin'))).toBe(true);
  });

  it('shows on a loss', () => {
    expect(shouldShowResult(world('playerLose'))).toBe(true);
  });
});

describe('resultTitle', () => {
  it('says victory on a win and defeat on a loss', () => {
    expect(resultTitle('playerWin')).toBe('胜利');
    expect(resultTitle('playerLose')).toBe('失败');
  });
});

describe('formatDuration', () => {
  it('formats ticks as mm:ss', () => {
    // 30 ticks per second.
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(30)).toBe('0:01');
    expect(formatDuration(30 * 65)).toBe('1:05');
    expect(formatDuration(30 * 169)).toBe('2:49');
  });

  it('pads seconds to two digits', () => {
    expect(formatDuration(30 * 61)).toBe('1:01');
  });

  it('never shows a negative time', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('resultSubtitle', () => {
  it('names the level and the duration', () => {
    const s = resultSubtitle('level-1', 30 * 169);
    expect(s).toContain('2:49');
    expect(s.length).toBeGreaterThan(0);
  });

  it('falls back to the raw id for an unknown level', () => {
    expect(resultSubtitle('mystery', 0)).toContain('mystery');
  });
});

describe('resultPanelRect', () => {
  it('is centred horizontally', () => {
    const r = resultPanelRect(1280, 720);
    expect(r.x + r.w / 2).toBeCloseTo(640, 0);
  });

  it('stays inside the viewport', () => {
    for (const [w, h] of [[1280, 720], [800, 600], [1920, 1080]] as const) {
      const r = resultPanelRect(w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
    }
  });

  it('has a usable size', () => {
    const r = resultPanelRect(1280, 720);
    expect(r.w).toBeGreaterThan(200);
    expect(r.h).toBeGreaterThan(100);
  });
});

describe('resultButtonRects', () => {
  it('never overlaps the two buttons', () => {
    for (const [w, h] of [[1280, 720], [800, 600], [640, 480], [1920, 1080]] as const) {
      const { replay, next } = resultButtonRects(w, h);
      const overlap = replay.x < next.x + next.w && next.x < replay.x + replay.w;
      expect(overlap, `buttons overlap at ${w}x${h}`).toBe(false);
    }
  });

  it('puts both buttons inside the panel', () => {
    const panel = resultPanelRect(1280, 720);
    const { replay, next } = resultButtonRects(1280, 720);
    for (const b of [replay, next]) {
      expect(b.x).toBeGreaterThanOrEqual(panel.x);
      expect(b.x + b.w).toBeLessThanOrEqual(panel.x + panel.w);
      expect(b.y + b.h).toBeLessThanOrEqual(panel.y + panel.h);
    }
  });

  it('keeps both buttons inside the viewport at small sizes', () => {
    const { replay, next } = resultButtonRects(640, 480);
    for (const b of [replay, next]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(640);
      expect(b.y + b.h).toBeLessThanOrEqual(480);
    }
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/render/result/layout.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 写实现**

创建 `src/render/result/layout.ts`：

```ts
/**
 * Result-overlay geometry and copy, as pure functions.
 *
 * Phaser-free on purpose: the project's rule is that anything in the render
 * layer which could be judged by an assertion must live in a module a test can
 * import. "Is the panel on screen", "do the buttons overlap", "what does the
 * title say" are all decidable here; `index.ts` only turns the answers into
 * objects.
 */

import { t } from '../../i18n';
import { TICKS_PER_SEC } from '../../data/constants';
import type { Outcome, World } from '../../sim/types';

export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const RESULT_PANEL = { w: 420, h: 220, buttonW: 160, buttonH: 48, gap: 16 } as const;

/** The overlay appears only once the match is decided. */
export function shouldShowResult(world: World): boolean {
  return world.outcome !== 'ongoing';
}

export function resultTitle(outcome: Outcome): string {
  return outcome === 'playerWin' ? t('result.win') : t('result.lose');
}

/**
 * Ticks as `m:ss`.
 *
 * Formatted in code rather than through i18n interpolation: the string table is
 * a flat key->string map with no parameter support, and adding interpolation for
 * a single call site would be mechanism for one use.
 */
export function formatDuration(ticks: number): string {
  const total = Math.max(0, Math.floor(ticks / TICKS_PER_SEC));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function resultSubtitle(levelId: string, ticks: number): string {
  const name = t(`level.${levelId}.name`);
  return `${name} · ${t('result.time')} ${formatDuration(ticks)}`;
}

/** A centred panel that always fits the viewport. */
export function resultPanelRect(width: number, height: number): HudRect {
  const w = Math.min(RESULT_PANEL.w, Math.max(200, width - 32));
  const h = Math.min(RESULT_PANEL.h, Math.max(120, height - 32));
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** The two action buttons, side by side under the text. */
export function resultButtonRects(
  width: number,
  height: number,
): { replay: HudRect; next: HudRect } {
  const panel = resultPanelRect(width, height);
  const gap = RESULT_PANEL.gap;
  // Shrink the buttons rather than let them overflow a narrow panel.
  const w = Math.min(RESULT_PANEL.buttonW, (panel.w - gap - 24) / 2);
  const h = RESULT_PANEL.buttonH;
  const totalW = w * 2 + gap;
  const startX = panel.x + (panel.w - totalW) / 2;
  const y = panel.y + panel.h - h - 20;
  return {
    replay: { x: startX, y, w, h },
    next: { x: startX + w + gap, y, w, h },
  };
}
```

- [ ] **Step 4: 加 i18n 文案**

`src/i18n/zh-CN.ts` 追加：

```ts
  // Result overlay
  'result.win': '胜利',
  'result.lose': '失败',
  'result.time': '用时',
  'result.replay': '重玩',
  'result.next': '下一关',
  'result.restartCampaign': '返回第一关',

  // Level names — keys follow `level.<levelId>.name`.
  'level.level-1.name': '第一关',
  'level.level-2.name': '第二关',
```

- [ ] **Step 5: 运行，确认通过**

Run: `npm test -- src/render/result/layout.test.ts`
Expected: PASS。

- [ ] **Step 6: 变异验证**

把 `resultButtonRects` 的 `gap` 临时改为 `-w`（制造重叠），确认「never overlaps」那条失败；改回。
把 `formatDuration` 的 `% 60` 临时删掉，确认时长测试失败；改回。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(render): result-overlay layout as pure functions"
```

---

### Task 7: 扫描并定下关卡 2 的敌方档案

**Files:**
- Modify: `src/sim/ai-profile.ts`（`LEVEL_2_ENEMY` 的取值）
- Create: 临时探针（用后即删）

**Interfaces:**
- Consumes: `LEVEL_2`、`runMatch`（Task 8 会扩展它；本任务先用临时循环）
- Produces: `LEVEL_2_ENEMY` 的实测取值

- [ ] **Step 1: 写临时探针**

创建 `src/sim/_sweep.test.ts`：

```ts
import { describe, it } from 'vitest';
import { createWorld } from './createWorld';
import { decideCommands } from './tactic';
import { PLAYER_REFERENCE } from './ai-profile';
import { step } from './tick';
import { LEVEL_2 } from '../data/levels';
import type { AiProfileId } from '../data/types';

describe('SWEEP level 2 enemy profile', () => {
  it('scans minerTarget x decisionIntervalTicks', () => {
    const seeds = [1, 7, 99, 4242, 20260926];
    // Patch the registry entry per run by mutating the imported object is not
    // possible (it is frozen by convention), so drive the enemy manually here:
    // the sim's own tactical layer is bypassed by using enemyAi: 'scripted' and
    // running BOTH sides from this loop.
    for (const minerTarget of [3, 4, 5, 6, 7, 8]) {
      for (const interval of [30, 45, 60]) {
        const enemy = { ...PLAYER_REFERENCE, minerTarget, decisionIntervalTicks: interval };
        const outcomes = seeds.map((seed) => {
          const world = createWorld({ ...LEVEL_2, enemyAi: 'scripted' }, seed);
          let t = 0;
          while (t < 90000 && world.outcome === 'ongoing') {
            step(world, [
              ...decideCommands(world, 'player', PLAYER_REFERENCE),
              ...decideCommands(world, 'enemy', enemy),
            ]);
            t++;
          }
          return `${world.outcome === 'playerWin' ? 'W' : 'L'}${(t / 30).toFixed(0)}`;
        });
        console.log(`minerTarget=${minerTarget} interval=${interval} -> ${outcomes.join(' ')}`);
      }
    }
  });
});
```

- [ ] **Step 2: 运行并读结果**

Run: `npx vitest run src/sim/_sweep.test.ts --reporter=basic`

判据（spec §13.7 Q14）：
1. 参考玩家 **5 个种子全部取胜**（关卡 2 必须可通关）
2. 时长落在 **3~6 分钟**

- [ ] **Step 3: 把实测取值写进 `LEVEL_2_ENEMY`**

用扫描结果替换占位值，并把**扫描方法与实测结果**写进注释（照 `PLAYER_REFERENCE.minerTarget` 的先例）：

```ts
/**
 * Level 2's enemy.
 *
 * Values MEASURED by sweeping minerTarget x decisionIntervalTicks against
 * level 2, 5 seeds each. Criteria: the reference player must win every seed
 * (a level that cannot be won is not a level) AND the match must land in the
 * 3-6 minute window of spec §8.4.3.
 *
 * (sweep results pasted here)
 */
export const LEVEL_2_ENEMY: AiProfile = { /* measured values */ };
```

- [ ] **Step 4: 删掉探针，跑全量**

Run: `Remove-Item src/sim/_sweep.test.ts; npx tsc --noEmit; npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(sim): set level 2's enemy profile from a measured sweep"
```

---

### Task 8: 接入渲染层 —— 关卡流转与结果浮层

**Files:**
- Modify: `src/sim/harness.ts`（`runMatch` 支持 base 条件与自定义敌方档案）
- Modify: `src/render/scenes/BattleScene.ts`
- Create: `src/render/result/index.ts`
- Test: `src/sim/level-winnable.test.ts`（追加关卡 2 的可通关断言）

**Interfaces:**
- Produces: `runMatch(config, seed, playerProfile, maxTicks?)`（行为扩展）
- Produces: `createResultOverlay(scene, callbacks): { sync, layout, destroy }`
- Produces: `BattleScene.init(data?: { config, seed })`

- [ ] **Step 1: 写会失败的测试（可通关性）**

在 `src/sim/level-winnable.test.ts` 末尾追加：

```ts
describe('level 2 — the reference player wins', () => {
  for (const seed of SEEDS) {
    it(`wins on seed ${seed}`, () => {
      const r = runMatch(LEVEL_2, seed, 'reference');
      expect(r.outcome, `seed ${seed}: ${JSON.stringify(r)}`).toBe('playerWin');
    });
  }

  it('wins by destroying the base, not by clearing the field', () => {
    const r = runMatch(LEVEL_2, 1, 'reference');
    expect(r.enemyBaseHp).toBe(0);
  });

  it('lands inside the 3-6 minute target', () => {
    const r = runMatch(LEVEL_2, 1, 'reference');
    const seconds = r.ticks / 30;
    expect(seconds, `took ${seconds}s`).toBeGreaterThanOrEqual(180);
    expect(seconds, `took ${seconds}s`).toBeLessThanOrEqual(360);
  });

  it('can also be LOST', () => {
    const r = runMatch(LEVEL_2, 1, 'none');
    expect(r.outcome).toBe('playerLose');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/sim/level-winnable.test.ts`
Expected: FAIL —— `MatchResult` 没有 `enemyBaseHp`。

- [ ] **Step 3: 扩展 `runMatch`**

`src/sim/harness.ts` 的 `MatchResult` 加：

```ts
  /** Final HP of each base, so a test can tell "destroyed it" from "cleared the field". */
  baseHp: Record<Side, number>;
```

并在返回对象里加：

```ts
    baseHp: { player: world.bases.player.hp, enemy: world.bases.enemy.hp },
```

> 测试里用 `r.enemyBaseHp`，所以**也加一个便利 getter**（或直接把测试改为 `r.baseHp.enemy`）。**推荐后者** —— 少一个字段，语义更清楚。请把测试里的 `r.enemyBaseHp` 改为 `r.baseHp.enemy`。

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/sim/level-winnable.test.ts`
Expected: PASS（前提是 Task 7 已把档案调到可通关）。

- [ ] **Step 5: 写结果浮层渲染器**

创建 `src/render/result/index.ts`，**与 `createHud` 同形**：

```ts
/**
 * The result overlay: a dimmed panel with the verdict and two actions.
 *
 * Shaped like `createHud` on purpose — `sync` / `layout` / `destroy` — so the
 * scene holds it the same way and a reader who knows the HUD already knows
 * this. All geometry and copy come from `layout.ts`, which is testable; this
 * file only turns those answers into Phaser objects.
 */

import Phaser from 'phaser';
import { t } from '../../i18n';
import { formatDuration, resultButtonRects, resultPanelRect, resultSubtitle, resultTitle, shouldShowResult } from './layout';
import type { World } from '../../sim/types';

const FONT = 'monospace';
const TEXT_LIGHT = '#e8edf4';
const PANEL_COLOR = 0x141821;
const PANEL_ALPHA = 0.94;
const BUTTON_ON = 0x2f3a4a;
const OVERLAY_ALPHA = 0.6;
const OVERLAY_DEPTH = 2000;

export interface ResultOverlayCallbacks {
  onReplay(): void;
  onNextLevel(): void;
}

export interface ResultOverlay {
  sync(world: World, ticks: number, nextLabel: string): void;
  layout(width: number, height: number): void;
  destroy(): void;
}

export function createResultOverlay(
  scene: Phaser.Scene,
  callbacks: ResultOverlayCallbacks,
): ResultOverlay {
  // ... create dimmer, panel, title, subtitle, two buttons; setScrollFactor(0);
  // depths above the HUD (BAR_DEPTH is 900, so 2000+ is clear of everything).
  // `sync` sets visibility from shouldShowResult and rewrites the text.
  // The button labels come from `nextLabel` so the scene decides what "next"
  // means (another level, or back to the first) — the overlay does not know the
  // campaign layout and should not.
}
```

**实现要求**（照 `hud/index.ts` 的 `makeButton` 写法）：
- 每个按钮 `rect.setSize(r.w, r.h)`，与 layout 的矩形一致（HUD 曾因「绘制尺寸与槽位尺寸不一致」导致暂停按钮压住速度标题）
- 全部 `setScrollFactor(0)`
- depth ≥ 2000（HUD 是 900/902）
- `destroy()` 销毁全部对象

- [ ] **Step 6: 改 `BattleScene`**

要点（逐条都要做到）：

1. **`init(data)`**：
```ts
  private config!: MatchConfig;
  private seed = 20260926;
  private levelIndex = 0;

  init(data?: { config?: MatchConfig; seed?: number }): void {
    this.config = data?.config ?? LEVELS[0];
    this.seed = data?.seed ?? 20260926;
    this.levelIndex = LEVELS.indexOf(this.config);
  }
```

2. **`create()` 用 `this.config` / `this.seed`**，不再用 `RENDER_DEMO_MATCH`。

3. **`R` 键改为重玩当前关卡**：
```ts
    this.input.keyboard?.on('keydown-R', () => {
      this.scene.restart({ config: this.config, seed: this.seed });
    });
```

4. **结果浮层**：`create()` 里 `this.result = createResultOverlay(this, {...})`；`SHUTDOWN` 时 `destroy()`。
   - `onReplay` → `this.scene.restart({ config: this.config, seed: this.seed })`
   - `onNextLevel` → 下一关：`LEVELS[(this.levelIndex + 1) % LEVELS.length]`，`this.scene.restart({ config: next, seed: this.seed })`

5. **判胜后停止推进**：
```ts
    // Spec §6.6: once decided, stop ticking. Continuing would make "the final
    // state" depend on how long the player took to click, and at 4x would let
    // the winner mop up a corpse army for no reason.
    if (this.world.outcome === 'ongoing' && !this.paused) {
      this.ticks = advanceWorld(this.timestep, this.world, delta, this.speed, () => this.commands.take());
    }
```
   注意：**渲染工作（插值、同步火柴人）在暂停与结算时仍要跑**（M3 的教训：暂停曾冻住 UI）。

6. **浮层期间禁用暂停键**（浮层自己就是暂停态）：`togglePause` 在 `world.outcome !== 'ongoing'` 时直接返回。

7. **累计用时**：`this.ticks` 累加 `advanceWorld` 的返回值，传给 `result.sync(world, this.ticks, nextLabel)`。

8. **「下一关」的文案**：`LEVELS.length === 1 || this.levelIndex === LEVELS.length - 1` 时用 `t('result.restartCampaign')`，否则 `t('result.next')`。

- [ ] **Step 7: 类型检查 + 全量测试**

Run: `npx tsc --noEmit && npm test`
Expected: 全部 PASS。

- [ ] **Step 8: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat(render): level flow and the result overlay"
```

---

### Task 9: 文档与验收

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 AGENTS.md**

- 状态：M4b 完成（tests 数）
- 「M4b 实测发现」6 条改为「已处理」
- 删除「M4b 开工前必须处理」整节（已清）
- 在「关键设计要点」补：`winCondition` 由配置选择；`Projectile` 携带目标引用；关卡 2 的敌方档案是实测值
- 保留 `difficultyMult` 的 M5 义务（已在 spec §15 登记表）

- [ ] **Step 2: 全量最终验证**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: 全绿。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "docs: record M4b delivery"
```

---

## M4b 验收

| # | 验收标准 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | **关卡 1 逐 tick 行为与 M4a 一致**（黄金指纹） | `npm test -- src/sim/level-1-regression.test.ts` | ☐ |
| 2 | `'base'` 下敌方单位归零**不**判胜 | `npm test -- src/sim/win-condition.test.ts` | ☐ |
| 3 | `'base'` 下基地归零判胜 | 同上 | ☐ |
| 4 | `'base'` 下玩家单位归零**仍**判负 | 同上 | ☐ |
| 5 | `'annihilation'` 与 `endless` 行为不变 | 同上 | ☐ |
| 6 | 基地条件下**必然终止**（无僵局） | 同上 | ☐ |
| 7 | **弓箭手能削减并摧毁基地** | `npm test -- src/sim/base-damage.test.ts` | ☐ |
| 8 | **§6.5 相克矩阵仍全体一致**（10 场景 × 6 种子） | `npm test -- src/sim/counter-relations.test.ts` | ☐ |
| 9 | 关卡 2 数据符合 spec §8.4.3 | `npm test -- src/sim/level-2.test.ts` | ☐ |
| 10 | **参考玩家能打赢关卡 2**（5 种子，靠拆基地） | `npm test -- src/sim/level-winnable.test.ts` | ☐ |
| 11 | 参考玩家**也能输掉**关卡 2 | 同上 | ☐ |
| 12 | 关卡 2 时长落在 3~6 分钟 | 同上 | ☐ |
| 13 | 结果浮层逻辑（可见性/文案/不重叠/不越界） | `npm test -- src/render/result/layout.test.ts` | ☐ |
| 14 | 新字段全部进 `hashWorld` | `npm test -- src/sim/hash.test.ts` | ☐ |
| 15 | **肉眼**：打完关卡 1 出现浮层，点「下一关」进入关卡 2 | 浏览器 | ☐ |
| 16 | **肉眼**：关卡 2 里基地被打倒才结束（不是清场就结束） | 浏览器 | ☐ |
| 17 | **肉眼**：弓箭手能打掉基地 HP | 浏览器 | ☐ |
| 18 | 全量测试 + tsc + lint + build 全绿 | `npm test && npx tsc --noEmit && npm run lint && npm run build` | ☐ |

> **第 1 条是本次改动的安全网，第 8 条是修复远程伤害的代价检查。** 两条都不能放宽。

---

## 后续

**M5** —— 无尽模式（届时实现 `difficultyMult`，**必须同步进 `hashWorld`**，见 spec §15）、关卡选择菜单、战线指示器、i18n 英文、localStorage、音效、GitHub Pages 部署。
