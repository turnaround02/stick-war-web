# M2 移动与战斗 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `src/sim/` 的七个空 system 真正运转起来 —— 单位能移动、分离、选敌、挥砍、射箭、死亡，战斗结果逐 tick 可复现；并交付一个能在毫秒级跑完整场对局的平衡 harness。

**Architecture:** 六个 tick 步骤（经济 → 指令 → AI → 运动 → 战斗 → 清理）各自填充，顺序不变。运动步骤内部按固定五步执行（记录 prevX → 积分 → 同阵营分离 → 敌对阻挡 → 钳制）。所有计时器是整数 tick，所有随机来自种子 PRNG。渲染层只读 sim 状态，死亡动画与插值在渲染层用脱离 sim 的临时精灵完成。

**Tech Stack:** Phaser 4.2.1 / Vite ^6.3.1 / TypeScript ^5.7.2 / Vitest ^3 / npm

**Spec:** `docs/superpowers/specs/2026-09-25-stick-war-web-design.md`（§6 战斗模拟、§7.1 动画、§9.3 harness、§11 M2、§13 M2 决策记录）

## Global Constraints

以下约束逐字取自 spec，**每个任务都隐含包含本节**。

- 逻辑帧率固定 **30 Hz**；所有计时器为**整数 tick**
- 数据表用**秒**书写，经 `toTicks()` 转换**一次**后使用
- `src/sim/**` **禁止** import `phaser`，也禁止 import `render/`、`input/`、`i18n/`
- sim 内**禁止** `Math.random()`、`Date.now()`、`performance.now()`
- **tick 六步顺序不可换**：经济 → 指令 → AI → 运动 → 战斗 → 清理
- **死亡两阶段**：步骤 5 标记 `state='dead'`，步骤 6 移除
- 排序比较器**必须是全序**（`x` 相同用 `unit.id` 决胜）
- 世界宽度 **3000 px**；单位 X 钳制在 `[0, worldWidth]`
- 代码标识符与注释用**英文**；UI 文案用中文走 i18n 键
- 禁用 `Math.TAU` / `Math.PI2`（Phaser 4 陷阱），一律用 `Math.PI * 2`
- **`TARGET_ACQUIRE_RANGE = 500`** / **`LOCK_BREAK_RANGE = 700`**（不是 `attackRange * 2.5`）

## Review Focus

spec 隐含、但最容易在实现中被打穿的五类输入/失效模式。每条都已落到具体任务的测试里。

| # | 输入 / 条件 | 合理预期 | 承接任务 |
|---|---|---|---|
| 1 | 前摇进行中，目标在出手前移出射程或死亡 | 挥空 —— 不造成伤害，进入冷却，不重开前摇 | Task 9 |
| 2 | 大量单位被挤在同一 X（密集阵型、撤退穿行） | 分离收敛，无残留重叠；同阵营相邻间距 ≥ 半径和 − 0.5px | Task 6 |
| 3 | 目标在 500–700px 之间来回移动（迟滞带内） | 目标锁定不抖动，不反复重选 | Task 8 |
| 4 | 两军同时全灭 / 基地与最后一单位同 tick 归零 | `outcome` 明确，不抛异常，不出现 `undefined` | Task 11 |
| 5 | 弹丸在飞行途中目标死亡 | 弹丸消失，不产生对已移除单位的伤害，不抛异常 | Task 10 |

---

## File Structure

```
src/
├── data/
│   ├── constants.ts        # 修改：加战斗常量与让位权重表
│   ├── units.ts            # 修改：补 attackType 相关派生字段
│   ├── unitTicks.ts        # 新建：★ 秒→tick 的唯一转换点
│   └── levels.ts           # 修改：RENDER_DEMO_MATCH 改为对撞演示
├── sim/
│   ├── types.ts            # 修改：TargetRef / stats / target 字段
│   ├── rng.ts              # 不变
│   ├── createWorld.ts      # 修改：用 UNIT_TICKS、支持兵力编成
│   ├── hash.ts             # 新建：FNV-1a 状态哈希
│   ├── damage.ts           # 新建：伤害与护甲结算（纯函数）
│   ├── targeting.ts        # 新建：目标搜索与锁定（纯函数）
│   ├── spawn.ts            # 新建：单位构造（createWorld 与 harness 共用）
│   ├── harness.ts          # 新建：★ 无渲染对局运行器
│   ├── harness.test.ts     # 新建：对撞矩阵
│   ├── tick.ts             # 不变（顺序已锁定）
│   └── systems/
│       ├── economy.ts      # 修改：训练队列推进
│       ├── commands.ts     # 修改：train / setStance
│       ├── ai.ts           # 修改：状态机 + 目标锁定
│       ├── movement.ts     # 修改：姿态驱动的期望位置
│       ├── separation.ts   # 修改：★ 1D 分离 + 敌对阻挡
│       ├── combat.ts       # 修改：前摇 / 伤害 / 弹丸
│       └── cleanup.ts      # 修改：移除死亡 + 胜负判定
└── render/
    ├── stickman/
    │   ├── poses.ts        # 修改：关键帧数组 + 线性插值
    │   └── skeleton.ts     # 修改：朝向翻转
    ├── ghost.ts            # 新建：死亡幽灵精灵
    ├── projectile.ts       # 新建：弹丸绘制
    └── scenes/BattleScene.ts # 修改：装配 + R 键重置
```

**职责边界：**

| 文件 | 职责 | 依赖 |
|---|---|---|
| `data/unitTicks.ts` | 秒→tick 的**唯一**转换点，模块加载时算一次 | `data/units`, `data/constants` |
| `sim/hash.ts` | 纯函数：World → 固定顺序的字符串哈希 | `sim/types` |
| `sim/damage.ts` | 纯函数：攻击者/防御者 → 伤害值 | `data/unitTicks` |
| `sim/targeting.ts` | 纯函数：搜索 / 锁定判定 | `data/constants`, `sim/types` |
| `sim/spawn.ts` | 构造 `Unit` 实例，`createWorld` 与 `harness` 共用 | `data/unitTicks`, `sim/types` |
| `sim/harness.ts` | 跑完整对局，返回 `ScenarioResult` | 全部 sim |
| `sim/systems/separation.ts` | 1D 约束，**不 import phaser，不做 I/O** | `data/constants`, `sim/types` |

---

### Task 1: 秒→tick 的派生表

M2 的**第一件事**。没有它，`attackCooldown: 1.0` 会被当成 1 tick，游戏快 30 倍。

**Files:**
- Create: `src/data/unitTicks.ts`
- Test: `src/data/unitTicks.test.ts`

**Interfaces:**
- Consumes: `data/units.ts`（`UNITS`）、`data/constants.ts`（`toTicks`）
- Produces: `UnitTickStats` 接口与 `UNIT_TICKS: Record<UnitTypeId, UnitTickStats>`

- [ ] **Step 1: 写会失败的测试**

创建 `src/data/unitTicks.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { UNIT_TICKS } from './unitTicks';
import { UNITS } from './units';
import { TICKS_PER_SEC } from './constants';

describe('UNIT_TICKS', () => {
  it('covers every unit type', () => {
    for (const id of Object.keys(UNITS) as (keyof typeof UNITS)[]) {
      expect(UNIT_TICKS[id]).toBeDefined();
    }
  });

  it('converts attackCooldown from seconds to ticks', () => {
    // swordsman: 1.0s -> 30 ticks
    expect(UNIT_TICKS.swordsman.attackCooldown).toBe(30);
    // archer: 1.2s -> 36 ticks
    expect(UNIT_TICKS.archer.attackCooldown).toBe(36);
    // spearman: 1.2s -> 36 ticks
    expect(UNIT_TICKS.spearman.attackCooldown).toBe(36);
  });

  it('converts windupTime from seconds to ticks', () => {
    // swordsman: 0.25s -> 7.5 -> round -> 8
    expect(UNIT_TICKS.swordsman.windup).toBe(8);
    // archer/spearman: 0.30s -> 9
    expect(UNIT_TICKS.archer.windup).toBe(9);
    expect(UNIT_TICKS.spearman.windup).toBe(9);
  });

  it('converts trainTime and gatherTime', () => {
    expect(UNIT_TICKS.swordsman.trainTime).toBe(240); // 8s
    expect(UNIT_TICKS.miner.gatherTime).toBe(90);     // 3s
  });

  it('produces integers everywhere', () => {
    for (const stats of Object.values(UNIT_TICKS)) {
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value === 'number') {
          expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
        }
      }
    }
  });

  it('gives a miner zero windup and zero cooldown (it cannot attack)', () => {
    expect(UNIT_TICKS.miner.windup).toBe(0);
    expect(UNIT_TICKS.miner.attackCooldown).toBe(0);
  });

  it('never produces a zero windup for a unit that can attack', () => {
    for (const id of ['swordsman', 'archer', 'spearman'] as const) {
      expect(UNIT_TICKS[id].windup).toBeGreaterThan(0);
      expect(UNIT_TICKS[id].attackCooldown).toBeGreaterThan(0);
    }
  });

  it('derives speed per tick from px per second', () => {
    // swordsman: 95 px/s / 30 = 3.1666...
    expect(UNIT_TICKS.swordsman.speedPerTick).toBeCloseTo(95 / TICKS_PER_SEC, 10);
  });

  it('does not mutate the source table', () => {
    const before = JSON.stringify(UNITS.swordsman);
    void UNIT_TICKS;
    expect(JSON.stringify(UNITS.swordsman)).toBe(before);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/data/unitTicks.test.ts`
Expected: FAIL，`Failed to resolve import "./unitTicks"`。

- [ ] **Step 3: 写实现**

创建 `src/data/unitTicks.ts`：

```ts
/**
 * The ONE place where data-table seconds become integer ticks (spec §5.1).
 *
 * Computed once at module load. Systems import this table directly instead of
 * converting per-tick, and the values are NOT stored on World (that would add
 * serialisation weight) nor on each Unit (that would be per-unit redundancy).
 *
 * Why not convert inside createWorld: createWorld builds a World, but
 * attackCooldown / windupTime are read by combatSystem, which has no access to
 * the unit definition table. A derived table is the only place both can reach.
 *
 * difficultyMult is a PER-MATCH multiplier and therefore must NOT live here —
 * it is applied at spawn time in M4/M5.
 */

import { TICKS_PER_SEC, toTicks } from './constants';
import { UNITS, type UnitTypeId } from './units';

export interface UnitTickStats {
  /** Ticks between the start of an attack and the strike landing. */
  windup: number;
  /** Ticks of cooldown after a strike. */
  attackCooldown: number;
  /** Ticks to train this unit. */
  trainTime: number;
  /** Ticks spent mining per trip (miners only; 0 otherwise). */
  gatherTime: number;
  /** Movement per tick in px. Kept as a float — position is not tick-quantised. */
  speedPerTick: number;
  /** Projectile travel per tick in px. 0 for non-ranged units. */
  projectilePerTick: number;
}

function derive(id: UnitTypeId): UnitTickStats {
  const def = UNITS[id];
  return {
    windup: toTicks(def.windupTime),
    attackCooldown: toTicks(def.attackCooldown),
    trainTime: toTicks(def.trainTime),
    gatherTime: toTicks(def.gatherTime),
    // Division, not rounding: positions stay floating point. Determinism holds
    // as long as the operation order is fixed, which it is.
    speedPerTick: def.moveSpeed / TICKS_PER_SEC,
    projectilePerTick: def.projectileSpeed / TICKS_PER_SEC,
  };
}

export const UNIT_TICKS: Record<UnitTypeId, UnitTickStats> = {
  miner: derive('miner'),
  swordsman: derive('swordsman'),
  archer: derive('archer'),
  spearman: derive('spearman'),
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/data/unitTicks.test.ts`
Expected: PASS，9 passed。

- [ ] **Step 5: 提交**

```bash
git add src/data/unitTicks.ts src/data/unitTicks.test.ts
git commit -m "feat(data): add derived seconds-to-ticks table"
```

---

### Task 2: 战斗常量与让位权重

**Files:**
- Modify: `src/data/constants.ts`
- Test: `src/data/constants.test.ts`（追加）

**Interfaces:**
- Consumes: 无
- Produces:
  - `TARGET_ACQUIRE_RANGE = 500`、`LOCK_BREAK_RANGE = 700`、`TARGET_TOLERANCE = 20`
  - `SEPARATION_EPSILON = 0.5`
  - `YIELD_BASE = 0`、`YIELD_RETREAT = 0.25`、`YIELD_BUSY = 0.5`、`YIELD_ATTACK = 1.0`、`YIELD_IDLE = 1.5`
  - `yieldWeight(state: UnitState, stance: Stance, isBase: boolean): number`

- [ ] **Step 1: 写会失败的测试**

在 `src/data/constants.test.ts` 末尾追加：

```ts
import {
  TARGET_ACQUIRE_RANGE,
  LOCK_BREAK_RANGE,
  yieldWeight,
} from './constants';

describe('targeting constants', () => {
  it('gives the lock-break range real hysteresis over the acquire range', () => {
    expect(LOCK_BREAK_RANGE).toBeGreaterThan(TARGET_ACQUIRE_RANGE);
  });

  it('acquires far enough for an archer to see past its own range', () => {
    // archer attackRange is 200; it must be able to notice enemies beyond that
    expect(TARGET_ACQUIRE_RANGE).toBeGreaterThan(200);
  });
});

describe('yieldWeight', () => {
  it('makes bases immovable', () => {
    expect(yieldWeight('idle', 'hold', true)).toBe(0);
  });

  it('gives retreat the lowest yield so it can push through its own line', () => {
    const retreat = yieldWeight('move', 'retreat', false);
    const idle = yieldWeight('idle', 'hold', false);
    expect(retreat).toBeLessThan(idle);
  });

  it('ranks retreat below busy states below attack below idle', () => {
    const retreat = yieldWeight('move', 'retreat', false);
    const gather = yieldWeight('gather', 'hold', false);
    const attack = yieldWeight('attack', 'hold', false);
    const idle = yieldWeight('idle', 'hold', false);
    expect(retreat).toBeLessThan(gather);
    expect(gather).toBeLessThan(attack);
    expect(attack).toBeLessThan(idle);
  });

  it('keeps attack pushable, not immovable', () => {
    // A zero here would create a zombie wall and break R2.
    expect(yieldWeight('attack', 'hold', false)).toBeGreaterThan(0);
  });

  it('treats stunned like gather', () => {
    expect(yieldWeight('stunned', 'hold', false)).toBe(yieldWeight('gather', 'hold', false));
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/data/constants.test.ts`
Expected: FAIL，`yieldWeight` 未导出。

- [ ] **Step 3: 写实现**

在 `src/data/constants.ts` 末尾追加：

```ts
// ── Targeting (spec §6.4) ───────────────────────────────────────────
/** How far ahead a unit looks for a new target. */
export const TARGET_ACQUIRE_RANGE = 500;

/**
 * Distance at which a lock is dropped. Must exceed TARGET_ACQUIRE_RANGE or a
 * unit sitting exactly at the acquire boundary would re-acquire and drop its
 * target every tick, jittering between choices.
 */
export const LOCK_BREAK_RANGE = 700;

/** Slack around "directly ahead" when searching, so units on the same X still engage. */
export const TARGET_TOLERANCE = 20;

// ── Separation (spec §6.2) ──────────────────────────────────────────
/** Overlap tolerated before a push is applied. Sub-pixel jitter guard. */
export const SEPARATION_EPSILON = 0.5;

/**
 * Yield weights. HIGHER means the unit gives way MORE.
 *
 * A unit with weight w yields the fraction w / (self + other) of the overlap,
 * so weight 0 yields nothing (immovable). The two fractions always sum to 1,
 * so the overlap is exactly resolved in one pass.
 *
 * The ordering matters and each step has a reason:
 *   BASE    0     — immovable obstacle
 *   RETREAT 0.25  — must push through its own line, or `retreat` does nothing
 *   BUSY    0.5   — gathering / stunned units cannot step aside on their own
 *   ATTACK  1.0   — has weight but stays pushable; making it 0 would form a
 *                   zombie wall and break the back-rank design (R2)
 *   IDLE    1.5   — easiest to shove
 */
export const YIELD_BASE = 0;
export const YIELD_RETREAT = 0.25;
export const YIELD_BUSY = 0.5;
export const YIELD_ATTACK = 1.0;
export const YIELD_IDLE = 1.5;

/** How much a unit gives way when pushed. See the weight table above. */
export function yieldWeight(state: UnitState, stance: Stance, isBase: boolean): number {
  if (isBase) return YIELD_BASE;
  if (stance === 'retreat') return YIELD_RETREAT;
  if (state === 'gather' || state === 'stunned') return YIELD_BUSY;
  if (state === 'attack') return YIELD_ATTACK;
  return YIELD_IDLE;
}
```

并在文件顶部的常量区之后加上类型 import：

```ts
import type { Stance, UnitState } from '../sim/types';
```

> **注意循环依赖**：`constants.ts` 从 `sim/types.ts` 引入**类型**，而 `sim/types.ts` 从 `data/units.ts` 引入类型。这是类型层的循环，运行时不存在（`import type` 会被完全擦除）。但必须确认用的是 `import type`，否则会真的产生运行时循环。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/data/constants.test.ts`
Expected: PASS，17 passed（原 8 + 新 9）。

- [ ] **Step 5: 验证无运行时循环依赖**

Run: `npm run build`
Expected: 无 TS 错误，构建成功。

> 若构建报循环依赖或 `undefined` 导入，说明 `import type` 被写成了普通 import。检查 `constants.ts` 的第一行。

- [ ] **Step 6: 提交**

```bash
git add src/data/constants.ts src/data/constants.test.ts
git commit -m "feat(data): add targeting constants and separation yield weights"
```

---

### Task 3: 类型扩展（TargetRef / stats）

**Files:**
- Modify: `src/sim/types.ts`
- Test: `src/sim/types.test.ts`（新建，仅测运行时可达的部分）

**Interfaces:**
- Consumes: `data/types.ts`
- Produces:
  - `TargetRef` 判别联合
  - `Unit.target: TargetRef`（替换 `targetId: number | null`）
  - `World.stats: Record<Side, SideStats>`、`SideStats = { damageDealt: number }`
  - `Projectile.prevX: number`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/types.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import type { TargetRef } from './types';

/** Narrowing helper mirroring how systems will consume a TargetRef. */
function describeTarget(target: TargetRef): string {
  if (target === null) return 'none';
  switch (target.kind) {
    case 'unit':
      return `unit:${target.id}`;
    case 'base':
      return `base:${target.side}`;
  }
}

describe('TargetRef', () => {
  it('expresses no target', () => {
    expect(describeTarget(null)).toBe('none');
  });

  it('expresses a unit target', () => {
    expect(describeTarget({ kind: 'unit', id: 7 })).toBe('unit:7');
  });

  it('expresses a base target', () => {
    expect(describeTarget({ kind: 'base', side: 'enemy' })).toBe('base:enemy');
  });

  it('exhausts the union — the switch has no default and still type-checks', () => {
    // If a third variant were added, tsc would fail on the missing case.
    const all: TargetRef[] = [null, { kind: 'unit', id: 1 }, { kind: 'base', side: 'player' }];
    expect(all.map(describeTarget)).toEqual(['none', 'unit:1', 'base:player']);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/types.test.ts`
Expected: FAIL，`TargetRef` 未定义。

- [ ] **Step 3: 写实现**

修改 `src/sim/types.ts`。把 `Unit` 的 `targetId` 字段替换为 `target`：

```ts
/**
 * What a unit is currently attacking. A discriminated union rather than a
 * numeric id so the type system forces every consumer to handle bases —
 * units attacking the enemy base is core gameplay, not an edge case.
 */
export type TargetRef =
  | { kind: 'unit'; id: number }
  | { kind: 'base'; side: Side }
  | null;
```

在 `Unit` 接口中，把：

```ts
  /** Locked target. Null when idle with no target (spec §6.4). */
  targetId: number | null;
```

替换为：

```ts
  /** Locked target. Null when idle with no target (spec §6.4). */
  target: TargetRef;
```

在 `Projectile` 接口中追加：

```ts
  /** X at the start of this tick. Used ONLY by the renderer for interpolation. */
  prevX: number;
```

新增 `SideStats` 并在 `World` 上挂载：

```ts
/** Per-side accumulators for the balance harness (spec §6.7). */
export interface SideStats {
  /** Total damage this side has dealt to the other side's units and base. */
  damageDealt: number;
}
```

在 `World` 接口中追加：

```ts
  /** Per-side combat accumulators. Serialised with the world. */
  stats: Record<Side, SideStats>;
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/types.test.ts`
Expected: PASS，4 passed。

- [ ] **Step 5: 观察编译错误的范围**

Run: `npx tsc --noEmit`
Expected: **报错**，因为 `createWorld.ts` 仍在写 `targetId`、`Projectile` 缺 `prevX`、`World` 缺 `stats`。这是**预期的** —— 记录下报错清单，Task 4 会全部修掉。

> 这一步不是可有可无的：它告诉你还有哪些文件需要跟进，避免漏改。

- [ ] **Step 6: 提交**

```bash
git add src/sim/types.ts src/sim/types.test.ts
git commit -m "feat(sim): add TargetRef union, damage stats, projectile prevX"
```

---

### Task 4: 单位构造抽离与 World 补齐

**Files:**
- Create: `src/sim/spawn.ts`
- Modify: `src/sim/createWorld.ts`
- Modify: `src/data/levels.ts`
- Test: `src/sim/spawn.test.ts`

**Interfaces:**
- Consumes: `data/unitTicks`, `data/constants`, `sim/types`
- Produces:
  - `spawnUnit(opts: SpawnOptions): Unit`
  - `SpawnOptions = { id, side, typeId, x, stance? }`
  - `createWorld(config, seed)` 现支持 `config.initialUnits`
  - `MatchConfig.initialUnits?: { player?: UnitTypeId[]; enemy?: UnitTypeId[] }`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/spawn.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { spawnUnit } from './spawn';
import { UNIT_TICKS } from '../data/unitTicks';

describe('spawnUnit', () => {
  it('starts at full hp for the type', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    expect(u.hp).toBe(150);
  });

  it('sets prevX equal to x so the first frame does not jump', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 250 });
    expect(u.prevX).toBe(250);
  });

  it('starts idle with no target and no timers running', () => {
    const u = spawnUnit({ id: 1, side: 'enemy', typeId: 'spearman', x: 10 });
    expect(u.state).toBe('idle');
    expect(u.target).toBeNull();
    expect(u.windupTicksLeft).toBe(0);
    expect(u.cooldownTicksLeft).toBe(0);
  });

  it('defaults stance to hold', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 10 });
    expect(u.stance).toBe('hold');
  });

  it('honours an explicit stance', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 10, stance: 'advance' });
    expect(u.stance).toBe('advance');
  });

  it('gives the unit its attack cooldown already in ticks', () => {
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 0 });
    // A freshly spawned unit may strike immediately, so cooldown starts at 0,
    // but the derived table must be the source of the tick values.
    expect(UNIT_TICKS.swordsman.attackCooldown).toBe(30);
    expect(u.cooldownTicksLeft).toBe(0);
  });

  it('carries the requested id and side through', () => {
    const u = spawnUnit({ id: 42, side: 'enemy', typeId: 'archer', x: 5 });
    expect(u.id).toBe(42);
    expect(u.side).toBe('enemy');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/spawn.test.ts`
Expected: FAIL，无法解析 `./spawn`。

- [ ] **Step 3: 写 `src/sim/spawn.ts`**

```ts
/**
 * Builds Unit instances. Shared by createWorld and the balance harness so both
 * produce byte-identical units for the same inputs.
 */

import { UNITS, type UnitTypeId } from '../data/units';
import type { Side, Stance, Unit } from './types';

export interface SpawnOptions {
  id: number;
  side: Side;
  typeId: UnitTypeId;
  x: number;
  stance?: Stance;
}

export function spawnUnit(opts: SpawnOptions): Unit {
  const def = UNITS[opts.typeId];
  return {
    id: opts.id,
    side: opts.side,
    typeId: opts.typeId,
    x: opts.x,
    prevX: opts.x,
    hp: def.maxHp,
    state: 'idle',
    stateEnteredTick: 0,
    stance: opts.stance ?? 'hold',
    target: null,
    windupTicksLeft: 0,
    cooldownTicksLeft: 0,
    gatherTicksLeft: 0,
    carrying: 0,
    stunTicksLeft: 0,
  };
}
```

- [ ] **Step 4: 扩展 `MatchConfig` 以支持兵力编成**

在 `src/data/types.ts` 的 `MatchConfig` 中追加：

```ts
  /**
   * Explicit starting roster, listed as type ids. Takes precedence over
   * startMiners when present. Used by the balance harness to build arbitrary
   * matchups without inventing a level file per scenario.
   */
  initialUnits?: {
    player?: UnitTypeId[];
    enemy?: UnitTypeId[];
  };

  /** Gap between same-side units when spawning a roster, in px. */
  initialSpacing?: number;

  /**
   * Parks both bases outside the battlefield so no unit can ever reach them.
   * Used by the harness for base-less matchups: the bases stay at full hp, so
   * cleanupSystem's "base fell" condition never fires and the match is decided
   * purely by which side runs out of units.
   *
   * (Setting baseHp to 0 instead would end every such match on tick 1.)
   */
  noBases?: boolean;
```

并在该文件顶部追加 import：

```ts
import type { UnitTypeId } from './units';
```

- [ ] **Step 5: 重写 `createWorld.ts`**

```ts
/**
 * Builds the initial World from a MatchConfig and a seed.
 *
 * Unit durations arrive from data/unitTicks.ts already in integer ticks, so
 * nothing here converts seconds (spec §5.1).
 */

import { BASE_X, MINE_X } from '../data/levels';
import { SPAWN_OFFSET, UNITS, type UnitTypeId } from '../data/units';
import { spawnUnit } from './spawn';
import type { MatchConfig, Side, Unit, World } from './types';

const SIDES: readonly Side[] = ['player', 'enemy'];

export function createWorld(config: MatchConfig, seed: number): World {
  const units: Unit[] = [];
  let nextUnitId = 1;

  for (const side of SIDES) {
    const roster = config.initialUnits?.[side];

    if (roster && roster.length > 0) {
      // Spread the roster along X so tick 1 does not start with a full stack.
      const spacing = config.initialSpacing ?? 40;
      let cursor = 0;
      for (const typeId of roster) {
        const def = UNITS[typeId];
        const dir = side === 'player' ? 1 : -1;
        const offset = SPAWN_OFFSET + cursor;
        const x = clamp(BASE_X[side] + dir * offset, 0, config.worldWidth);
        units.push(spawnUnit({ id: nextUnitId++, side, typeId, x, stance: 'hold' }));
        cursor += spacing + def.bodyRadius * 2;
      }
      continue;
    }

    const count = config.startMiners[side] ?? 0;
    for (let i = 0; i < count; i++) {
      units.push(spawnInitialMiner(side, i, config, nextUnitId++));
    }
  }

  const popUsed: Record<Side, number> = { player: 0, enemy: 0 };
  for (const unit of units) {
    popUsed[unit.side] += UNITS[unit.typeId].popCost;
  }

  // Base-less matchups park the bases off-map at full hp, so the "base fell"
  // win condition can never fire and the match is decided by attrition alone.
  const playerBaseX = config.noBases ? -1000 : BASE_X.player;
  const enemyBaseX = config.noBases ? config.worldWidth + 1000 : BASE_X.enemy;

  return {
    tick: 0,
    rngState: seed,
    units,
    nextUnitId,
    bases: {
      player: { side: 'player', x: playerBaseX, hp: config.baseHp.player, maxHp: config.baseHp.player },
      enemy: { side: 'enemy', x: enemyBaseX, hp: config.baseHp.enemy, maxHp: config.baseHp.enemy },
    },
    mines: {
      player: { side: 'player', x: MINE_X.player, goldLeft: config.mineGold.player },
      enemy: { side: 'enemy', x: MINE_X.enemy, goldLeft: config.mineGold.enemy },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: config.startGold.player, enemy: config.startGold.enemy },
    popUsed,
    popCap: { player: config.popCap.player, enemy: config.popCap.enemy },
    trainingQueue: { player: [], enemy: [] },
    stats: {
      player: { damageDealt: 0 },
      enemy: { damageDealt: 0 },
    },
    waveIndex: 0,
    nextWaveTick: config.waves.length > 0 ? config.waves[0].atTick : Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: config.levelId,
    worldWidth: config.worldWidth,
    difficultyMult: config.difficultyMult,
    endless: config.endless,
  };
}

function spawnInitialMiner(
  side: Side,
  index: number,
  config: MatchConfig,
  id: number,
): Unit {
  const def = UNITS.miner;
  const dir = side === 'player' ? 1 : -1;
  const rawX = BASE_X[side] + dir * (SPAWN_OFFSET + index * def.bodyRadius * 2.5);
  const x = clamp(rawX, 0, config.worldWidth);
  return spawnUnit({ id, side, typeId: 'miner' as UnitTypeId, x, stance: 'hold' });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test -- src/sim/spawn.test.ts src/sim/createWorld.test.ts`
Expected: PASS。`createWorld.test.ts` 的 14 个测试仍应全绿 —— 若失败，检查 `spawnUnit` 是否漏了某个字段。

- [ ] **Step 7: 修掉其余编译错误**

Run: `npx tsc --noEmit`
Expected: 无错误。Task 3 遗留的 `targetId` 引用应已全部消除。

- [ ] **Step 8: 提交**

```bash
git add src/sim/spawn.ts src/sim/spawn.test.ts src/sim/createWorld.ts src/data/types.ts
git commit -m "feat(sim): extract unit spawning, support explicit rosters"
```

---

### Task 5: FNV-1a 状态哈希

**Files:**
- Create: `src/sim/hash.ts`
- Test: `src/sim/hash.test.ts`

**Interfaces:**
- Consumes: `sim/types`
- Produces: `hashWorld(world: World): string`

**设计要点：** 必须对**固定字段顺序**取哈希，且只纳入影响玩法结果的量。位置保留足够精度（4 位小数）以免浮点噪声，但不能丢精度到掩盖真实差异。

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/hash.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { hashWorld } from './hash';
import { createWorld } from './createWorld';
import { DEFAULT_MATCH } from '../data/levels';

const match = { ...DEFAULT_MATCH, initialUnits: { player: ['swordsman', 'archer'] as const, enemy: ['spearman'] as const } };

describe('hashWorld', () => {
  it('returns a stable string for the same world', () => {
    const w = createWorld(match, 1);
    expect(hashWorld(w)).toBe(hashWorld(w));
  });

  it('is identical for two worlds built from the same seed', () => {
    expect(hashWorld(createWorld(match, 7))).toBe(hashWorld(createWorld(match, 7)));
  });

  it('differs when the seed differs', () => {
    expect(hashWorld(createWorld(match, 1))).not.toBe(hashWorld(createWorld(match, 2)));
  });

  it('changes when a unit moves', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.units[0].x += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when a unit loses hp', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.units[0].hp -= 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when gold changes', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.gold.player += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when the rng state changes', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.rngState += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when a base takes damage', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.bases.enemy.hp -= 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when damage stats change', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.stats.player.damageDealt += 1;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('changes when a projectile is added', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    w.projectiles.push({
      id: 1,
      side: 'player',
      x: 10,
      prevX: 10,
      targetId: 0,
      damage: 1,
      ticksToImpact: 3,
    });
    expect(hashWorld(w)).not.toBe(before);
  });

  it('does not depend on object key insertion order', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    // Rebuild the world object with its keys in a different order.
    const shuffled = Object.fromEntries(
      Object.entries(w).reverse(),
    ) as typeof w;
    expect(hashWorld(shuffled)).toBe(before);
  });

  it('is order-sensitive within the units array', () => {
    const w = createWorld(match, 1);
    const before = hashWorld(w);
    const [first] = w.units.splice(0, 1);
    w.units.push(first);
    expect(hashWorld(w)).not.toBe(before);
  });

  it('does not collide for nearby positions', () => {
    const a = createWorld(match, 1);
    const b = createWorld(match, 1);
    a.units[0].x = 100.0001;
    b.units[0].x = 100.0002;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/hash.test.ts`
Expected: FAIL，无法解析 `./hash`。

- [ ] **Step 3: 写实现**

创建 `src/sim/hash.ts`：

```ts
/**
 * FNV-1a state hash for determinism regression tests (spec §5.1, M2 decision Q12).
 *
 * Why not JSON.stringify: it depends on object key insertion order, so merely
 * reordering fields in an interface changes the hash without changing behaviour.
 * A test that cries wolf is worse than no test — it trains you to ignore it.
 *
 * This walks a FIXED field order, so the hash reflects gameplay state only.
 */

import type { World } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Positions are rounded to this many decimals: finer is float noise, coarser hides real drift. */
const POSITION_DECIMALS = 4;

function fnv1a(input: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Math.imul keeps the multiply in 32-bit and deterministic across engines.
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

function quantise(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(POSITION_DECIMALS);
}

/** Hashes the gameplay-relevant state of a world into a hex string. */
export function hashWorld(world: World): string {
  const parts: string[] = [];

  parts.push(`tick=${world.tick}`);
  parts.push(`rng=${world.rngState}`);
  parts.push(`outcome=${world.outcome}`);

  parts.push(`gold.p=${world.gold.player}`);
  parts.push(`gold.e=${world.gold.enemy}`);
  parts.push(`pop.p=${world.popUsed.player}`);
  parts.push(`pop.e=${world.popUsed.enemy}`);

  parts.push(`base.p=${world.bases.player.hp}`);
  parts.push(`base.e=${world.bases.enemy.hp}`);

  parts.push(`dmg.p=${world.stats.player.damageDealt}`);
  parts.push(`dmg.e=${world.stats.enemy.damageDealt}`);

  for (const unit of world.units) {
    parts.push(
      `u${unit.id}:${unit.side}:${unit.typeId}:${quantise(unit.x)}:${unit.hp}:${unit.state}:${unit.stance}:${describeTarget(unit)}:${unit.windupTicksLeft}:${unit.cooldownTicksLeft}:${unit.stunTicksLeft}`,
    );
  }

  for (const p of world.projectiles) {
    parts.push(`p${p.id}:${p.side}:${quantise(p.x)}:${p.targetId}:${p.damage}:${p.ticksToImpact}`);
  }

  return fnv1a(parts.join('|'), FNV_OFFSET).toString(16).padStart(8, '0');
}

function describeTarget(unit: World['units'][number]): string {
  const t = unit.target;
  if (t === null) return '-';
  return t.kind === 'unit' ? `u${t.id}` : `b${t.side}`;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/hash.test.ts`
Expected: PASS，13 passed。

> 若「does not depend on object key insertion order」失败，说明你用了 `Object.entries(world)` 而非固定字段顺序。

- [ ] **Step 5: 替换 tick.test.ts 里的 JSON.stringify**

修改 `src/sim/tick.test.ts`，把确定性测试改为用 `hashWorld`：

```ts
import { hashWorld } from './hash';
```

并把原测试体替换为：

```ts
  it('is deterministic: same seed and same commands produce identical worlds', () => {
    const runOnce = () => {
      const world = createWorld({ ...DEFAULT_MATCH, startMiners: { player: 3, enemy: 3 } }, 999);
      for (let i = 0; i < 120; i++) step(world, []);
      return hashWorld(world);
    };
    expect(runOnce()).toBe(runOnce());
  });
```

同理修改 `src/sim/createWorld.test.ts` 里的「produces identical worlds for identical seeds」。

- [ ] **Step 6: 运行全部测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/sim/hash.ts src/sim/hash.test.ts src/sim/tick.test.ts src/sim/createWorld.test.ts
git commit -m "feat(sim): add FNV-1a state hash, replace JSON.stringify in tests"
```

---

### Task 6: 1D 分离约束

**Files:**
- Modify: `src/sim/systems/separation.ts`
- Test: `src/sim/systems/separation.test.ts`

**Interfaces:**
- Consumes: `data/constants`（`yieldWeight`, `SEPARATION_EPSILON`）、`data/units`、`sim/types`
- Produces: `separationSystem(ctx: TickContext): void`（签名不变）

**设计要点：** 正向扫一趟 + 反向扫一趟解开链条。比较器必须全序。

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/systems/separation.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { separationSystem } from './separation';
import { spawnUnit } from '../spawn';
import { UNITS } from '../../data/units';
import { SEPARATION_EPSILON } from '../../data/constants';
import type { TickContext, World } from '../types';

/** Minimal world stub: separation only reads units, bases and worldWidth. */
function makeWorld(units: World['units'], worldWidth = 3000): World {
  return {
    tick: 0,
    rngState: 0,
    units,
    nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 1, maxHp: 1 },
      enemy: { side: 'enemy', x: 2700, hp: 1, maxHp: 1 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 },
    popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0,
    nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: 'test',
    worldWidth,
    difficultyMult: 1,
    endless: false,
  };
}

function ctx(world: World): TickContext {
  return { world, commands: [] };
}

describe('separationSystem', () => {
  it('leaves well-separated units untouched', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 200 });
    separationSystem(ctx(makeWorld([a, b])));
    expect(a.x).toBe(100);
    expect(b.x).toBe(200);
  });

  it('pushes overlapping allies apart', () => {
    const r = UNITS.swordsman.bodyRadius; // 14, minGap 28
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 110 });
    separationSystem(ctx(makeWorld([a, b])));
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(2 * r - SEPARATION_EPSILON);
  });

  it('resolves a chain of three overlapping allies in one call', () => {
    const r = UNITS.swordsman.bodyRadius;
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 105 });
    const c = spawnUnit({ id: 3, side: 'player', typeId: 'swordsman', x: 110 });
    separationSystem(ctx(makeWorld([a, b, c])));
    const sorted = [a, b, c].sort((p, q) => p.x - q.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x - sorted[i - 1].x).toBeGreaterThanOrEqual(2 * r - SEPARATION_EPSILON);
    }
  });

  it('gives way asymmetrically: the retreating unit barely moves', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100, stance: 'hold' });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 110, stance: 'retreat' });
    const aBefore = a.x;
    const bBefore = b.x;
    separationSystem(ctx(makeWorld([a, b])));
    const aMoved = Math.abs(a.x - aBefore);
    const bMoved = Math.abs(b.x - bBefore);
    // The idle unit must give way more than the retreating one.
    expect(aMoved).toBeGreaterThan(bMoved);
  });

  it('treats a base as an immovable obstacle', () => {
    // Player base sits at x=300 with bodyRadius 40.
    const u = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 300 });
    separationSystem(ctx(makeWorld([u])));
    expect(u.x).toBeGreaterThan(300);
  });

  it('does not let enemies interpenetrate', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 110 });
    separationSystem(ctx(makeWorld([a, b])));
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(28 - SEPARATION_EPSILON);
  });

  it('clamps units to the world bounds', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 1 });
    const b = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 2 });
    const world = makeWorld([a, b], 3000);
    separationSystem(ctx(world));
    for (const u of world.units) {
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(world.worldWidth);
    }
  });

  it('is deterministic regardless of input array order', () => {
    const build = (order: number[]) => {
      const units = order.map((id, i) =>
        spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 100 + i * 3 }),
      );
      const world = makeWorld(units);
      separationSystem(ctx(world));
      return world.units
        .map((u) => `${u.id}:${u.x.toFixed(6)}`)
        .sort()
        .join(',');
    };
    expect(build([1, 2, 3])).toBe(build([3, 1, 2]));
  });

  it('produces no NaN positions', () => {
    const units = Array.from({ length: 20 }, (_, i) =>
      spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 100 + i * 0.5 }),
    );
    const world = makeWorld(units);
    separationSystem(ctx(world));
    for (const u of world.units) expect(Number.isFinite(u.x)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/separation.test.ts`
Expected: FAIL —— 单位重叠未被解开。

- [ ] **Step 3: 写实现**

替换 `src/sim/systems/separation.ts`：

```ts
/**
 * The 1D sort-and-separate constraint (spec §6.2).
 *
 * Not a top-level tick step — movementSystem calls it. It runs LAST in the
 * movement step, after positions have been integrated, so that pushing cannot
 * be undone by movement in the same tick.
 *
 * Determinism rules obeyed here:
 *   - the sort comparator is a TOTAL ORDER (ties broken by unit.id), so the
 *     result never depends on Array.prototype.sort's stability
 *   - no floating point accumulation into counters; positions are floats but
 *     the operation order is fixed
 */

import { SEPARATION_EPSILON, yieldWeight } from '../../data/constants';
import { UNITS } from '../../data/units';
import type { TickContext, Unit } from '../types';

export function separationSystem(ctx: TickContext): void {
  const { world } = ctx;

  for (const side of ['player', 'enemy'] as const) {
    const allies = world.units.filter((u) => u.side === side);
    if (allies.length === 0) continue;

    // Total order: ties on x are broken by id. Never rely on sort stability.
    allies.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id - b.id));

    separateAllies(allies);
  }

  blockEnemies(world.units);
  clampToWorld(world.units, world.worldWidth);
  blockBases(world.units, world.bases.player.x, world.bases.enemy.x);
}

/**
 * Pushes same-side neighbours apart. A forward sweep handles rightward pushes,
 * a backward sweep handles leftward ones; together they resolve chains
 * (A pushes B, B pushes C) that a single pass would leave overlapped.
 */
function separateAllies(allies: Unit[]): void {
  for (let i = 1; i < allies.length; i++) {
    pushPair(allies[i - 1], allies[i]);
  }
  for (let i = allies.length - 2; i >= 0; i--) {
    pushPair(allies[i], allies[i + 1]);
  }
}

function pushPair(left: Unit, right: Unit): void {
  const minGap = UNITS[left.typeId].bodyRadius + UNITS[right.typeId].bodyRadius;
  const gap = right.x - left.x;
  const overlap = minGap - gap;
  if (overlap <= SEPARATION_EPSILON) return;

  const wl = yieldWeight(left.state, left.stance, false);
  const wr = yieldWeight(right.state, right.stance, false);
  const total = wl + wr;
  if (total <= 0) return; // both immovable: leave as-is

  // Yield proportionally: weight 0 moves nothing, and the two shares sum to 1.
  const leftShare = wl / total;
  const rightShare = wr / total;

  left.x -= overlap * leftShare;
  right.x += overlap * rightShare;
}

/** Opposing units stop at contact instead of passing through each other. */
function blockEnemies(units: Unit[]): void {
  const players = units.filter((u) => u.side === 'player');
  const enemies = units.filter((u) => u.side === 'enemy');
  if (players.length === 0 || enemies.length === 0) return;

  const sortedPlayers = players.slice().sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id - b.id));
  const sortedEnemies = enemies.slice().sort((a, b) => (a.x !== b.x ? a.x - b.x : b.id - a.id));

  for (const p of sortedPlayers) {
    for (const e of sortedEnemies) {
      const minGap = UNITS[p.typeId].bodyRadius + UNITS[e.typeId].bodyRadius;
      const gap = e.x - p.x;
      if (gap >= minGap) continue;

      const overlap = minGap - gap;
      // Split evenly: neither side gets to push the other around just by
      // existing, and contact is symmetric.
      p.x -= overlap / 2;
      e.x += overlap / 2;
    }
  }
}

/** Keeps every unit inside [0, worldWidth]. Pushing can otherwise shove units off-map. */
function clampToWorld(units: Unit[], worldWidth: number): void {
  for (const u of units) {
    if (u.x < 0) u.x = 0;
    else if (u.x > worldWidth) u.x = worldWidth;
  }
}

/** Bases are immovable obstacles (spec §6.2). Units are pushed clear of them. */
function blockBases(units: Unit[], playerBaseX: number, enemyBaseX: number): void {
  const BASE_RADIUS = 40;
  for (const u of units) {
    const baseX = u.side === 'player' ? playerBaseX : enemyBaseX;
    const minGap = BASE_RADIUS + UNITS[u.typeId].bodyRadius;
    const gap = u.x - baseX;
    const dist = Math.abs(gap);
    if (dist >= minGap) continue;

    // Push away from the base, along whichever side the unit is on.
    const dir = gap >= 0 ? 1 : -1;
    u.x = baseX + dir * minGap;
  }
}
```

> **注**：`Obstacle` 接口已删除 —— 分离实现不需要它，保留会是死代码。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/separation.test.ts`
Expected: PASS，9 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/systems/separation.ts src/sim/systems/separation.test.ts
git commit -m "feat(sim): implement 1D separation with yield weights and base obstacles"
```

---

### Task 7: 伤害结算

**Files:**
- Create: `src/sim/damage.ts`
- Test: `src/sim/damage.test.ts`

**Interfaces:**
- Consumes: `data/units`
- Produces: `computeDamage(attack: number, bonusVs: Partial<Record<ArmorType, number>>, targetArmor: number, targetArmorType: ArmorType): number`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/damage.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { computeDamage } from './damage';

describe('computeDamage', () => {
  it('subtracts armour', () => {
    // swordsman 25 vs spearman armour 4, no bonus
    expect(computeDamage(25, {}, 4, 'heavy')).toBeCloseTo(21, 10);
  });

  it('applies the bonus multiplier BEFORE armour', () => {
    // swordsman 25 x1.5 vs light = 37.5, minus 0 armour
    expect(computeDamage(25, { light: 1.5 }, 0, 'light')).toBeCloseTo(37.5, 10);
    // spearman 24 x1.6 vs heavy = 38.4, minus 5 armour
    expect(computeDamage(24, { heavy: 1.6 }, 5, 'heavy')).toBeCloseTo(33.4, 10);
  });

  it('ignores bonuses that do not match the target armour type', () => {
    expect(computeDamage(25, { light: 1.5 }, 4, 'heavy')).toBeCloseTo(21, 10);
  });

  it('never drops below 10% of the raw value', () => {
    // 10 raw, 999 armour -> 10% floor = 1
    expect(computeDamage(10, {}, 999, 'heavy')).toBeCloseTo(1, 10);
  });

  it('still lets an armoured target be hurt by a weak attacker', () => {
    expect(computeDamage(5, {}, 100, 'heavy')).toBeGreaterThan(0);
  });

  it('returns the raw value when armour is zero', () => {
    expect(computeDamage(18, {}, 0, 'light')).toBeCloseTo(18, 10);
  });

  it('is deterministic and pure', () => {
    const a = computeDamage(24, { heavy: 1.6 }, 5, 'heavy');
    const b = computeDamage(24, { heavy: 1.6 }, 5, 'heavy');
    expect(a).toBe(b);
  });

  it('handles a zero attack gracefully', () => {
    expect(computeDamage(0, {}, 5, 'heavy')).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/damage.test.ts`
Expected: FAIL，无法解析 `./damage`。

- [ ] **Step 3: 写实现**

创建 `src/sim/damage.ts`：

```ts
/**
 * Damage and armour resolution (spec §6.5).
 *
 *   mult = bonusVs[targetArmorType] ?? 1
 *   raw  = attack * mult
 *   dmg  = max(raw - targetArmor, raw * 0.1)
 *
 * The bonus multiplies BEFORE armour, which is what keeps the two knobs
 * orthogonal: armour answers "how tough is this thing", the bonus answers
 * "is this weapon good against that kind of thing". Tuning one does not
 * disturb the other.
 *
 * The 10% floor prevents a hard counter from being a total wall — without it,
 * a sufficiently armoured unit becomes literally invulnerable to weak attacks
 * and the game deadlocks.
 */

import type { ArmorType } from '../data/units';

/** Fraction of the raw damage that always gets through. */
const MIN_DAMAGE_FRACTION = 0.1;

export function computeDamage(
  attack: number,
  bonusVs: Partial<Record<ArmorType, number>>,
  targetArmor: number,
  targetArmorType: ArmorType,
): number {
  if (attack <= 0) return 0;

  const mult = bonusVs[targetArmorType] ?? 1;
  const raw = attack * mult;
  return Math.max(raw - targetArmor, raw * MIN_DAMAGE_FRACTION);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/damage.test.ts`
Expected: PASS，8 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/damage.ts src/sim/damage.test.ts
git commit -m "feat(sim): add damage and armour resolution"
```

---

### Task 8: 目标搜索与锁定

**Files:**
- Create: `src/sim/targeting.ts`
- Test: `src/sim/targeting.test.ts`

**Interfaces:**
- Consumes: `data/constants`（`TARGET_ACQUIRE_RANGE`, `LOCK_BREAK_RANGE`, `TARGET_TOLERANCE`）、`sim/types`
- Produces:
  - `targetX(world: World, target: TargetRef): number | null`
  - `isTargetAlive(world: World, target: TargetRef): boolean`
  - `distanceToTarget(world: World, unit: Unit): number`
  - `shouldKeepTarget(world: World, unit: Unit): boolean`
  - `acquireTarget(world: World, unit: Unit): TargetRef`

**设计要点（Review Focus #3）：** 锁定必须有迟滞 —— 获取 500、脱离 700。若无迟滞，单位会在边界处每 tick 重选目标。

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/targeting.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { acquireTarget, shouldKeepTarget, distanceToTarget, targetX } from './targeting';
import { spawnUnit } from './spawn';
import { LOCK_BREAK_RANGE, TARGET_ACQUIRE_RANGE } from '../data/constants';
import type { Unit, World } from './types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0, rngState: 0, units, nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [], nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 }, popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0, nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing', levelId: 'test',
    worldWidth: 3000, difficultyMult: 1, endless: false,
  };
}

describe('acquireTarget', () => {
  it('finds the nearest enemy ahead', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const near = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const far = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 800 });
    const t = acquireTarget(makeWorld([me, near, far]), me);
    expect(t).toEqual({ kind: 'unit', id: 2 });
  });

  it('ignores enemies beyond the acquire range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const far = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 100 + TARGET_ACQUIRE_RANGE + 50 });
    expect(acquireTarget(makeWorld([me, far]), me)).toBeNull();
  });

  it('acquires an enemy exactly at the acquire range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 100 + TARGET_ACQUIRE_RANGE });
    expect(acquireTarget(makeWorld([me, e]), me)).toEqual({ kind: 'unit', id: 2 });
  });

  it('ignores allies', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const friend = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 120 });
    expect(acquireTarget(makeWorld([me, friend]), me)).toBeNull();
  });

  it('ignores dead units', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const dead = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 120 });
    dead.state = 'dead';
    expect(acquireTarget(makeWorld([me, dead]), me)).toBeNull();
  });

  it('prefers ahead over behind when both are in range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const ahead = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 560 });
    const behind = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 470 });
    expect(acquireTarget(makeWorld([me, ahead, behind]), me)).toEqual({ kind: 'unit', id: 2 });
  });

  it('falls back to the enemy base when no units are around', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    const t = acquireTarget(makeWorld([me]), me);
    expect(t).toEqual({ kind: 'base', side: 'enemy' });
  });

  it('does not target a base that is out of range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    expect(acquireTarget(makeWorld([me]), me)).toBeNull();
  });

  it('never targets its own base', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 310 });
    const t = acquireTarget(makeWorld([me]), me);
    expect(t === null || t.kind === 'base' && t.side === 'enemy').toBe(true);
  });
});

describe('shouldKeepTarget', () => {
  it('keeps a target inside the lock-break range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 500 + LOCK_BREAK_RANGE - 10 });
    me.target = { kind: 'unit', id: 2 };
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(true);
  });

  it('drops a target beyond the lock-break range', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 500 + LOCK_BREAK_RANGE + 10 });
    me.target = { kind: 'unit', id: 2 };
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(false);
  });

  it('has hysteresis: a target between acquire and lock-break is kept', () => {
    const mid = (TARGET_ACQUIRE_RANGE + LOCK_BREAK_RANGE) / 2;
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 500 + mid });
    me.target = { kind: 'unit', id: 2 };

    // Cannot be re-acquired from scratch at this distance...
    expect(acquireTarget(makeWorld([me, e]), me)).toBeNull();
    // ...but an existing lock survives it.
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(true);
  });

  it('drops a dead target', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    e.state = 'dead';
    me.target = { kind: 'unit', id: 2 };
    expect(shouldKeepTarget(makeWorld([me, e]), me)).toBe(false);
  });

  it('drops a target that no longer exists', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    me.target = { kind: 'unit', id: 999 };
    expect(shouldKeepTarget(makeWorld([me]), me)).toBe(false);
  });

  it('keeps a base target while it is alive', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    me.target = { kind: 'base', side: 'enemy' };
    expect(shouldKeepTarget(makeWorld([me]), me)).toBe(true);
  });

  it('drops a destroyed base target', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    me.target = { kind: 'base', side: 'enemy' };
    const world = makeWorld([me]);
    world.bases.enemy.hp = 0;
    expect(shouldKeepTarget(world, me)).toBe(false);
  });
});

describe('distanceToTarget', () => {
  it('measures to a unit', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 150 });
    me.target = { kind: 'unit', id: 2 };
    expect(distanceToTarget(makeWorld([me, e]), me)).toBeCloseTo(50, 10);
  });

  it('measures to a base', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600 });
    me.target = { kind: 'base', side: 'enemy' };
    expect(distanceToTarget(makeWorld([me]), me)).toBeCloseTo(100, 10);
  });

  it('returns Infinity for no target', () => {
    const me = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    expect(distanceToTarget(makeWorld([me]), me)).toBe(Infinity);
  });
});

describe('targetX', () => {
  it('resolves a unit position', () => {
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 777 });
    const world = makeWorld([e]);
    expect(targetX(world, { kind: 'unit', id: 2 })).toBe(777);
  });

  it('resolves a base position', () => {
    const world = makeWorld([]);
    expect(targetX(world, { kind: 'base', side: 'enemy' })).toBe(2700);
  });

  it('returns null for a missing unit', () => {
    expect(targetX(makeWorld([]), { kind: 'unit', id: 5 })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/targeting.test.ts`
Expected: FAIL，无法解析 `./targeting`。

- [ ] **Step 3: 写实现**

创建 `src/sim/targeting.ts`：

```ts
/**
 * Target search and locking (spec §6.4).
 *
 * Pure functions over the world — no mutation, so they are trivially testable
 * and safe to call from any system.
 *
 * The lock uses a HYSTERESIS BAND: acquire at 500px, drop at 700px. With a
 * single threshold a unit sitting at the boundary would re-acquire and drop
 * every tick, flickering between targets and never committing to a fight.
 */

import {
  LOCK_BREAK_RANGE,
  TARGET_ACQUIRE_RANGE,
  TARGET_TOLERANCE,
} from '../data/constants';
import type { Side, TargetRef, Unit, World } from './types';

/** A unit's forward direction: players face right, enemies face left. */
function forward(side: Side): number {
  return side === 'player' ? 1 : -1;
}

/** The X of a target, or null if it no longer exists. */
export function targetX(world: World, target: TargetRef): number | null {
  if (target === null) return null;
  if (target.kind === 'base') return world.bases[target.side].x;
  const unit = world.units.find((u) => u.id === target.id);
  return unit ? unit.x : null;
}

export function isTargetAlive(world: World, target: TargetRef): boolean {
  if (target === null) return false;
  if (target.kind === 'base') return world.bases[target.side].hp > 0;
  const unit = world.units.find((u) => u.id === target.id);
  return unit !== undefined && unit.state !== 'dead' && unit.hp > 0;
}

/** Distance from a unit to its locked target, or Infinity when it has none. */
export function distanceToTarget(world: World, unit: Unit): number {
  const x = targetX(world, unit.target);
  return x === null ? Infinity : Math.abs(x - unit.x);
}

/**
 * Whether the current lock survives this tick. False means the unit should
 * return to idle and search again.
 */
export function shouldKeepTarget(world: World, unit: Unit): boolean {
  if (unit.target === null) return false;
  if (!isTargetAlive(world, unit.target)) return false;
  return distanceToTarget(world, unit) <= LOCK_BREAK_RANGE;
}

/**
 * Picks a new target: the nearest enemy unit within TARGET_ACQUIRE_RANGE,
 * preferring anything ahead of the unit. Falls back to the enemy base when it
 * is in range. Returns null when nothing qualifies.
 */
export function acquireTarget(world: World, unit: Unit): TargetRef {
  const dir = forward(unit.side);
  let best: Unit | null = null;
  let bestScore = Infinity;

  for (const other of world.units) {
    if (other.side === unit.side) continue;
    if (other.state === 'dead' || other.hp <= 0) continue;

    const delta = (other.x - unit.x) * dir;
    // Ahead of us, with a small tolerance so units on the same X still engage.
    if (delta < -TARGET_TOLERANCE) continue;

    const dist = Math.abs(other.x - unit.x);
    if (dist > TARGET_ACQUIRE_RANGE) continue;

    // Prefer ahead over behind, then nearest. Ties broken by id for determinism.
    const score = (delta < 0 ? TARGET_ACQUIRE_RANGE : 0) + dist;
    if (score < bestScore || (score === bestScore && best !== null && other.id < best.id)) {
      best = other;
      bestScore = score;
    }
  }

  if (best !== null) return { kind: 'unit', id: best.id };

  const enemyBase: Side = unit.side === 'player' ? 'enemy' : 'player';
  const base = world.bases[enemyBase];
  if (base.hp > 0 && Math.abs(base.x - unit.x) <= TARGET_ACQUIRE_RANGE) {
    return { kind: 'base', side: enemyBase };
  }

  return null;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/targeting.test.ts`
Expected: PASS，20 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/targeting.ts src/sim/targeting.test.ts
git commit -m "feat(sim): add target acquisition with hysteresis lock"
```

---

### Task 9: 战斗系统

本任务是 Review Focus #1 的承接点，也是 `windupTime` 全部意义所在。

**Files:**
- Modify: `src/sim/systems/combat.ts`
- Test: `src/sim/systems/combat.test.ts`

**Interfaces:**
- Consumes: `sim/damage`、`sim/targeting`、`data/unitTicks`、`sim/types`
- Produces: `combatSystem(ctx: TickContext): void`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/systems/combat.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { combatSystem } from './combat';
import { spawnUnit } from '../spawn';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { TickContext, Unit, World } from '../types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0, rngState: 0, units, nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [], nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 }, popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0, nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing', levelId: 'test',
    worldWidth: 3000, difficultyMult: 1, endless: false,
  };
}

function ctx(world: World): TickContext {
  return { world, commands: [] };
}

/** A swordsman adjacent to an enemy, mid-attack with the given windup left. */
function duel(windupLeft = 0) {
  const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
  const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 525 });
  a.state = 'attack';
  a.target = { kind: 'unit', id: 2 };
  a.windupTicksLeft = windupLeft;
  return { a, b, world: makeWorld([a, b]) };
}

describe('combatSystem — melee', () => {
  it('does not damage while the windup is still running', () => {
    const { a, b, world } = duel(3);
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    expect(b.hp).toBe(hpBefore);
    expect(a.windupTicksLeft).toBe(2);
  });

  it('strikes on the tick the windup reaches zero', () => {
    const { b, world } = duel(1);
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    // swordsman 25 vs swordsman armour 5, no bonus -> 20
    expect(b.hp).toBe(hpBefore - 20);
  });

  it('starts the cooldown after striking', () => {
    const { a, world } = duel(1);
    combatSystem(ctx(world));
    expect(a.cooldownTicksLeft).toBe(UNIT_TICKS.swordsman.attackCooldown);
  });

  it('records damage in the attacker side stats', () => {
    const { world } = duel(1);
    combatSystem(ctx(world));
    expect(world.stats.player.damageDealt).toBe(20);
  });

  // Review Focus #1
  it('misses when the target left the attack range before the strike', () => {
    const { a, b, world } = duel(1);
    b.x = a.x + 999; // walked away during the windup
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    expect(b.hp).toBe(hpBefore);
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('does not re-open the windup after missing', () => {
    const { a, b, world } = duel(1);
    b.x = a.x + 999;
    combatSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(0);
    expect(a.cooldownTicksLeft).toBeGreaterThan(0);
  });

  it('misses when the target died during the windup', () => {
    const { a, b, world } = duel(1);
    b.state = 'dead';
    b.hp = 0;
    combatSystem(ctx(world));
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('never strikes a target on the same side', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const friend = spawnUnit({ id: 2, side: 'player', typeId: 'swordsman', x: 520 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    a.windupTicksLeft = 1;
    const world = makeWorld([a, friend]);
    combatSystem(ctx(world));
    expect(friend.hp).toBe(150);
  });

  it('applies the light-armour bonus against an archer', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const archer = spawnUnit({ id: 2, side: 'enemy', typeId: 'archer', x: 525 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    a.windupTicksLeft = 1;
    const world = makeWorld([a, archer]);
    combatSystem(ctx(world));
    // 25 x1.5 = 37.5, archer armour 0 -> 37.5
    expect(archer.hp).toBeCloseTo(80 - 37.5, 10);
  });

  it('damages the enemy base when that is the target', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2670 });
    a.state = 'attack';
    a.target = { kind: 'base', side: 'enemy' };
    a.windupTicksLeft = 1;
    const world = makeWorld([a]);
    combatSystem(ctx(world));
    // 25 - base armour 10 = 15
    expect(world.bases.enemy.hp).toBe(3000 - 15);
    expect(world.stats.player.damageDealt).toBe(15);
  });

  it('marks a unit dead when hp reaches zero', () => {
    const { a, b, world } = duel(1);
    b.hp = 5;
    combatSystem(ctx(world));
    expect(b.state).toBe('dead');
  });

  it('marks dead rather than removing — removal is cleanup\'s job', () => {
    const { a, b, world } = duel(1);
    b.hp = 5;
    combatSystem(ctx(world));
    expect(world.units).toHaveLength(2);
    void a;
  });

  it('does not let a dead unit strike', () => {
    const { a, b, world } = duel(1);
    a.state = 'dead';
    a.hp = 0;
    const hpBefore = b.hp;
    combatSystem(ctx(world));
    expect(b.hp).toBe(hpBefore);
  });

  it('ticks down the cooldown each call', () => {
    const { a, world } = duel(1);
    combatSystem(ctx(world));
    const after = a.cooldownTicksLeft;
    combatSystem(ctx(world));
    expect(a.cooldownTicksLeft).toBe(after - 1);
  });

  it('does not start a windup while on cooldown', () => {
    const { a, world } = duel(0);
    a.cooldownTicksLeft = 10;
    combatSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(0);
  });
});

describe('combatSystem — ranged', () => {
  it('spawns a projectile instead of dealing instant damage', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 650 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));

    expect(world.projectiles).toHaveLength(1);
    expect(target.hp).toBe(150); // nothing has landed yet
    expect(world.projectiles[0].ticksToImpact).toBeGreaterThan(0);
  });

  it('computes impact ticks from distance and projectile speed', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));
    // 200px at 400px/s = 0.5s = 15 ticks
    expect(world.projectiles[0].ticksToImpact).toBe(15);
  });

  it('lands the projectile and deals damage when the timer expires', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world)); // fires
    const hpBefore = target.hp;
    const ticks = world.projectiles[0].ticksToImpact;
    for (let i = 0; i < ticks; i++) combatSystem(ctx(world));

    // archer 18 vs swordsman armour 5 -> 13
    expect(target.hp).toBe(hpBefore - 13);
    expect(world.projectiles).toHaveLength(0);
  });

  // Review Focus #5
  it('drops a projectile whose target died in flight', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));
    target.state = 'dead';
    target.hp = 0;
    for (let i = 0; i < 40; i++) combatSystem(ctx(world));

    expect(world.projectiles).toHaveLength(0);
    expect(world.stats.player.damageDealt).toBe(0);
  });

  it('moves the projectile toward the target each tick', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 700 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);

    combatSystem(ctx(world));
    const x0 = world.projectiles[0].x;
    combatSystem(ctx(world));
    expect(world.projectiles[0].x).toBeGreaterThan(x0);
  });

  it('never produces a zero-tick projectile for a non-zero distance', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const target = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 501 });
    archer.state = 'attack';
    archer.target = { kind: 'unit', id: 2 };
    archer.windupTicksLeft = 1;
    const world = makeWorld([archer, target]);
    combatSystem(ctx(world));
    expect(world.projectiles[0].ticksToImpact).toBeGreaterThanOrEqual(1);
  });
});

describe('combatSystem — safety', () => {
  it('does nothing on an empty world', () => {
    expect(() => combatSystem(ctx(makeWorld([])))).not.toThrow();
  });

  it('does nothing for a unit with no target', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    a.state = 'attack';
    a.target = null;
    expect(() => combatSystem(ctx(makeWorld([a])))).not.toThrow();
  });

  it('does nothing for a miner', () => {
    const m = spawnUnit({ id: 1, side: 'player', typeId: 'miner', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 510 });
    m.state = 'attack';
    m.target = { kind: 'unit', id: 2 };
    m.windupTicksLeft = 1;
    const world = makeWorld([m, e]);
    combatSystem(ctx(world));
    expect(e.hp).toBe(150);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/combat.test.ts`
Expected: FAIL —— combatSystem 是空实现。

- [ ] **Step 3: 写实现**

替换 `src/sim/systems/combat.ts`：

```ts
/**
 * Step 5 of 6: wind-up progression, damage resolution, death marking.
 *
 * MUST run after movement (so range checks use this tick's positions) and
 * before cleanup (so a unit marked dead here does not strike again next tick,
 * and cleanup sees a stable array).
 *
 * Three windup rules (spec §6.3), all of which exist to make "retreat out of a
 * swing" a real tactic:
 *   1. a started windup always completes — it is never cancelled or restarted
 *   2. at release the range is re-checked; out of range means a MISS
 *   3. at release the target is never re-chosen; a vanished target means a MISS
 */

import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { computeDamage } from '../damage';
import { isTargetAlive, distanceToTarget, targetX } from '../targeting';
import type { ArmorType } from '../../data/units';
import type { Side, TickContext, Unit, World } from '../types';

/** Base armour values live with the base, not with a unit type. */
const BASE_ARMOR = 10;
const BASE_ARMOR_TYPE: ArmorType = 'heavy';

export function combatSystem(ctx: TickContext): void {
  const { world } = ctx;

  advanceProjectiles(world);

  for (const unit of world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    if (unit.cooldownTicksLeft > 0) {
      unit.cooldownTicksLeft -= 1;
    }

    if (unit.windupTicksLeft <= 0) continue;

    unit.windupTicksLeft -= 1;
    if (unit.windupTicksLeft > 0) continue;

    releaseStrike(world, unit);
  }
}

/** Moves projectiles and resolves impacts. A vanished target drops the shot. */
function advanceProjectiles(world: World): void {
  const surviving: typeof world.projectiles = [];

  for (const p of world.projectiles) {
    if (!isTargetAlive(world, { kind: 'unit', id: p.targetId })) continue;

    const targetPos = targetX(world, { kind: 'unit', id: p.targetId });
    if (targetPos === null) continue;

    p.ticksToImpact -= 1;

    if (p.ticksToImpact > 0) {
      p.prevX = p.x;
      // Fly toward the target's CURRENT position so a moving target is still
      // hit; the impact TICK is fixed at launch, only the visual path tracks.
      const step = Math.abs(targetPos - p.x);
      const remaining = p.ticksToImpact;
      p.x += step <= remaining ? (targetPos - p.x) : (targetPos - p.x) / (remaining + 1);
      surviving.push(p);
      continue;
    }

    p.prevX = p.x;
    p.x = targetPos;
    applyDamage(world, p.side, { kind: 'unit', id: p.targetId }, p.damage);
  }

  world.projectiles = surviving;
}

/** Resolves the strike at the end of a windup. */
function releaseStrike(world: World, unit: Unit): void {
  const def = UNITS[unit.typeId];
  if (def.attackType === 'none') return;

  const ticks = UNIT_TICKS[unit.typeId];

  // Rule 2 + 3: re-check range against the ORIGINAL target; never re-choose.
  if (!isTargetAlive(world, unit.target)) {
    unit.cooldownTicksLeft = ticks.attackCooldown;
    return;
  }

  const distance = distanceToTarget(world, unit);
  if (distance > def.attackRange) {
    // Missed: the target walked out of reach. Still consumes the cooldown.
    unit.cooldownTicksLeft = ticks.attackCooldown;
    return;
  }

  const targetArmor = armorOf(world, unit.target);
  const damage = computeDamage(
    def.attack,
    def.bonusVs,
    targetArmor.value,
    targetArmor.type,
  );

  if (def.attackType === 'melee') {
    applyDamage(world, unit.side, unit.target, damage);
  } else {
    spawnProjectile(world, unit, distance, damage);
  }

  unit.cooldownTicksLeft = ticks.attackCooldown;
}

function spawnProjectile(world: World, unit: Unit, distance: number, damage: number): void {
  const target = unit.target;
  if (target === null || target.kind !== 'unit') return;

  const speed = UNIT_TICKS[unit.typeId].projectilePerTick;
  // Never zero: a same-position shot must still take a tick, or the projectile
  // would resolve in the same tick it was created and break ordering.
  const ticksToImpact = speed > 0 ? Math.max(1, Math.round(distance / speed)) : 1;

  world.projectiles.push({
    id: world.nextProjectileId++,
    side: unit.side,
    x: unit.x,
    prevX: unit.x,
    targetId: target.id,
    damage,
    ticksToImpact,
  });
}

/** Applies damage to a unit or a base and records it in the side's stats. */
function applyDamage(world: World, attacker: Side, target: Unit['target'], amount: number): void {
  if (target === null) return;

  if (target.kind === 'base') {
    const base = world.bases[target.side];
    const applied = Math.min(amount, base.hp);
    base.hp -= applied;
    world.stats[attacker].damageDealt += applied;
    return;
  }

  const victim = world.units.find((u) => u.id === target.id);
  if (!victim || victim.state === 'dead') return;

  const applied = Math.min(amount, victim.hp);
  victim.hp -= applied;
  world.stats[attacker].damageDealt += applied;

  // Mark only — removal belongs to cleanup (two-phase death, spec §6.6).
  if (victim.hp <= 0) {
    victim.state = 'dead';
    victim.target = null;
    victim.windupTicksLeft = 0;
  }
}

function armorOf(world: World, target: Unit['target']): { value: number; type: ArmorType } {
  if (target !== null && target.kind === 'base') {
    return { value: BASE_ARMOR, type: BASE_ARMOR_TYPE };
  }
  if (target !== null && target.kind === 'unit') {
    const victim = world.units.find((u) => u.id === target.id);
    if (victim) {
      const def = UNITS[victim.typeId];
      return { value: def.armor, type: def.armorType };
    }
  }
  return { value: 0, type: 'light' };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/combat.test.ts`
Expected: PASS，24 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/systems/combat.ts src/sim/systems/combat.test.ts
git commit -m "feat(sim): implement combat with windup rules, projectiles, damage stats"
```

---

### Task 10: 运动与 AI 系统

**Files:**
- Modify: `src/sim/systems/movement.ts`
- Modify: `src/sim/systems/ai.ts`
- Test: `src/sim/systems/movement.test.ts`
- Test: `src/sim/systems/ai.test.ts`

**Interfaces:**
- Consumes: `sim/targeting`、`data/unitTicks`、`data/units`、`data/constants`
- Produces: `movementSystem(ctx)`、`aiSystem(ctx)`（签名不变）

- [ ] **Step 1: 写会失败的 AI 测试**

创建 `src/sim/systems/ai.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { aiSystem } from './ai';
import { spawnUnit } from '../spawn';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { TickContext, Unit, World } from '../types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0, rngState: 0, units, nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [], nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 }, popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0, nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing', levelId: 'test',
    worldWidth: 3000, difficultyMult: 1, endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });

describe('aiSystem', () => {
  it('acquires a target when idle and one is in range', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'unit', id: 2 });
  });

  it('enters attack when already within range', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('attack');
  });

  it('enters move when the target is out of range', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('move');
  });

  it('starts a windup once in attack range and off cooldown', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(UNIT_TICKS.swordsman.windup);
  });

  it('does not restart a windup that is already running', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    a.windupTicksLeft = 5;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(5);
  });

  it('does not start a windup while on cooldown', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.cooldownTicksLeft = 10;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.windupTicksLeft).toBe(0);
  });

  it('keeps an existing lock even when a closer enemy appears', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const locked = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const closer = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.target = { kind: 'unit', id: 2 };
    a.state = 'move';
    const world = makeWorld([a, locked, closer]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'unit', id: 2 });
  });

  it('drops a lock that exceeded the break range and re-acquires', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const fleeing = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 500 + 800 });
    const fresh = spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 560 });
    a.target = { kind: 'unit', id: 2 };
    a.state = 'move';
    const world = makeWorld([a, fleeing, fresh]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'unit', id: 3 });
  });

  it('sets stateEnteredTick when the state changes', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 600 });
    const world = makeWorld([a, e]);
    world.tick = 42;
    aiSystem(ctx(world));
    expect(a.state).toBe('move');
    expect(a.stateEnteredTick).toBe(42);
  });

  it('does not touch dead units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('dead');
  });

  it('does not touch stunned units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'stunned';
    a.stunTicksLeft = 5;
    const world = makeWorld([a, e]);
    aiSystem(ctx(world));
    expect(a.state).toBe('stunned');
    expect(a.stunTicksLeft).toBe(4);
  });

  it('returns to idle when no target can be found', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'hold' });
    a.state = 'move';
    a.target = null;
    const world = makeWorld([a]);
    aiSystem(ctx(world));
    expect(a.state).toBe('idle');
  });

  it('targets the enemy base under advance when no units remain', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600, stance: 'advance' });
    const world = makeWorld([a]);
    aiSystem(ctx(world));
    expect(a.target).toEqual({ kind: 'base', side: 'enemy' });
  });

  it('does not target the enemy base under retreat', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 2600, stance: 'retreat' });
    const world = makeWorld([a]);
    aiSystem(ctx(world));
    expect(a.target).toBeNull();
  });

  it('is deterministic across repeated calls on identical worlds', () => {
    const build = () => {
      const units = [
        spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 }),
        spawnUnit({ id: 2, side: 'enemy', typeId: 'archer', x: 640 }),
        spawnUnit({ id: 3, side: 'enemy', typeId: 'swordsman', x: 700 }),
      ];
      return makeWorld(units);
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 10; i++) {
      aiSystem(ctx(a));
      aiSystem(ctx(b));
    }
    expect(JSON.stringify(a.units.map((u) => u.target))).toBe(
      JSON.stringify(b.units.map((u) => u.target)),
    );
  });
});
```

- [ ] **Step 2: 写会失败的运动测试**

创建 `src/sim/systems/movement.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { movementSystem } from './movement';
import { spawnUnit } from '../spawn';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { TickContext, Unit, World } from '../types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0, rngState: 0, units, nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [], nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 }, popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0, nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing', levelId: 'test',
    worldWidth: 3000, difficultyMult: 1, endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });

describe('movementSystem', () => {
  it('records prevX before moving', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 900 });
    a.state = 'move';
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, e]);
    movementSystem(ctx(world));
    expect(a.prevX).toBe(500);
    expect(a.x).toBeGreaterThan(500);
  });

  it('moves an advancing unit toward the enemy', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 2000 });
    a.state = 'move';
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, e]);
    movementSystem(ctx(world));
    expect(a.x).toBeCloseTo(500 + UNIT_TICKS.swordsman.speedPerTick, 6);
  });

  it('moves an enemy toward the player (opposite direction)', () => {
    const p = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 2000, stance: 'advance' });
    e.state = 'move';
    e.target = { kind: 'unit', id: 1 };
    const world = makeWorld([p, e]);
    movementSystem(ctx(world));
    expect(e.x).toBeLessThan(2000);
  });

  it('does not move an attacking unit', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 520 });
    a.state = 'attack';
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, e]);
    movementSystem(ctx(world));
    expect(a.x).toBe(500);
  });

  it('stops an archer once it is within its own range', () => {
    const archer = spawnUnit({ id: 1, side: 'player', typeId: 'archer', x: 500 });
    const e = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 690 });
    archer.state = 'move';
    archer.target = { kind: 'unit', id: 2 };
    const world = makeWorld([archer, e]);
    movementSystem(ctx(world));
    // 190px away, archer range 200 -> already in range, should not advance
    expect(archer.x).toBe(500);
  });

  it('retreats toward its own base', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 1500, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    expect(a.x).toBeLessThan(1500);
  });

  it('stops retreating at the base edge', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 341, stance: 'retreat' });
    a.state = 'move';
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    // base at 300, radius 40 + unit 14 = 54 -> stops at 354
    expect(a.x).toBeGreaterThanOrEqual(354 - 0.5);
  });

  it('does not move a holding unit with no target', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'hold' });
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    expect(a.x).toBe(500);
  });

  it('does not move a dead unit', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a]);
    movementSystem(ctx(world));
    expect(a.x).toBe(500);
  });

  it('keeps every unit finite and inside the world', () => {
    const units = Array.from({ length: 30 }, (_, i) =>
      spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 500 + i * 2, stance: 'advance' }),
    );
    const world = makeWorld(units);
    for (let i = 0; i < 50; i++) movementSystem(ctx(world));
    for (const u of world.units) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(3000);
    }
  });

  it('never leaves allies overlapped after a move', () => {
    const units = Array.from({ length: 10 }, (_, i) =>
      spawnUnit({ id: i + 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' }),
    );
    const world = makeWorld(units);
    movementSystem(ctx(world));
    const sorted = world.units.slice().sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x - sorted[i - 1].x).toBeGreaterThanOrEqual(28 - 0.5);
    }
  });

  it('is deterministic for the same input', () => {
    const build = () =>
      makeWorld([
        spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 500, stance: 'advance' }),
        spawnUnit({ id: 2, side: 'player', typeId: 'archer', x: 520, stance: 'advance' }),
      ]);
    const a = build();
    const b = build();
    for (let i = 0; i < 20; i++) {
      movementSystem(ctx(a));
      movementSystem(ctx(b));
    }
    expect(a.units.map((u) => u.x.toFixed(6))).toEqual(b.units.map((u) => u.x.toFixed(6)));
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/ai.test.ts src/sim/systems/movement.test.ts`
Expected: FAIL —— 两个 system 都是空实现。

- [ ] **Step 4: 写 `ai.ts`**

替换 `src/sim/systems/ai.ts`：

```ts
/**
 * Step 3 of 6: per-unit target selection and state transitions.
 *
 * Runs BEFORE movement so movement can use this tick's decisions. The tactical
 * layer (choosing what to build, when to push) lives in commands.ts and is
 * driven by the same Command type the player uses — the AI literally presses
 * the player's buttons (spec §9.1).
 */

import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { acquireTarget, distanceToTarget, shouldKeepTarget } from '../targeting';
import type { TickContext, Unit } from '../types';

export function aiSystem(ctx: TickContext): void {
  for (const unit of ctx.world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    if (unit.state === 'stunned') {
      if (unit.stunTicksLeft > 0) unit.stunTicksLeft -= 1;
      if (unit.stunTicksLeft === 0) transition(ctx, unit, 'idle');
      continue;
    }

    // A retreating unit never seeks new targets; it keeps what it has so it can
    // fight back while withdrawing (spec §6.3).
    const keep = shouldKeepTarget(ctx.world, unit);
    if (!keep) {
      unit.target = unit.stance === 'retreat' ? null : acquireTarget(ctx.world, unit);
    }

    decideState(ctx, unit);
  }
}

function decideState(ctx: TickContext, unit: Unit): void {
  const def = UNITS[unit.typeId];

  if (unit.target === null) {
    if (unit.state !== 'move') transition(ctx, unit, 'idle');
    return;
  }

  const distance = distanceToTarget(ctx.world, unit);
  const inRange = distance <= def.attackRange;

  if (def.attackType === 'none') {
    // A unit that cannot attack never enters the attack state.
    transition(ctx, unit, 'move');
    return;
  }

  if (!inRange) {
    transition(ctx, unit, 'move');
    return;
  }

  transition(ctx, unit, 'attack');

  // Start a windup only when idle in the attack state: an in-flight windup is
  // never restarted (spec §6.3 rule 1).
  if (unit.windupTicksLeft === 0 && unit.cooldownTicksLeft === 0) {
    unit.windupTicksLeft = UNIT_TICKS[unit.typeId].windup;
  }
}

/** Sets the state and stamps the tick, so the renderer can derive animation phase. */
function transition(ctx: TickContext, unit: Unit, state: Unit['state']): void {
  if (unit.state === state) return;
  unit.state = state;
  unit.stateEnteredTick = ctx.world.tick;
}
```

- [ ] **Step 5: 写 `movement.ts`**

替换 `src/sim/systems/movement.ts`：

```ts
/**
 * Step 4 of 6: position integration, then the separation constraint.
 *
 * MUST run before combat, or every range check uses last tick's positions and
 * melee engagements are systematically off by one tick (spec §6.1).
 *
 * Internal order is fixed (spec §6.2):
 *   1. record prevX
 *   2. integrate by stance/target
 *   3. same-side separation
 *   4. enemy blocking
 *   5. clamp to [0, worldWidth]
 *
 * Separation runs after integration so that pushing cannot be undone by
 * movement in the same tick.
 */

import { BASE_RADIUS } from '../../data/constants';
import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { distanceToTarget, targetX } from '../targeting';
import { separationSystem } from './separation';
import type { TickContext, Unit } from '../types';

export function movementSystem(ctx: TickContext): void {
  for (const unit of ctx.world.units) {
    unit.prevX = unit.x;
  }

  for (const unit of ctx.world.units) {
    integrate(ctx, unit);
  }

  separationSystem(ctx);
}

function integrate(ctx: TickContext, unit: Unit): void {
  if (unit.state === 'dead' || unit.state === 'stunned' || unit.state === 'gather') return;

  const def = UNITS[unit.typeId];
  const speed = UNIT_TICKS[unit.typeId].speedPerTick;
  const dir = unit.side === 'player' ? 1 : -1;

  switch (unit.stance) {
    case 'retreat':
      integrateRetreat(ctx, unit, speed, dir);
      return;
    case 'hold':
      integrateHold(ctx, unit, def.attackRange);
      return;
    case 'advance':
      integrateAdvance(ctx, unit, speed, dir, def.attackRange);
      return;
  }
}

/** Falls back toward the player's own base, stopping just outside it. */
function integrateRetreat(ctx: TickContext, unit: Unit, speed: number, dir: number): void {
  if (unit.state === 'attack') return; // still swings while withdrawing

  const base = ctx.world.bases[unit.side];
  const stopX = base.x - dir * (BASE_RADIUS + UNITS[unit.typeId].bodyRadius);
  const delta = stopX - unit.x;
  if (Math.abs(delta) < 1e-9) return;
  // Never overshoot the stop line.
  unit.x += Math.sign(delta) * Math.min(speed, Math.abs(delta));
}

/** Stays put. May still attack whatever comes into range (handled by aiSystem). */
function integrateHold(ctx: TickContext, unit: Unit, attackRange: number): void {
  if (unit.state !== 'attack') return;
  // Attackers hold position; the AI decides whether they are in range.
  void ctx;
  void attackRange;
}

function integrateAdvance(
  ctx: TickContext,
  unit: Unit,
  speed: number,
  dir: number,
  attackRange: number,
): void {
  if (unit.state === 'attack') return; // planted while swinging

  const targetXPos = targetX(ctx.world, unit.target);
  if (targetXPos === null) {
    // No target: keep walking toward the enemy side so the lines eventually meet.
    unit.x += dir * speed;
    return;
  }

  const distance = distanceToTarget(ctx.world, unit);
  // Ranged units stop at their own range; melee closes to contact.
  if (distance <= attackRange) return;

  const step = Math.min(speed, distance - attackRange);
  unit.x += Math.sign(targetXPos - unit.x) * step;
}
```

> **注意**：`integrateHold` 的 `void ctx; void attackRange;` 是为了避免未使用参数报错。若 lint 报错，把参数名改为 `_ctx` / `_attackRange`（ESLint 已配置认 `_` 前缀）。

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/ai.test.ts src/sim/systems/movement.test.ts`
Expected: PASS，27 passed。

- [ ] **Step 7: 提交**

```bash
git add src/sim/systems/ai.ts src/sim/systems/movement.ts src/sim/systems/ai.test.ts src/sim/systems/movement.test.ts
git commit -m "feat(sim): implement AI state machine and stance-driven movement"
```

---

### Task 11: 清理与胜负判定

**Files:**
- Modify: `src/sim/systems/cleanup.ts`
- Test: `src/sim/systems/cleanup.test.ts`

**Interfaces:**
- Consumes: `sim/types`
- Produces: `cleanupSystem(ctx: TickContext): void`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/systems/cleanup.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { cleanupSystem } from './cleanup';
import { spawnUnit } from '../spawn';
import type { TickContext, Unit, World } from '../types';

function makeWorld(units: Unit[]): World {
  return {
    tick: 0, rngState: 0, units, nextUnitId: 999,
    bases: {
      player: { side: 'player', x: 300, hp: 3000, maxHp: 3000 },
      enemy: { side: 'enemy', x: 2700, hp: 3000, maxHp: 3000 },
    },
    mines: {
      player: { side: 'player', x: 50, goldLeft: 0 },
      enemy: { side: 'enemy', x: 2950, goldLeft: 0 },
    },
    projectiles: [], nextProjectileId: 1,
    gold: { player: 0, enemy: 0 },
    popUsed: { player: 0, enemy: 0 }, popCap: { player: 60, enemy: 60 },
    trainingQueue: { player: [], enemy: [] },
    stats: { player: { damageDealt: 0 }, enemy: { damageDealt: 0 } },
    waveIndex: 0, nextWaveTick: Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing', levelId: 'test',
    worldWidth: 3000, difficultyMult: 1, endless: false,
  };
}

const ctx = (world: World): TickContext => ({ world, commands: [] });

describe('cleanupSystem — removal', () => {
  it('removes units marked dead', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    a.state = 'dead';
    a.hp = 0;
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(0);
  });

  it('keeps living units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(1);
  });

  it('removes units whose hp reached zero even if state was not set', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    a.hp = 0;
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(0);
  });

  it('removes several dead units at once', () => {
    const units = [1, 2, 3].map((id) => {
      const u = spawnUnit({ id, side: 'player', typeId: 'swordsman', x: 100 * id });
      u.state = 'dead';
      u.hp = 0;
      return u;
    });
    const world = makeWorld(units);
    cleanupSystem(ctx(world));
    expect(world.units).toHaveLength(0);
  });

  it('clears a dead unit from any other unit\'s target reference', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 130 });
    b.state = 'dead';
    b.hp = 0;
    a.target = { kind: 'unit', id: 2 };
    const world = makeWorld([a, b]);
    cleanupSystem(ctx(world));
    expect(a.target).toBeNull();
  });
});

describe('cleanupSystem — outcome', () => {
  it('declares a player win when the enemy base falls', () => {
    const world = makeWorld([]);
    world.bases.enemy.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('declares a player loss when the player base falls', () => {
    const world = makeWorld([]);
    world.bases.player.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  // Review Focus #4
  it('resolves both bases falling at once as a player loss', () => {
    const world = makeWorld([]);
    world.bases.player.hp = 0;
    world.bases.enemy.hp = 0;
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  it('declares a win when the enemy has no units left', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const world = makeWorld([a]);
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('declares a loss when the player has no units left', () => {
    const e = spawnUnit({ id: 1, side: 'enemy', typeId: 'swordsman', x: 100 });
    const world = makeWorld([e]);
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerLose');
  });

  it('does not declare anything when both sides still have units', () => {
    const a = spawnUnit({ id: 1, side: 'player', typeId: 'swordsman', x: 100 });
    const b = spawnUnit({ id: 2, side: 'enemy', typeId: 'swordsman', x: 200 });
    const world = makeWorld([a, b]);
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('ongoing');
  });

  it('does not re-decide an already-decided outcome', () => {
    const world = makeWorld([]);
    world.outcome = 'playerWin';
    cleanupSystem(ctx(world));
    expect(world.outcome).toBe('playerWin');
  });

  it('does not throw on a completely empty world', () => {
    const world = makeWorld([]);
    expect(() => cleanupSystem(ctx(world))).not.toThrow();
    // Both sides empty is a mutual wipe -> loss for the player.
    expect(world.outcome).toBe('playerLose');
  });

  it('removes spent projectiles', () => {
    const world = makeWorld([]);
    world.projectiles.push({
      id: 1, side: 'player', x: 10, prevX: 10, targetId: 99, damage: 1, ticksToImpact: 0,
    });
    cleanupSystem(ctx(world));
    expect(world.projectiles).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/systems/cleanup.test.ts`
Expected: FAIL —— cleanupSystem 是空实现。

- [ ] **Step 3: 写实现**

替换 `src/sim/systems/cleanup.ts`：

```ts
/**
 * Step 6 of 6: remove the dead, then resolve the outcome.
 *
 * Runs LAST so that step 5 saw a stable array and a unit marked dead this tick
 * could not strike again (spec §6.1). Death is two-phase: combat marks, cleanup
 * removes (spec §6.6).
 */

import type { TickContext, Unit, World } from '../types';

export function cleanupSystem(ctx: TickContext): void {
  const { world } = ctx;

  removeDead(world);
  removeStaleProjectiles(world);
  resolveOutcome(world);
}

function removeDead(world: World): void {
  const survivors: Unit[] = [];
  for (const unit of world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    survivors.push(unit);
  }

  if (survivors.length === world.units.length) return;

  world.units = survivors;

  // Any surviving unit that was locked onto a removed unit must drop the lock,
  // or targeting would keep resolving against a unit that no longer exists.
  const alive = new Set(survivors.map((u) => u.id));
  for (const unit of survivors) {
    if (unit.target !== null && unit.target.kind === 'unit' && !alive.has(unit.target.id)) {
      unit.target = null;
    }
  }
}

function removeStaleProjectiles(world: World): void {
  if (world.projectiles.length === 0) return;
  world.projectiles = world.projectiles.filter((p) => p.ticksToImpact > 0);
}

/**
 * Two win conditions (spec §6.6):
 *   1. a base falls
 *   2. a side has no units left — this is what lets the base-less harness
 *      matchups reach a verdict instead of running to maxTicks
 *
 * When both conditions fire on the same tick the player loses: an ambiguous
 * mutual wipe is resolved against the player so the outcome is never
 * undefined.
 */
function resolveOutcome(world: World): void {
  if (world.outcome !== 'ongoing') return;

  const enemyBaseDown = world.bases.enemy.hp <= 0;
  const playerBaseDown = world.bases.player.hp <= 0;

  const playerUnits = world.units.filter((u) => u.side === 'player').length;
  const enemyUnits = world.units.filter((u) => u.side === 'enemy').length;

  const playerWiped = playerUnits === 0;
  const enemyWiped = enemyUnits === 0;

  if (playerBaseDown || playerWiped) {
    world.outcome = 'playerLose';
    return;
  }

  if (enemyBaseDown || enemyWiped) {
    world.outcome = 'playerWin';
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/systems/cleanup.test.ts`
Expected: PASS，15 passed。

- [ ] **Step 5: 提交**

```bash
git add src/sim/systems/cleanup.ts src/sim/systems/cleanup.test.ts
git commit -m "feat(sim): implement cleanup with removal and two-condition outcome"
```

---

### Task 12: 平衡 harness

M2 的核心交付物。spec §9.3 的接口在此落地。

**Files:**
- Create: `src/sim/harness.ts`
- Create: `src/sim/harness.test.ts`

**Interfaces:**
- Consumes: `sim/createWorld`、`sim/tick`、`sim/hash`、`data/levels`
- Produces:
  - `Scenario`、`ScenarioResult` 接口
  - `runScenario(scenario: Scenario, seed: number, maxTicks?: number): ScenarioResult`
  - `DEFAULT_MAX_TICKS = 6000`

- [ ] **Step 1: 写会失败的测试**

创建 `src/sim/harness.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { runScenario, DEFAULT_MAX_TICKS, type Scenario } from './harness';

/** Same gold budget on both sides, so a win means efficiency, not budget. */
const SWORDSMAN_COST = 100;
const ARCHER_COST = 80;
const SPEARMAN_COST = 90;

const mirror: Scenario = {
  name: 'mirror swordsmen',
  player: { swordsman: 10 },
  enemy: { swordsman: 10 },
};

describe('runScenario', () => {
  it('runs a mirror match to a verdict', () => {
    const r = runScenario(mirror, 1);
    expect(['player', 'enemy', 'draw']).toContain(r.winner);
    expect(r.ticks).toBeGreaterThan(0);
    expect(r.ticks).toBeLessThanOrEqual(DEFAULT_MAX_TICKS);
  });

  it('is reproducible: same seed, same result', () => {
    const a = runScenario(mirror, 42);
    const b = runScenario(mirror, 42);
    expect(a.hash).toBe(b.hash);
    expect(a.winner).toBe(b.winner);
    expect(a.ticks).toBe(b.ticks);
  });

  it('reports survivors per side', () => {
    const r = runScenario(mirror, 7);
    expect(r.survivors).toHaveProperty('player');
    expect(r.survivors).toHaveProperty('enemy');
  });

  it('reports damage dealt per side', () => {
    const r = runScenario(mirror, 7);
    expect(r.damageDealt.player).toBeGreaterThan(0);
    expect(r.damageDealt.enemy).toBeGreaterThan(0);
  });

  it('finishes quickly enough for batch runs', () => {
    const start = process.hrtime.bigint();
    runScenario(mirror, 3);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // spec S5: a full match under 500ms. Generous ceiling for CI noise.
    expect(ms).toBeLessThan(2000);
  });

  it('handles an empty roster without throwing', () => {
    const r = runScenario({ name: 'empty', player: {}, enemy: {} }, 1);
    expect(['player', 'enemy', 'draw']).toContain(r.winner);
  });

  it('respects maxTicks', () => {
    const r = runScenario(mirror, 1, 10);
    expect(r.ticks).toBeLessThanOrEqual(11);
  });
});

describe('balance matrix', () => {
  const scenarios: Scenario[] = [
    // 1. Same-gold unit matchups
    {
      name: 'swordsman x10 vs archer x12 (1000 vs 960 gold)',
      player: { swordsman: 10 },
      enemy: { archer: 12 },
    },
    {
      name: 'spearman x11 vs swordsman x10 (990 vs 1000 gold)',
      player: { spearman: 11 },
      enemy: { swordsman: 10 },
    },
    {
      name: 'archer x10 vs spearman x9 (800 vs 810 gold)',
      player: { archer: 10 },
      enemy: { spearman: 9 },
    },

    // 2. Archer WITH front-line cover — the only way to validate R1/R2
    {
      name: 'swordsman x5 + archer x6 vs swordsman x10 (980 vs 1000 gold)',
      player: { swordsman: 5, archer: 6 },
      enemy: { swordsman: 10 },
      spacing: 30,
    },

    // 3. Archer WITHOUT cover — the control case; archers should lose badly
    {
      name: 'archer x12 vs swordsman x10 (960 vs 1000 gold)',
      player: { archer: 12 },
      enemy: { swordsman: 10 },
    },
  ];

  it('produces a full matrix without throwing', () => {
    const rows = scenarios.map((s) => {
      const r = runScenario(s, 20260926);
      return {
        scenario: r.name,
        winner: r.winner,
        ticks: r.ticks,
        playerLeft: r.survivors.player,
        enemyLeft: r.survivors.enemy,
        playerDmg: Math.round(r.damageDealt.player),
        enemyDmg: Math.round(r.damageDealt.enemy),
      };
    });

    // eslint-disable-next-line no-console
    console.table(rows);

    expect(rows).toHaveLength(scenarios.length);
    for (const row of rows) {
      expect(row.ticks).toBeGreaterThan(0);
    }
  });

  it('lets a covered archer line outperform an uncovered one', () => {
    const covered = runScenario(scenarios[3], 20260926);
    const uncovered = runScenario(scenarios[4], 20260926);

    // The covered group spends about the same gold but should survive longer
    // and deal more damage. This is the R1/R2 validation.
    expect(covered.damageDealt.player).toBeGreaterThan(uncovered.damageDealt.player);
  });

  it('leaves no units overlapped at the end of any scenario', () => {
    for (const s of scenarios) {
      const r = runScenario(s, 5);
      expect(r.finalOverlapViolations).toBe(0);
    }
  });
});
```

> **注**：`ScenarioResult` 需要一个 `finalOverlapViolations` 字段来支撑「无单位重叠」这条验收。在 Step 3 中实现。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- src/sim/harness.test.ts`
Expected: FAIL，无法解析 `./harness`。

- [ ] **Step 3: 写实现**

创建 `src/sim/harness.ts`：

```ts
/**
 * Headless balance harness (spec §9.3).
 *
 * Runs a complete match with no rendering, as fast as the CPU allows, and
 * reports who won and at what cost. This is the payoff for the pure-sim
 * architecture: tuning a unit used to mean minutes of manual play; it now
 * means a few hundred milliseconds of batch runs with reproducible results.
 *
 * Pure function — no I/O, no Phaser, no clock. Safe to call from tests, and
 * from a Node CLI in M5 when tuning the endless-mode difficulty curve.
 */

import { DEFAULT_MATCH } from '../data/levels';
import { UNITS, type UnitTypeId } from '../data/units';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import type { MatchConfig, Side } from './types';

/** Generous ceiling: 6000 ticks is 3.3 minutes of game time. */
export const DEFAULT_MAX_TICKS = 6000;

/** How far apart allies are placed, in px. Lets a scenario build tight formations. */
const DEFAULT_SPACING = 40;

export interface Scenario {
  name: string;
  player: Partial<Record<UnitTypeId, number>>;
  enemy: Partial<Record<UnitTypeId, number>>;
  /** Gap between same-side units at spawn. Default 40. */
  spacing?: number;
  /** Whether to include bases. Default true. */
  withBases?: boolean;
}

export interface ScenarioResult {
  name: string;
  winner: 'player' | 'enemy' | 'draw';
  ticks: number;
  survivors: Record<Side, number>;
  damageDealt: Record<Side, number>;
  /** Number of same-side adjacent pairs closer than the sum of their radii. */
  finalOverlapViolations: number;
  hash: string;
}

export function runScenario(
  scenario: Scenario,
  seed: number,
  maxTicks: number = DEFAULT_MAX_TICKS,
): ScenarioResult {
  const config = buildConfig(scenario);
  const world = createWorld(config, seed);

  let ticks = 0;
  while (world.outcome === 'ongoing' && ticks < maxTicks) {
    step(world, []);
    ticks += 1;
  }

  const survivors: Record<Side, number> = {
    player: world.units.filter((u) => u.side === 'player').length,
    enemy: world.units.filter((u) => u.side === 'enemy').length,
  };

  return {
    name: scenario.name,
    winner: toWinner(world.outcome),
    ticks,
    survivors,
    damageDealt: {
      player: world.stats.player.damageDealt,
      enemy: world.stats.enemy.damageDealt,
    },
    finalOverlapViolations: countOverlaps(world.units),
    hash: hashWorld(world),
  };
}

function toWinner(outcome: string): 'player' | 'enemy' | 'draw' {
  if (outcome === 'playerWin') return 'player';
  if (outcome === 'playerLose') return 'enemy';
  return 'draw';
}

/** Expands a roster into an explicit list of unit ids, melee first so archers spawn behind. */
function expandRoster(roster: Partial<Record<UnitTypeId, number>>): UnitTypeId[] {
  const order: UnitTypeId[] = ['swordsman', 'spearman', 'miner', 'archer'];
  const out: UnitTypeId[] = [];
  for (const typeId of order) {
    const count = roster[typeId] ?? 0;
    for (let i = 0; i < count; i++) out.push(typeId);
  }
  return out;
}

function buildConfig(scenario: Scenario): MatchConfig {
  const playerUnits = expandRoster(scenario.player);
  const enemyUnits = expandRoster(scenario.enemy);

  return {
    ...DEFAULT_MATCH,
    levelId: `harness:${scenario.name}`,
    startMiners: { player: 0, enemy: 0 },
    initialUnits: { player: playerUnits, enemy: enemyUnits },
    initialSpacing: scenario.spacing ?? DEFAULT_SPACING,
    // Bases stay alive even when the scenario does not want them. Setting hp
    // to 0 would trip cleanupSystem's "base fell" condition on tick 1 and end
    // every base-less matchup instantly. Instead createWorld parks them
    // outside the battlefield, where no unit can reach them (see below).
    noBases: scenario.withBases === false,
    difficultyMult: 1,
  };
}

/** Counts same-side adjacent pairs that are closer than the sum of their radii. */
function countOverlaps(units: { side: Side; x: number; typeId: UnitTypeId }[]): number {
  let violations = 0;
  for (const side of ['player', 'enemy'] as const) {
    const sorted = units
      .filter((u) => u.side === side)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const minGap = UNITS[sorted[i - 1].typeId].bodyRadius + UNITS[sorted[i].typeId].bodyRadius;
      if (sorted[i].x - sorted[i - 1].x < minGap - 0.5) violations += 1;
    }
  }
  return violations;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- src/sim/harness.test.ts`
Expected: PASS，10 passed，并打印对撞矩阵表格。

- [ ] **Step 5: 查看矩阵输出**

Run: `npm test -- src/sim/harness.test.ts 2>&1 | Select-String -Pattern "swordsman|archer|spearman|winner"`

**记录输出**。这是 M2 交给数值平衡的第一份数据。重点观察：
- 弓箭手带掩护 vs 不带掩护的伤害差（R1/R2 是否生效）
- 矛兵 vs 剑士（spec §8.3 预警的「爆矛兵」问题）

- [ ] **Step 6: 提交**

```bash
git add src/sim/harness.ts src/sim/harness.test.ts
git commit -m "feat(sim): add headless balance harness with collision matrix"
```

---

### Task 13: 渲染层接线（动画 / 幽灵 / 弹丸 / 对撞演示）

**Files:**
- Modify: `src/render/stickman/poses.ts`
- Modify: `src/render/stickman/skeleton.ts`
- Create: `src/render/ghost.ts`
- Create: `src/render/projectile.ts`
- Modify: `src/render/scenes/BattleScene.ts`
- Modify: `src/data/levels.ts`

**Interfaces:**
- Consumes: 全部 sim
- Produces:
  - `POSE_KEYFRAMES: Record<UnitState, Keyframe[]>`
  - `poseFor(state, phase): Pose`（现在真的用 phase）
  - `createGhost(scene, x, y, typeId, groundY): Ghost`
  - `createProjectileLayer(scene): ProjectileLayer`
  - `RENDER_DEMO_MATCH` 改为对撞演示

- [ ] **Step 1: 写关键帧动画**

替换 `src/render/stickman/poses.ts`：

```ts
import type { UnitState } from '../../sim/types';

/** Joint angles in radians. 0 points down (+Y); positive rotates clockwise on screen. */
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
 * The attack set is the important one: its second keyframe is the blade-contact
 * moment and must line up with the damage tick. `poseFor` is called with
 * phase = windupTicks / totalTicks at the moment of the strike, so the middle
 * keyframe at 0.5 is only correct when windup is half the attack cycle. The
 * renderer passes the windup fraction directly, and CONTACT_PHASE below is
 * where the sword is at its lowest.
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
    { atPhase: 0, pose: { ...IDLE_POSE, legFront: 0.5, legBack: -0.5, armFront: -0.5, armBack: 0.4 } },
    { atPhase: 0.25, pose: { ...IDLE_POSE, legFront: 0, legBack: 0, armFront: -0.25, armBack: 0.25 } },
    { atPhase: 0.5, pose: { ...IDLE_POSE, legFront: -0.5, legBack: 0.5, armFront: 0.4, armBack: -0.5 } },
    { atPhase: 0.75, pose: { ...IDLE_POSE, legFront: 0, legBack: 0, armFront: -0.25, armBack: 0.25 } },
    { atPhase: 1, pose: { ...IDLE_POSE, legFront: 0.5, legBack: -0.5, armFront: -0.5, armBack: 0.4 } },
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

  dead: [{ atPhase: 0, pose: { ...IDLE_POSE, torso: 1.2, armFront: 0.8, armBack: 0.8, legFront: 0.4 } }],
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
```

- [ ] **Step 2: 加朝向翻转**

在 `src/render/stickman/skeleton.ts` 的 `createStickman` 返回值中，给 `Stickman` 接口加一个 `setFacing`：

```ts
export interface Stickman {
  container: Phaser.GameObjects.Container;
  apply(state: UnitState, phase: number): void;
  /** +1 faces right, -1 faces left. Applied as a horizontal scale flip. */
  setFacing(dir: 1 | -1): void;
  destroy(): void;
}
```

在返回对象里实现：

```ts
    setFacing(dir: 1 | -1): void {
      container.setScale(dir, 1);
    },
```

- [ ] **Step 3: 写死亡幽灵**

创建 `src/render/ghost.ts`：

```ts
import Phaser from 'phaser';
import { createStickman, STICKMAN_HIP_HEIGHT, type Stickman } from './stickman/skeleton';
import type { UnitTypeId } from '../data/units';

/** How long the death animation plays, in ms. */
const GHOST_LIFETIME_MS = 400;

/**
 * A death animation that lives entirely in the render layer.
 *
 * The sim removes a dead unit on the same tick it dies (spec §6.6), so the
 * renderer cannot animate the real unit. Instead syncStickmen notices the
 * disappearance and spawns one of these at the last known position, using the
 * palette it was already rendering with.
 */
export function spawnGhost(
  scene: Phaser.Scene,
  x: number,
  groundY: number,
  typeId: UnitTypeId,
  facing: 1 | -1,
): void {
  const stickman: Stickman = createStickman(scene, typeId);
  stickman.setFacing(facing);
  stickman.container.setPosition(x, groundY - STICKMAN_HIP_HEIGHT);
  stickman.container.setDepth(-1);
  stickman.apply('dead', 0);

  scene.tweens.add({
    targets: stickman.container,
    alpha: 0,
    y: stickman.container.y + 6,
    duration: GHOST_LIFETIME_MS,
    ease: 'Quad.easeOut',
    onComplete: () => stickman.destroy(),
  });
}
```

- [ ] **Step 4: 写弹丸绘制层**

创建 `src/render/projectile.ts`：

```ts
import Phaser from 'phaser';
import type { Projectile } from '../sim/types';

const ARROW_COLOR = 0xd8dde3;
const ARROW_LENGTH = 10;

/** Vertical offset from the ground line at which arrows fly. */
export const ARROW_HEIGHT_ABOVE_GROUND = 40;

export interface ProjectileLayer {
  /** Redraws every arrow. Called once per render frame with the current alpha. */
  sync(projectiles: Projectile[], alpha: number): void;
  /** Re-anchors the layer after a viewport resize. */
  setGroundY(groundY: number): void;
}

/**
 * Draws arrows as short line segments.
 *
 * Without a visible arrow a player cannot understand why their archer appears
 * to be shooting while nothing takes damage — the shot is in flight. The
 * projectile's position is interpolated exactly like a unit's.
 */
export function createProjectileLayer(scene: Phaser.Scene): ProjectileLayer {
  const graphics = scene.add.graphics();
  graphics.setDepth(5);

  return {
    setGroundY(groundY: number): void {
      graphics.setY(groundY - ARROW_HEIGHT_ABOVE_GROUND);
    },

    sync(projectiles: Projectile[], alpha: number): void {
      graphics.clear();
      graphics.lineStyle(2, ARROW_COLOR, 1);

      for (const p of projectiles) {
        const x = p.prevX + (p.x - p.prevX) * alpha;
        const dir = p.side === 'player' ? 1 : -1;
        graphics.lineBetween(x - dir * ARROW_LENGTH, 0, x + dir * ARROW_LENGTH, 0);
      }
    },
  };
}
```

> 弹丸的 Y 由 `setGroundY` 一次性设定（`graphics.setY`），而不是每次 `lineBetween` 都传 y 坐标 —— 所有箭矢在同一高度飞行，没必要重复传参。

- [ ] **Step 5: 改演示配置为对撞**

修改 `src/data/levels.ts`：

```ts
/**
 * TEMPORARY (M2): a symmetric collision demo so the render pipeline can be
 * watched. Both sides advance and meet in the middle. M4 replaces this with
 * level-driven spawns.
 */
export const RENDER_DEMO_MATCH: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'render-demo',
  startMiners: { player: 0, enemy: 0 },
  initialUnits: {
    // Archers spawn behind the swordsmen so R1/R2 (arrows pass through allies,
    // front ranks do not block the back) can be seen working.
    player: ['swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman',
             'archer', 'archer', 'archer'],
    enemy: ['swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman',
            'archer', 'archer', 'archer'],
  },
};

/** TEMPORARY (M2): fixed seed for the render demo, so screenshots are repeatable. */
export const RENDER_DEMO_SEED = 20260926;
```

- [ ] **Step 6: 接线到 BattleScene**

在 `src/render/scenes/BattleScene.ts` 中：

顶部 import 追加：

```ts
import { spawnGhost } from '../ghost';
import { createProjectileLayer, type ProjectileLayer } from '../projectile';
import { UNITS } from '../../data/units';
```

类字段追加：

```ts
  private projectiles!: ProjectileLayer;
  private previousUnitIds = new Set<number>();
```

在 `create()` 里，`this.groundLine = this.add.graphics();` 之后追加：

```ts
    this.projectiles = createProjectileLayer(this);
```

在 `layout()` 末尾追加弹丸层的位置更新（视口改变时箭矢高度要跟着走）：

```ts
    this.projectiles.setGroundY(this.groundY);
```

在 `create()` 末尾加 R 键重置：

```ts
    this.input.keyboard?.on('keydown-R', () => {
      this.scene.restart();
    });
```

替换 `syncStickmen`，加入幽灵检测、朝向与相位：

```ts
  /** Creates or removes stickmen so the view matches the sim's unit list exactly. */
  private syncStickmen(): void {
    const alive = new Set<number>();

    for (const unit of this.world.units) {
      alive.add(unit.id);
      let stickman = this.stickmen.get(unit.id);
      if (!stickman) {
        stickman = createStickman(this, unit.typeId);
        this.stickmen.set(unit.id, stickman);
      }

      const x = unit.prevX + (unit.x - unit.prevX) * this.timestep.alpha;
      stickman.container.setPosition(x, this.groundY - STICKMAN_HIP_HEIGHT);
      stickman.setFacing(unit.side === 'player' ? 1 : -1);
      stickman.apply(unit.state, this.phaseOf(unit));
    }

    // Anything that vanished died this tick: animate a ghost at its last spot.
    for (const [id, stickman] of this.stickmen) {
      if (alive.has(id)) continue;
      const ghostX = stickman.container.x;
      stickman.destroy();
      this.stickmen.delete(id);

      const typeId = this.lastTypeId.get(id);
      if (typeId) {
        spawnGhost(this, ghostX, this.groundY, typeId, this.lastFacing.get(id) ?? 1);
      }
    }

    this.rememberTypes();
  }
```

新增两个辅助字段与两个方法：

```ts
  private lastTypeId = new Map<number, import('../../data/units').UnitTypeId>();
  private lastFacing = new Map<number, 1 | -1>();

  /** Remembers what each unit looked like, so a ghost can be spawned after removal. */
  private rememberTypes(): void {
    for (const unit of this.world.units) {
      this.lastTypeId.set(unit.id, unit.typeId);
      this.lastFacing.set(unit.id, unit.side === 'player' ? 1 : -1);
    }
  }

  /**
   * Animation phase for a unit, 0..1.
   *
   * For `attack` this is windup progress, NOT time in state, so the contact
   * keyframe lands on the same tick the damage is applied (spec §7.1).
   */
  private phaseOf(unit: import('../../sim/types').Unit): number {
    if (unit.state === 'attack') {
      const total = UNIT_TICKS[unit.typeId].windup;
      if (total <= 0) return 0;
      return 1 - unit.windupTicksLeft / total;
    }
    const cycle = STATE_CYCLE_TICKS[unit.state] ?? 30;
    return ((this.world.tick - unit.stateEnteredTick) % cycle) / cycle;
  }
```

在文件顶部常量区加上：

```ts
import { UNIT_TICKS } from '../../data/unitTicks';

/** Loop length per state, in ticks, for the states that cycle. */
const STATE_CYCLE_TICKS: Partial<Record<import('../../sim/types').UnitState, number>> = {
  idle: 60,
  move: 24,
  gather: 30,
};
```

并在 `update()` 里同步弹丸：

```ts
    this.syncStickmen();
    this.projectiles.sync(this.world.projectiles, this.timestep.alpha);
```

- [ ] **Step 7: 验证渲染**

Run: `npm run dev`
Expected: 浏览器打开后看到：
- 左右两群火柴人（各 6 剑士 + 3 弓箭手）从两端出发，向中间推进
- 相遇后前排停下挥砍，后排跟上（**R2 生效**：不会挤成一排）
- 弓箭手在后方射箭，**箭矢穿过己方剑士**（**R1 生效**）
- 被击杀的单位倒地淡出（幽灵动画）
- 按 `R` 可重置对局，且每次结果一致

- [ ] **Step 8: 验证确定性（肉眼 + 数据）**

按 `R` 重置三次，观察每次战斗结果（哪边赢、剩几个）是否完全相同。
Expected: 完全一致。若不一致，说明 sim 里混入了非确定性来源。

- [ ] **Step 9: 提交**

```bash
git add src/render/ src/data/levels.ts
git commit -m "feat(render): keyframe animation, ghosts, arrows, collision demo"
```

---

### Task 14: M2 验收

**Files:**
- Create: `src/sim/acceptance.test.ts`

**Interfaces:**
- Consumes: `sim/harness`
- Produces: 三条硬指标的自动化断言

- [ ] **Step 1: 写验收测试**

创建 `src/sim/acceptance.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { runScenario } from './harness';
import { createWorld } from './createWorld';
import { hashWorld } from './hash';
import { step } from './tick';
import { DEFAULT_MATCH } from '../data/levels';
import type { Scenario } from './harness';

/**
 * spec §11 M2 acceptance, as executable criteria.
 *
 * Deliberately does NOT assert who wins. Which side wins is a BALANCE
 * question — that is what the harness matrix is for. M2 only has to prove the
 * mechanics are correct and reproducible.
 */

const clash: Scenario = {
  name: 'acceptance clash',
  player: { swordsman: 6, archer: 3 },
  enemy: { swordsman: 6, archer: 3 },
};

describe('M2 acceptance 1: units engage automatically', () => {
  it('produces first blood within 400 ticks from a 600px gap', () => {
    const config = {
      ...DEFAULT_MATCH,
      startMiners: { player: 0, enemy: 0 },
      initialUnits: {
        player: ['swordsman', 'swordsman'] as const,
        enemy: ['swordsman', 'swordsman'] as const,
      },
    };
    const world = createWorld(config, 1);

    // Pull the sides 600px apart, then let them advance.
    world.units.forEach((u, i) => {
      u.stance = 'advance';
      if (u.side === 'player') u.x = 1000 + i * 30;
      else u.x = 1600 + i * 30;
      u.prevX = u.x;
    });

    let firstBloodTick = -1;
    for (let t = 0; t < 400 && world.outcome === 'ongoing'; t++) {
      step(world, []);
      if (world.stats.player.damageDealt + world.stats.enemy.damageDealt > 0) {
        firstBloodTick = t;
        break;
      }
    }

    expect(firstBloodTick).toBeGreaterThanOrEqual(0);
    expect(firstBloodTick).toBeLessThan(400);
  });
});

describe('M2 acceptance 2: fights finish cleanly', () => {
  it('reaches a verdict within 6000 ticks', () => {
    const r = runScenario(clash, 20260926);
    expect(r.ticks).toBeLessThanOrEqual(6000);
    expect(['player', 'enemy']).toContain(r.winner);
  });

  it('leaves no allies overlapped', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runScenario(clash, seed);
      expect(r.finalOverlapViolations, `seed ${seed}`).toBe(0);
    }
  });
});

describe('M2 acceptance 3: results are reproducible', () => {
  it('produces byte-identical hashes for the same seed', () => {
    const a = runScenario(clash, 424242);
    const b = runScenario(clash, 424242);
    expect(a.hash).toBe(b.hash);
    expect(a.ticks).toBe(b.ticks);
    expect(a.survivors).toEqual(b.survivors);
    expect(a.damageDealt).toEqual(b.damageDealt);
  });

  it('produces different hashes for different seeds', () => {
    // Not guaranteed in principle, but with 9 units a collision would signal
    // that the seed is not actually reaching the simulation.
    const a = runScenario(clash, 1);
    const b = runScenario(clash, 999999);
    expect(a.hash).not.toBe(b.hash);
  });

  it('is stable across many consecutive runs', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 5; i++) hashes.add(runScenario(clash, 77).hash);
    expect(hashes.size).toBe(1);
  });
});
```

- [ ] **Step 2: 运行验收测试**

Run: `npm test -- src/sim/acceptance.test.ts`
Expected: PASS，7 passed。

> **若「engages automatically」失败**：检查 `movementSystem` 的 `advance` 分支是否在无目标时仍前进（代码里是 `unit.x += dir * speed`）。若单位为 `hold` 则不会主动接敌 —— 测试已把姿态设为 `advance`。

- [ ] **Step 3: 运行全部检查**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add src/sim/acceptance.test.ts
git commit -m "test(sim): add M2 acceptance criteria as executable assertions"
```

---

## M2 验收

全部任务完成后，逐条确认 spec §11 的三条硬指标：

| # | 验收标准 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | 自动接战 ≤ 400 tick | `npm test -- src/sim/acceptance.test.ts` | ☐ |
| 2 | ≤ 6000 tick 出胜负 且 无单位重叠 | 同上 + harness 矩阵的 `finalOverlapViolations` | ☐ |
| 3 | 同种子哈希逐字节相同 | 同上 | ☐ |

另外**必须肉眼确认**（spec 工作方式：验收必须实测）：

| # | 目视项 | 怎么确认 | 结果 |
|---|---|---|---|
| 4 | 两军对撞能自动打完 | `npm run dev`，观察战斗分出胜负 | ☐ |
| 5 | **R2 生效**：后排能贴上前排，战线有纵深 | 观察剑士是否排成多排而非单排 | ☐ |
| 6 | **R1 生效**：箭矢穿过己方剑士 | 观察后方弓箭手是否真的造成伤害 | ☐ |
| 7 | 攻击动画的刀刃接触帧与掉血同步 | 放慢观察（或截图逐帧比对） | ☐ |
| 8 | 死亡幽灵动画播放 | 观察被击杀单位是否倒地淡出 | ☐ |
| 9 | 按 R 重置后结果一致 | 连按三次 R，对比战果 | ☐ |

第 5、6 两条是**整个 M2 里最容易被"测试全绿"掩盖的失效模式** —— 单测覆盖了每个函数，但 R1/R2 是**跨系统的涌现行为**，只有肉眼看得见。

---

## 后续计划

- **M3 经济与指令** —— 金矿、矿工采集循环、HUD、造兵队列、姿态指令、相机
- **M4 AI 与关卡** —— 两层 AI 战术层、波次系统、关卡 1/2、胜负界面
- **M5 打磨** —— 无尽模式、i18n、存档、速度控制、战线指示器、音效、部署

**M2 结束后的第一件事**应该是读 harness 的对撞矩阵输出，看 spec §8.3 预警的「爆矛兵」问题是否真的存在。如果存在，数值调整集中在 `data/units.ts`，改完重跑 harness 即可 —— 这正是 M2 先于 M3 的价值。
