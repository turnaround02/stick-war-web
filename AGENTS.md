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
- [x] **M1 骨架**（已合并至 `master`）
- [x] **M2 移动与战斗**（已合并，215 tests）
- [x] **M3 经济与指令**（分支 `m3-economy`，16 commits，**420 tests**）
- [ ] **M4 AI 与关卡**
- [ ] M5 打磨

## M3 已交付

`src/sim/` 的最后两个空壳 system 现在有真实逻辑，渲染层有了完整的可玩界面：

- `economy` — 矿工往返（`TargetRef` 新增 `mine` 变体）、采集计时、入账、人口重算
- `commands` — `train` 与 `setStance`，`side` 强制校验（玩家与 AI 共用指令类型）
- `training`（新）— 串行队列、下单扣金/出生占人口、出生位置外推搜索
- `ai` — 矿工三段优先级（有敌+撤退→逃；有敌→继续挖；无敌→挖）
- `movement` — 矿工按「点」导航（矿点 / 基地前沿），撤退停在基地**前沿**
- `render/` — 相机（滚动+缩放，钳制含 origin 偏移）、HUD（资源/指令/速度）、
  选中、`i18n`、`input/` 适配器、`advanceWorld` 帧驱动

## M4 开工前必须处理

1. **敌方无经济**：`RENDER_DEMO_MATCH` 用 `initialUnits` 给定敌方阵容，敌方矿工不采集、也不会造兵。M4 的两层 AI 战术层要接上。
2. **关卡系统未实现**：`MatchConfig.waves` / `waveIndex` / `nextWaveTick` 无人消费，`enemyAi: 'scripted'` 分支是空的。
3. **速度控制的暂停无按钮**：spec §7.3 列了暂停按钮，M3 只做了 Space 键（`ui.pause` / `ui.resume` 文案已就绪但未被引用）。
4. **战线指示器未做**：spec §7.3 称之为「唯一的全局态势来源」。
5. **`hash.ts` 现在覆盖了经济状态**（矿脉、队列、`nextUnitId`、`gatherTicksLeft`、`carrying`）—— M4 若新增 `World` 字段，记得同步加进哈希，否则确定性回归会漏检。

## M3 关键设计（容易忘的）

- **矿点在基地的战场侧**（玩家 550 / 敌方 2450），不是后方：M2 的走廊把单位钳制在 `[354, 2646]`，放在后方矿工永远走不到。
- **矿工的姿态由工作推导**（有目标→`advance`，无目标→`hold`），因为 `createWorld` 给初始矿工 `hold`，而 `movementSystem` 对 `hold` 直接返回 —— 只给 `target` 不给姿态的话矿工永远不动。**唯一的例外是 `retreat`**：它是玩家的真实指令，必须粘住，不能被覆盖。
- **`carrying === 0` 不等于「矿脉已空」**：整个采集过程中 `carrying` 都是 0。判定采集是否结束要看 `gatherTicksLeft`，否则矿工会每次都在第一个 tick 放弃采集、无限重来。
- **金币与人口的时机是分开的**：矿脉在**采集完成**时扣除，金币在**抵达基地**时入账 —— 所以运金途中被打死是真实的经济损失。
- **指令只进本帧第一个 tick**：4x 下一帧跑多个 tick，若把指令发给每个 tick，一次点击会花 4 倍金币。`advanceWorld` 的 `takeCommands` 回调**只在 `ticks > 0` 时被调用**，所以「0 tick 帧丢弃指令」这个 bug 在结构上不可能发生。
- **速度无关的正确表述是「批处理无关」**：同样数量的 tick 必须产出相同哈希。spec §11 第 4 条原文（1x 与 4x 哈希相同）是**不可实现的**，已在 spec 中加勘误。
- **相机 `scrollX` 不是世界左缘**：Phaser 相机 `originX = 0.5`，`worldView.x = scrollX + W/2 − (W/z)/2`。钳制必须含 `(W/z − W)/2` 偏移，否则 0.6x 时相机停在离世界右缘 400px 处 —— 不露空白，但**永远看不到敌方基地**。点击→世界坐标同理，用 `cam.getWorldPoint()`，别手算。
- **`hashWorld` 是确定性回归的唯一守卫**：新增 `World` 字段必须同步进哈希，否则回归测试会漏检。

## M2 已知平衡问题（不是 bug，交给 M3/M4 调）

`sim/harness.ts` 的对撞矩阵显示**弓箭手性价比过高**，与 spec §6.5 的设计意图（弓箭手必须有掩护才有价值）不符：

| 场景 | 结果 |
|---|---|
| 弓箭手×12（960 金）vs 剑士×10（1000 金） | **弓箭手胜**，1500:640 伤害 |
| 弓箭手×10（800 金）vs 矛兵×9（810 金） | **弓箭手胜**，1260:344 伤害 |
| 矛兵×11 vs 剑士×10 | 矛兵胜 ✓ 符合 spec §6.5 |

疑似成因：射程 200 让弓箭手在接近阶段白拿约 6 轮齐射，而近战始终贴不上身。
按 spec §11，这属于**平衡**（harness 的产出目标），**不**属于 M2 验收标准。
M3 加入了经济系统但**未重新测这条** —— M4 开调时先重跑 harness，因为「造 12 个弓箭手」的时间成本现在也被纳入了。

**重要提醒：R1/R2 确实生效。** 受控实验（同样 6 弓箭手 vs 同样 10 剑士，一组加 5 剑士掩护）
显示：两者都射 45 箭，但有掩护造成 **1370** 伤害、无掩护只有 **613** —— 2.2 倍差距。

## 工作方式

- 实现前先确认 spec 已评审通过，且实施计划已存在。
- 每个里程碑独立验收，验收标准是客观的（能跑 / 能打赢 / 哈希一致），不接受「感觉差不多了」。
- 数值改动集中在 `src/data/`，靠 M2 的 headless harness 验证，不靠手动玩。
- **验收必须实测，不能靠推断。** M1 的插值缺陷就是靠浏览器里逐帧计数抓出来的（`syncStickmen` 调用 120 次 / 120 帧，而修复前只会调用 20 次）。
- **Phaser 4 陷阱的 ESLint 规则必须用 `no-restricted-syntax`**：`no-restricted-properties` 只匹配裸标识符对象，抓不到 `Phaser.Math.TAU`（真正的陷阱），只能抓到 JS 里本就是 `undefined` 的 `Math.TAU`。
