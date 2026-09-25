# AGENTS.md

本文件是供 AI 编码助手快速重建上下文的锚点。**开始任何工作前先读这里，再读 spec。**

## 项目

浏览器端的单机 2D 即时战略游戏，机制致敬《火柴人战争：遗产》。纯静态站点，无后端。
玩家经营金矿 → 征募火柴人 → 在一条横向战线上与 AI 交战 → 摧毁敌方基地。

## 权威文档

| 文档 | 路径 | 作用 |
|---|---|---|
| **设计规格** | `docs/superpowers/specs/2026-09-25-stick-war-web-design.md` | 做什么、为什么。所有决策的唯一真相来源（含 40 条决策记录） |
| **实施计划** | `docs/superpowers/plans/` | 怎么做，逐任务 TDD 步骤 |

**冲突时以 spec 为准。** 修改设计必须先改 spec 并重新评审，不要在代码里偷偷偏离。

## 技术栈（锁定版本，勿擅自升级）

- Phaser **4.2.1**（不是 Phaser 3 —— Phaser 3 已实质停止演进）
- Vite **^6.3.1** / TypeScript **^5.7.2** / Vitest **^3**
- 包管理器 **npm**（环境未装 pnpm）
- `phaser` 自带 TS 类型，**不要**装 `@types/phaser`

## 架构铁律

1. **`src/sim/**` 禁止 import `phaser`**（也禁止 import `render/`、`input/`、`i18n/`）。由 ESLint `no-restricted-imports` 强制。sim 是纯逻辑核心，Phaser 只做渲染与输入。
2. **sim 内禁止非确定性来源**：`Math.random()`、`Date.now()`、`performance.now()` 一律不可用。随机性只用 `sim/rng.ts` 的种子 PRNG。
3. **所有计时器必须是整数 tick**（30 Hz）。数据表写秒，加载时 `Math.round(s * 30)` 转换一次。浮点累积会破坏确定性。
4. **渲染层只读 sim 状态，从不写回。** 选中状态属于渲染层，不进 sim。
5. **tick 内六步顺序固定不可换**：经济 → 指令 → AI → 运动 → 战斗 → 清理。
   - 运动必须先于战斗（否则射程判定差一 tick）
   - 伤害结算必须先于清理（否则尸体补刀）
6. **死亡必须两阶段**：步骤 5 标记 `state='dead'`，步骤 6 才从数组移除。

## 目录速查

```
src/data/     纯数据：units.ts（兵种表）、levels.ts（关卡）、constants.ts
src/sim/      纯逻辑核心（禁 phaser）
  tick.ts         六步编排器
  systems/        economy / commands / ai / movement / separation / combat / cleanup
src/input/    指令适配器（键鼠 → Command）
src/render/   Phaser 场景、火柴人骨骼、HUD、相机
src/i18n/     中文文案表（代码英文，UI 中文）
```

## 常用命令

```bash
npm run dev      # 开发服务器
npm test         # Vitest（逻辑核心单测）
npm run build    # 生产构建
npm run lint     # ESLint（含 sim 边界检查）
```

## 关键设计要点（容易忘的）

- **战场是纯单轴的**：所有单位 Y 固定，只在 X 移动。没有寻路，只有一维排序-分离约束。
- **不做框选，不做点地移动**：控制方式是姿态制（推进/驻守/撤退）+ 全军按钮。
- **弹丸穿过友军**（R1）：否则弓箭手站在剑士身后打不到任何东西。
- **交战不阻断后排**（R2）：否则战线退化成单排，弓箭手永远暴露。
- **弓箭手 1v1 打不过任何近战**，它的价值只在有前排掩护时体现。这不是 bug，是设计。
- **玩家与 AI 共用战术层接口**：AI 本质上是替玩家按按钮，天然公平。
- **状态机预留了 `stunned`**，v1 无人产生它，但它是后续控制类效果的挂载点，不要删。
- **`windupTicksLeft` 是打击感的核心**：它是画面刀刃接触与音效播放的共同同步点。
- **Vite `base` 必须是 `/stick-war-web/`**，否则 GitHub Pages 资源 404。

## 当前状态

- [x] 设计访谈完成（40 条决策，见 spec §13）
- [x] 设计规格已写入 `docs/superpowers/specs/` 并通过评审
- [x] 实施计划写入 `docs/superpowers/plans/2026-09-25-m1-skeleton.md`
- [x] **M1 骨架**（分支 `m1-skeleton`，worktree 位于 `.worktrees/m1-skeleton`）
- [ ] M2 移动与战斗
- [ ] M3 经济与指令
- [ ] M4 AI 与关卡
- [ ] M5 打磨

## M1 遗留事项（M2 开工前处理）

1. **单位时长仍是秒，尚未转 tick**。`data/units.ts` 的 `attackCooldown: 1.0` 等字段必须经 `toTicks()` 转换后才能存进 `cooldownTicksLeft`，否则游戏会快 30 倍。转换点应放在 `createWorld`（spec §5.1 要求「只转换一次」）。
2. **`RENDER_DEMO_MATCH` / `RENDER_DEMO_SEED` 是临时配置**，位于 `data/levels.ts`，M2 应删除并改由关卡数据驱动出生。
3. **分离约束的排序比较器必须是全序**：`x` 相同时用 `unit.id` 决胜。`Array.prototype.sort` 的稳定性不是可依赖的正确性来源。
4. **`World` 的确定性哈希**目前用 `JSON.stringify`，它依赖对象键插入顺序。M2 引入 `separation`/`combat` 后应换成真正的状态哈希。
5. **`tick.test.ts` 的确定性测试目前近乎同义反复**（system 全是空实现）。M2 填充逻辑后它才会真正生效。

## 工作方式

- 实现前先确认 spec 已评审通过，且实施计划已存在。
- 每个里程碑独立验收，验收标准是客观的（能跑 / 能打赢 / 哈希一致），不接受「感觉差不多了」。
- 数值改动集中在 `src/data/`，靠 M2 的 headless harness 验证，不靠手动玩。
- **验收必须实测，不能靠推断。** M1 的插值缺陷就是靠浏览器里逐帧计数抓出来的（`syncStickmen` 调用 120 次 / 120 帧，而修复前只会调用 20 次）。
- **Phaser 4 陷阱的 ESLint 规则必须用 `no-restricted-syntax`**：`no-restricted-properties` 只匹配裸标识符对象，抓不到 `Phaser.Math.TAU`（真正的陷阱），只能抓到 JS 里本就是 `undefined` 的 `Math.TAU`。
