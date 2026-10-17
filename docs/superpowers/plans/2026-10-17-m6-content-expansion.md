# M6 实施计划：内容扩展（2026-10-17）

> 设计访谈已完成（5 轮，决策树见 §A）。本文件是 M6 的实施计划，逐子任务 TDD 落地。
> **范围锁定**：本轮交付**巨人 + 法师 + 关卡 3 + 控制技能**四块内容。
> 按 B4「低风险先」分三个子任务：
> - **M6.1** 关卡 3（纯数据，零 sim 结构改）
> - **M6.2** 巨人（`giant`，物理单位，进 §6.5 矩阵加行）
> - **M6.3** 法师 + 控制技能（`mage`，ranged + 命中附 1s 眩晕，命中效果挂 `UnitDef` 纯数据字段）
>
> **回归锚点**（A3/D4）：沿用现有 4 守卫 + 本计划新增的可通关断言：
> 1. `level-1-regression.test.ts`（单位状态指纹，5 种子×5 检查点）
> 2. `level-winnable.test.ts`（参考玩家 5 种子）
> 3. `counter-relations.test.ts`（10 场景×6 种子，M6.2 加巨人行）
> 4. 关卡 2 的 276s 时长断言
>
> 新增：`level-3-winnable.test.ts`（关卡 3 可通关，参考玩家 5 种子）

---

## A. 已定决策（设计访谈 Q1–Q5）

### 全局

| # | 决策 | 结论 |
|---|---|---|
| A1 | 扩展哪一块 | 新兵种 + 新关卡 + 控制技能，**三块独立交付**（4th 兵种不指定为控制单位） |
| A2 | 交付策略 | 逐块 grilling + TDD + 独立验收（与 M4a/M4b 同形） |
| A3 | 回归锚点 | 沿用现有 4 守卫，全绿即无回归 |

### M6.1 关卡 3

| # | 决策 | 结论 |
|---|---|---|
| B3 | 关卡 3 定位 | **战役第 3 关**（接在关卡 2 后、无尽前），可通关（参考玩家 5 种子全绿） |
| C4 | 关卡 3 形状 | **对称经济关**（`winCondition: 'base'` + 双方经济 + `enemyProfile: 'level-3'`），档案比 level-2 更激进 |
| D3 | 档案定值 | **扫 `minerTarget × decisionIntervalTicks` 网格 + 参考玩家 5 种子全赢 + 时长 3~6 分钟**，扫完才定（同 M4b 方法论，不预设） |
| E4 | 时长窗 | 沿用关卡 2 的 3~6 分钟（270s 中心） |

### M6.2 巨人

| # | 决策 | 结论 |
|---|---|---|
| B2 | 角色 | **补相克角**（矩阵补全），`counter-relations` 加新行不改旧行 |
| C1 | 定位 | **重甲慢速高血炮台**（高 HP + 重甲 + 慢速 + 近距高伤，需要包围/集火才能敲开） |
| D1 | 数值起点 | `maxHp 500` · `armor 12 heavy` · `bodyRadius 22` · `moveSpeed 55` · `attack 60` · `attackRange 30` · `attackCooldown 1.8s` · `windupTime 0.5s` · `goldCost 400` · `popCost 3` · `trainTime 15s` · `bonusVs: {}`（**扫描起点**，不保证终值） |
| C2 | 矩阵 | `counter-relations.test.ts` **加新行**（巨人 vs 剑/弓/矛），旧 10 场景不动 |
| E2 | 大半径代价 | `bodyRadius 22` = 44px 间距（普通 24~28px），**接受**为「占线墙」，`counter-relations` 巨人行专门验「卡线」行为 |

### M6.3 法师 + 控制

| # | 决策 | 结论 |
|---|---|---|
| C3 | 载体 | **新增第 5 兵种「法师」**（`mage`，ranged + 命中附 1s 眩晕） |
| D2 | 数值起点 | `maxHp 60` · `armor 0 light` · `moveSpeed 70` · `attack 22` · `ranged` · `attackRange 150` · `attackCooldown 2.0s` · `windupTime 0.4s` · `projectileSpeed 300` · `goldCost 150` · `popCost 1` · `trainTime 10s` · **命中附 `stunTicksLeft=30`**（1s 眩晕）· `bonusVs: {}` |
| E1 | 命中效果挂载 | **`UnitDef` 加纯数据字段**（`stunOnHitTicks: number`，默认 0；法师=30），`combat.applyDamage` 读它赋值 `victim.stunTicksLeft`。**新增的是 `UnitDef`（表）字段，不是 `Unit`（世界）字段 → 不进 `hashWorld`，零回归锚点风险**（效果本身写进已哈希的 `stunTicksLeft`） |
| E3 | 眩晕交互 | 被眩晕者**完全冻结**（不移动、不出招、不响应姿态），`yieldWeight` 已按 BUSY 0.5 处理，分离照常把它当障碍物推 |
| C2 延伸 | 矩阵 | 法师**不加物理行**（控制单位不参与 §6.5 物理相克；若需加行请在确认时说） |

### 里程碑

| # | 决策 | 结论 |
|---|---|---|
| E5 | 命名与粒度 | **M6 单计划 3 子任务**（M6.1 关卡 3 → M6.2 巨人 → M6.3 法师+控制），按 B4 低风险先 |
| D4 | 验收门槛 | 4 守卫 + 新增 `level-3-winnable.test.ts`（参考玩家 5 种子） |

---

## B. 文件布局

### M6.1 关卡 3

```
src/data/types.ts              UnitTypeId 不变；AiProfileId 加 'level-3'
src/data/levels.ts             LEVEL_3 加入 LEVELS（数组顺序：1/2/3/无尽）
src/sim/ai-profile.ts          LEVEL_3_ENEMY 档案 + AI_PROFILES 注册表加 'level-3'
src/sim/level-3-winnable.test.ts (新)   参考玩家 5 种子可通关断言
```

### M6.2 巨人

```
src/data/units.ts              UnitTypeId 加 'giant'；UNITS 加 giant 条目
src/i18n/zh-CN.ts              unit.giant 键（中文文案）
src/sim/counter-relations.test.ts  加巨人行（vs 剑/弓/矛）
```

### M6.3 法师 + 控制

```
src/data/units.ts              UnitTypeId 加 'mage'；UNITS 加 mage 条目；UnitDef 加 stunOnHitTicks 字段
src/i18n/zh-CN.ts              unit.mage 键（中文文案）
src/sim/systems/combat.ts      applyDamage 读 UNITS[typeId].stunOnHitTicks，命中时赋 victim.stunTicksLeft
src/sim/systems/ai.ts          已有 stunned 分支（stunTicksLeft 递减 + 归零转 idle），无需改
src/sim/counter-relations.test.ts  （可选）法师 vs 剑兵 1v1 断言（参照 B5 判别固化形状）
```

### 共享（所有子任务）

```
src/sim/hash.ts                **不改**（stunOnHitTicks 是 UnitDef 字段，不是 Unit 字段）
src/sim/level-1-regression.test.ts  不动（关卡 1 波次不含新单位）
src/sim/level-winnable.test.ts  不动（关卡 1/2 可通关性不受影响）
```

---

## C. 数值起点（扫描起点，不保证终值）

### giant（M6.2）

```ts
giant: {
  id: 'giant',
  nameKey: 'unit.giant',
  maxHp: 500,          // 高血炮台，需要包围/集火
  armor: 12,
  armorType: 'heavy',
  bodyRadius: 22,      // 大半径=占线墙（44px 间距 vs 普通 24~28px）
  moveSpeed: 55,       // 慢速
  attack: 60,          // 近距高伤
  attackType: 'melee',
  attackRange: 30,
  attackCooldown: 1.8,
  windupTime: 0.5,
  projectileSpeed: 0,
  bonusVs: {},         // 无兵种克制
  goldCost: 400,
  popCost: 3,
  trainTime: 15,
  carryCapacity: 0,
  gatherTime: 0,
}
```

### mage（M6.3）

```ts
mage: {
  id: 'mage',
  nameKey: 'unit.mage',
  maxHp: 60,
  armor: 0,
  armorType: 'light',
  bodyRadius: 11,
  moveSpeed: 70,
  attack: 22,
  attackType: 'ranged',
  attackRange: 150,
  attackCooldown: 2.0,
  windupTime: 0.4,
  projectileSpeed: 300,
  bonusVs: {},
  goldCost: 150,
  popCost: 1,
  trainTime: 10,
  carryCapacity: 0,
  gatherTime: 0,
  stunOnHitTicks: 30,  // 命中附 1s 眩晕（E1：UnitDef 纯数据字段，不进哈希）
}
```

---

## D. 命中效果机制（M6.3）

### `UnitDef.stunOnHitTicks`

```ts
export interface UnitDef {
  // ... 现有字段 ...
  /** M6.3: 命中时给目标附眩晕 tick 数。默认 0（无效果）；法师 = 30（1s）。 */
  stunOnHitTicks?: number;
}
```

### `combat.applyDamage` 修改

```ts
function applyDamage(world: World, attacker: Side, target: TargetRef, amount: number): void {
  // ... 现有逻辑 ...
  if (target.kind === 'unit') {
    const victim = world.units.find((u) => u.id === target.id);
    if (!victim || victim.state === 'dead') return;

    const applied = Math.min(amount, victim.hp);
    victim.hp -= applied;
    world.stats[attacker].damageDealt += applied;

    // M6.3: 命中附眩晕（E1：读 UnitDef 纯数据字段，写已哈希的 stunTicksLeft）
    const attackerDef = UNITS[/* 攻击者 typeId */];
    if (attackerDef.stunOnHitTicks && attackerDef.stunOnHitTicks > 0) {
      victim.stunTicksLeft = attackerDef.stunOnHitTicks;
      // 若 victim 不在 stunned 状态，转入 stunned
      if (victim.state !== 'dead' && victim.state !== 'stunned') {
        victim.state = 'stunned';
      }
    }

    if (victim.hp <= 0) {
      victim.state = 'dead';
      victim.target = null;
    }
  }
}
```

> **注意**：`applyDamage` 当前签名只传 `attacker: Side`，不传攻击者 `Unit`。
> 需要把攻击者的 `typeId` 传进去（改签名为 `applyDamage(world, attackerDef, target, amount)`
> 或加一个 `attackerTypeId: UnitTypeId` 参数），才能读到 `stunOnHitTicks`。
> 这是 `combat.ts` 内部的小改动，不影响 `hashWorld`（`stunOnHitTicks` 是表字段）。

### `ai.ts` 的 stunned 分支（已有，无需改）

```ts
// src/sim/systems/ai.ts:20-22
if (unit.state === 'stunned') {
  if (unit.stunTicksLeft > 0) unit.stunTicksLeft -= 1;
  if (unit.stunTicksLeft === 0) transition(ctx, unit, 'idle');
}
```

### `movement.ts` 的 stunned 早退（已有，无需改）

```ts
// src/sim/systems/movement.ts:39
if (unit.state === 'dead' || unit.state === 'stunned' || unit.state === 'gather') return;
```

---

## E. 任务分解（逐任务 TDD）

### M6.1 关卡 3（低风险，纯数据）

- **T6.1.1** `data/types.ts`：`AiProfileId` 加 `'level-3'`。
- **T6.1.2** `data/levels.ts`：`LEVEL_3` 加入 `LEVELS`（数组顺序：1/2/3/无尽）。
- **T6.1.3** `sim/ai-profile.ts`：`LEVEL_3_ENEMY` 档案 + `AI_PROFILES` 注册表加 `'level-3'`。
  - **扫描**：`minerTarget × decisionIntervalTicks` 网格（同 M4b 方法论），参考玩家 5 种子全赢 + 时长 3~6 分钟，扫完定值。
- **T6.1.4** `sim/level-3-winnable.test.ts`（新）：参考玩家 5 种子可通关断言。
- **T6.1.5** 全量 `tsc` / `lint` / `vitest` / `build` 全绿。

### M6.2 巨人（物理单位，进矩阵加行）

- **T6.2.1** `data/units.ts`：`UnitTypeId` 加 `'giant'`；`UNITS` 加 `giant` 条目（§C 数值）。
- **T6.2.2** `i18n/zh-CN.ts`：`unit.giant` 键（中文文案，如「巨人」）。
- **T6.2.3** `sim/counter-relations.test.ts`：加巨人行（巨人 vs 剑/弓/矛，参照 B5 判别固化形状）。
  - **扫描**：跑 `counter-relations` 巨人行，漂移就调 §C 数值。
- **T6.2.4** 全量 `tsc` / `lint` / `vitest` / `build` 全绿（4 守卫 + 巨人行全绿）。

### M6.3 法师 + 控制（命中效果挂 UnitDef）

- **T6.3.1** `data/units.ts`：`UnitTypeId` 加 `'mage'`；`UnitDef` 加 `stunOnHitTicks?: number`；`UNITS` 加 `mage` 条目（§C 数值，`stunOnHitTicks: 30`）。
- **T6.3.2** `i18n/zh-CN.ts`：`unit.mage` 键（中文文案，如「法师」）。
- **T6.3.3** `sim/systems/combat.ts`：`applyDamage` 读 `UNITS[typeId].stunOnHitTicks`，命中时赋 `victim.stunTicksLeft`（§D 机制）。
- **T6.3.4**（可选）`sim/counter-relations.test.ts`：法师 vs 剑兵 1v1 断言（参照 B5 判别固化形状）。
- **T6.3.5** 全量 `tsc` / `lint` / `vitest` / `build` 全绿（4 守卫 + 巨人行 + 法师断言全绿）。

---

## F. 验收标准（客观）

- **M6.1**：关卡 3 参考玩家 5 种子全赢 + 时长 3~6 分钟（扫描定值）+ 全量测试/tsc/lint/build 全绿。
- **M6.2**：巨人进 `UNITS` + `i18n` + `counter-relations` 加行（vs 剑/弓/矛）全绿 + 4 守卫全绿 + 全量测试/tsc/lint/build 全绿。
- **M6.3**：法师进 `UNITS` + `UnitDef.stunOnHitTicks` + `combat.applyDamage` 命中附眩晕 + `i18n` + （可选）法师 vs 剑兵 1v1 断言 + 4 守卫全绿 + 全量测试/tsc/lint/build 全绿。
- **回归**：不碰 `hashWorld`（`stunOnHitTicks` 是 `UnitDef` 字段，不是 `Unit` 字段），关卡 1 指纹 / 关卡 2 276s / `counter-relations` 旧 10 场景全绿。

---

## 尚未验证的假设（落地前需实测）

1. **巨人数值（§C）** 是扫描起点，不是终值——M6.2 TDD 时跑 `counter-relations` 巨人行，漂移就调。
2. **法师 1s 眩晕是否「过强/过弱」**——M6.3 TDD 时跑「法师 vs 剑兵 1v1」断言（参照 B5 判别固化形状）。
3. **关卡 3 档案（D3/E4）**——M6.1 TDD 时扫网格定值，不预设。
