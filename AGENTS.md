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
7. **渲染层的可判定逻辑必须抽成 Phaser-free 模块并配测试。** 依赖 Phaser 的模块（`skeleton.ts`、`BattleScene.ts`）在 node 环境下测不了，于是任何**只有它们才能验证**的规则就等于没有测试。做法：把算术/约定/状态判定抽到纯模块，Phaser 只做「把结果变成对象」。

   已有的例子（照这个形状写）：`stickman/rig.ts`（骨骼朝向约定）、`hud/layout.ts`（HUD 布局与按钮状态）、`render/camera.ts`（相机钳制）、`render/selection.ts`、`render/timestep.ts`（帧驱动与速度）。

   **为什么是铁律**：这条是**两次同一个教训**换来的 —— 腿部朝向错了三个里程碑（腿被画成横矩形，而姿态按竖直写，每个单位每一帧都脚朝前伸），攻击接触帧错位了两个（`phaseOf` 除以风干而非整个攻击周期，刀刃视觉接触比掉血早半个前摇）。两个 bug 都**肉眼可见**、都**不影响任何测试**。它们的共同根因就是「渲染层没有测试」，而不是某一次疏忽。

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
- **胜利条件由 `MatchConfig.winCondition` 选择**（M4b 引入）：`'annihilation'`（默认，关卡 1）或 `'base'`（关卡 2，必须拆基地）。**经济关不能用 `'annihilation'`** —— 敌方会重建，「单位归零」不是终局，且它总是抢在攻城之前触发，让基地沦为装饰品（实测 30 局基地从未被碰过）。
- **弓箭手打不到基地是缺陷**（M2 遗留，M4b 修）：`spawnProjectile` 只处理 `target.kind === 'unit'`，对基地**静默返回**，于是远程对基地零伤害且无报错。
- **`Projectile` 携带目标引用**（M4b 起）：原先只有 `targetId: number`，无法表达基地目标，正是上述缺陷的根因。
- **无尽模式的难度 = 波次预算**（M5a）：没有乘算系数。加陡斜率会让玩家**更早**战败（敌方兵力免费，玩家为每个替补付费）。
- **`Level` 数据里没有 `difficultyMult`**（M5a 删除）：不要因为「以后可能要调难度」而重新加一个不消费的字段 —— 见 spec §15 登记表。
- **Vite `base` 必须是 `/stick-war-web/`**，否则 GitHub Pages 资源 404。

## 当前状态

- [x] 设计访谈完成（40 条决策，见 spec §13）
- [x] 设计规格已写入 `docs/superpowers/specs/` 并通过评审
- [x] 实施计划写入 `docs/superpowers/plans/2026-09-25-m1-skeleton.md`
- [x] **M1 骨架**（已合并至 `master`）
- [x] **M2 移动与战斗**（已合并，215 tests）
- [x] **M3 经济与指令**（已合并，17 commits）
- [x] **平衡修复：弓箭手过强**（判别固化为 `counter-relations.test.ts`）
- [x] **渲染层修复**：腿部朝向、攻击接触帧、暂停按钮、4x 追赶窗口（分支 `m3-fixes`，**464 tests**）
- [x] **M4a AI 与波次**（已合并至 `master`，**567 tests**）
- [x] **M4b 关卡、胜负条件与结算界面**（已合并，**653 tests**）
- [x] **M5a 无尽模式**（**已直接提交至 `master`**，685 tests）
- [x] **M5b 表现层与基础设施**（战线指示器 / i18n locale / localStorage / 无尽 HUD 适配 / dev FPS，**738 tests**）
- [x] **M5c 音效与部署**（**已直接提交至 `master`**，**779 tests**；部署记「未做（工件已就绪，无 remote）」）
- [x] **M6.1 关卡 3**（已合并至 `master`，**789 tests**；敌方档案实测 `mt=7/iv=30` → 281s，5 种子全绿）
- [x] **M6.2 巨人**（已合并至 `master`，**791 tests**；重甲坦克，3 行 counter-relations 实测钉死）
- [x] **M6.3 法师 + 控制**（已合并至 `master`，**794 tests**；远程眩晕 1s，`Projectile` 新增 `attackerType`）
- [x] **M6.4 巨人/法师 UI 接线**（已合并至 `master`，**794 tests**；`TRAINABLE` 4→6，敌方 buildOrder 实测无操作已回退）
- [x] **M7 训练进度条 + 关卡选择菜单**（已合并至 `master`，**825 tests**）
- [x] **M7b 菜单偏好开关**（已合并至 `master`，**836 tests**；速度偏好 + 音效开关持久化）
- [x] **M7c 关卡 3 人口放宽**（已合并至 `master`，**837 tests**；popCap 8→12，锚点 281→280 重钉）
- [x] **M8 菜单说明 + 对局中菜单键 + 部署**（**854 tests**；关卡 `.desc` 文案、HUD 菜单键 + 确认浮层、clickGuard 布局推导、GitHub 仓库已建并 push）
- [x] **M9 触屏手势 + 窄视口顶条**（已上线，**876 tests**；pan/pinch 手势、frontline 让位、资源两行）
- [x] **M10 敌方巨人/法师 + 经济重扫**（已上线，**877 tests**；startGold 300/5 矿工、buildOrder 加 giant/mage、锚点 280→192、训练台账断言）

## M6.4 已交付

巨人/法师从「测试里的单位」变成「游戏里能造的单位」。纯加法，零 sim 机制改动，全部在 `render/` 内完成。

- `render/hud/layout.ts` — `TRAINABLE` 从 4 项扩到 6 项（miner/swordsman/archer/spearman/giant/mage），HUD 训练按钮行随之从 4 个变 6 个（+3 姿态 = 9 按钮，1280 视口下 1036px，余量 244px）
- `render/hud/layout.test.ts` — 按钮数断言 4→6（按数量驱动，自动适配；布局测试 35 项全绿）
- **敌方 buildOrder 实测翻案，未改动**：见下

## M7b 已交付（菜单偏好开关）

M7 推迟的两项：菜单加「速度偏好」+「音效开关」。全部零 sim 改动。

- `save/storage.ts` — `SaveData` 新增 `sfxMuted: boolean`（默认 false）；`loadSave` 宽容合并（缺字段/垃圾类型回落 false），**`SAVE_VERSION` 保持 1**——升版本会清掉全部现有存档，为加一个字段清空进度不成比例。
- `render/menu/layout.ts` — 新增 `menuToggleRects`（两开关并排，位于关卡行与重置按钮之间）、`SPEED_CYCLE` / `nextSpeed`（1x→2x→4x 循环，未知值回落 1x）、`speedToggleLabel` / `sfxToggleLabel`；`menuPanelRect` 的 contentH 计入 toggle 行（否则重置按钮与开关重叠——已由测试抓住）。配 8 条新测试。
- `render/scenes/MenuScene.ts` — `buildToggle(rect, nextSave, label)`：点击 → 存档写回 → 标签从存档重取（**标签永不缓存**，label0 缺陷的教训）。开关数值永远以存档为单一真相。
- `render/scenes/BattleScene.ts` — 静音门改为 `setMuted(saveData.sfxMuted || paused || decided)`（调用点 OR 合并，`AudioManager` 零改动）；`create()` 的开局静音从硬编码 `false` 改为读存档偏好（否则会覆盖菜单里关掉的音效）。
- `i18n/zh-CN.ts` — 新键 `menu.speedPref` / `menu.sfxPref` / `menu.sfxOn` / `menu.sfxOff`。
- spec §8.4.6 M7b 修订。

### M7b 的关键设计（容易忘的）

- **偏好 ≠ 瞬态门。** `AudioManager.setMuted` 是每帧重设的瞬态开关（暂停/结算用），用户偏好只存在于存档。两者在唯一调用点 OR 合并——给 AudioManager 加「偏好」概念是双状态复杂化，明确不做。
- **加字段不升版本。** `loadSave` 本来就是逐字段宽容合并；`SAVE_VERSION` 升级 = 整包丢弃 = 清空玩家进度。
- **`nextSpeed` 对未知值回落 1x**（不是「下一个」）：垃圾存档值不在循环里，最安全的恢复是默认值，不是猜测。
- **开关标签点击后从存档重取**，不本地缓存布尔值——与 M5b 的 `label0` 缓存缺陷同族。

## M7 已交付（训练进度条 + 关卡选择菜单）：①第三关人口上限太快到 ②造兵想要进度条 ③想要关卡选择菜单。**①实测是关卡设计本身**（`LEVEL_3.popCap = {player: 8, enemy: 8}`，`levels.ts:106`），保留不动（放宽需重扫 level-3 档案 + 重钉 281s 锚点，独立任务）；②③已实现，全部零 sim 改动。

- `render/hud/training-progress.ts`（新）— 纯函数：`trainingProgress(world, side)`（队首 `{visible, label, fraction}`，fraction = `1 - ticksLeft/trainTime`）、`trainingBarRect(width)`（钳制不越窄视口）。读 `world.trainingQueue[side][0]` 只读 sim，配 9 条测试。
- `render/hud/index.ts` — 资源面板下方接进度条（填充条 + 「单位名 m:ss」标签）；**队列空整组隐藏**；`destroy` 一并清理。
- `render/menu/layout.ts`（新）— 纯函数：`menuPanelRect` / `menuRows`（解锁 = `furthestLevel >= index`，无尽行仅在打完末个战役关后解锁）/ `menuAuxRect` / `canResetProgress` / `resumeLevelIndex`（封顶最后战役关，与存档规则一致）。配 15 条测试。
- `render/scenes/MenuScene.ts`（新）— 薄渲染器：标题 + 关卡行（未解锁灰显不可点）+「重置进度」（有进度才显示，写回 `DEFAULT_SAVE` 后 `scene.restart()`）。启动关卡带 `CAMPAIGN_SEED`（确定性对所有模式一视同仁）。
- `render/scenes/BootScene.ts` — **不再读存档选关**，直接 `scene.start('Menu')`；「从最远解锁关恢复」的职责移交菜单（`resumeLevelIndex` 单一真相）。
- `render/result/{layout,index}.ts` — `resultButtonRects` 2 键 → **3 键**（重玩/下一关/菜单；面板加宽 420→480、键宽 160→132），`ResultOverlayCallbacks` 新增 `onMenu`，BattleScene `goToMenu()` → `scene.start('Menu')`。
- `i18n/zh-CN.ts` — 新键 `result.menu`（菜单）、`menu.title`（选择关卡）、`menu.resetProgress`（重置进度）。
- **spec §8.4.6 / §8.4.7（新）** + §13.7 Q2 修订（「不做关卡选择菜单」→ M7 做）。

### M7 的关键设计（容易忘的）

- **解锁判定单一真相**：菜单行解锁 = `furthestLevel >= index`，与旧 BootScene 恢复规则逐字一致（`resumeLevelIndex` 测试钉住「恢复不能停进无尽」）。两处都读同一个存档字段，但推导函数只有一份。
- **进度条只显示队首**：队列是串行的，队首的 `ticksLeft` 就是「下一个单位什么时候出现」的完整答案。完整队列列表会让 9 键底栏更拥挤，本轮明确不做（spec §8.4.7）。
- **第三关人口 8 是设计不是缺陷**：`canQueue` 把「在场 + 队列 pending + 新单位」一起对 `popCap` 校验（`training.ts:38-43`），8 人口 = 最多 2 巨人（pop 3）或 8 普通兵。放宽是关卡设计任务，必须走「重扫档案 + 重钉锚点」流程。
- **「重置进度」只在有进度时出现**（`canResetProgress(furthestLevel, endlessBestWave)`）——对全新存档显示重置是无意义操作。
- **MenuScene 点击行的种子是 `CAMPAIGN_SEED`**：与旧 BootScene 恢复路径相同种子，同关同表现，确定性不因菜单入口而破坏。

## M8 已交付（菜单关卡说明 + 对局中菜单键 + 部署上线）

用户验收反馈：巨人 ✓、12 人口节奏 ✓；两件新事——①第一关看不到敌方矿工（被误读为 bug）②对局中无法回菜单。部署随本轮上线。

- **关卡 1「看不到敌方矿工」实测为设计**：`LEVEL_1.startMiners = {player: 3, enemy: 0}` + `enemyAi: 'scripted'`——敌方无经济是教学设计（spec §8.4），场上根本没有敌方矿工可看。修法不是改关卡，是**把机制说出来**。
- `render/menu/layout.ts` — `MenuRow` 新增 `description`（取 `level.<id>.desc` 键）；`MenuScene.buildRow` 在行名下方画灰色小字。**机制必须被告知，不是被猜出**。
- `i18n/locale.test.ts` — 新护栏：每个 `LEVELS` 成员必须有 `level.<id>.desc`（与 `.name` 护栏同形——缺键会渲染出裸键名）。
- `render/hud/layout.ts` — `layoutMenuButton`（菜单键，暂停键左侧，同链推导）+ `menuLabel()` + **`HUD_METRICS` 从 `index.ts` 迁入**（见下）；`index.ts` 复导出保兼容。
- `render/clickGuard.ts` — 右上保留区从**硬编码 240px**改为**按钮簇实际布局**（菜单键左缘）。菜单键把 1280 宽下的簇左缘推到 x=948，旧守卫 1040 边界外——「点菜单键」会穿透成「选中 900px 外的单位」，测试抓住后改为布局推导，未来簇内加按钮守卫自动变宽。
- `render/confirm/layout.ts`（新）— 「返回菜单？」确认浮层的纯几何 + 文案，配 8 条测试。
- `BattleScene` — HUD 菜单键 → 确认浮层（确认 = `scene.start('Menu')`，取消 = 关闭）；浮层打开期间**对局冻结**（等效暂停）+ 空格不穿透 + 背景可交互吞点击。
- `i18n/zh-CN.ts` — `ui.menu`、`level.*.desc` ×4、`confirm.menu.*` ×3。
- **部署上线**：`gh repo create turnaround02/stick-war-web` + `git push`；启用 Pages (GitHub Actions 源) 后 `deploy.yml` 工件流自动发布。

### M8 的关键设计（容易忘的）

- **「看不见的机制必须写出来」**：敌方无经济（关卡 1）、只能战败（无尽）都是数据层事实，玩家无从观察——菜单行说明是它们的唯一表达通道。加关卡时 `.name` 与 `.desc` 两个键都必须登记（两条护栏测试各守一个）。
- **`HUD_METRICS` 必须住在 `layout.ts`**：clickGuard 从按钮簇推导保留区，若从 `index.ts`（Phaser 渲染器）import，ESM 互操作下解析为 `undefined`，运行时炸在 `metrics.gap`——首次实测即中。**纯算术模块不得依赖渲染器模块**，这是铁律 #7 的一个新变体。
- **点击守卫保留区 = 布局推导，不是常数**：右上角每加一个按钮，守卫必须自动变宽。硬编码的 `cornerW: 240` 曾在菜单键加入后立即失效（948 < 1040 边界外 92px）。
- **确认浮层的对象类型**：`all` 数组用 `Array<Rectangle | Text>`（有 `setVisible`/`destroy`），不是 `GameObject`（没有 `setVisible`，tsc 抓）。

### M8b 线上验收修复（暂停/菜单/速度标题三重叠 + 进度条压字）

用户在**窄视口**（浏览器窗口 ≈532px）打开线上站点发现暂停与菜单按钮重叠。复现实测（Phaser 按钮簇是右对齐+左链推导，窄视口下链条向左挤压）：

- **三重文字叠压**：「速度」标题 = `menu.x - gap`，532px 下 ≈259——**落在 240px 资源保留区内、又被菜单键标签压住**，三个文字叠在同一点。
- **训练进度条压字**：固定 `y: 66` 与 tick 标签行（y≈44..57）及无尽波次行（y≈64..78）相撞——固定 y 对「上方行数会变」的布局天然脆弱。

修法（全部仍是单链推导，加**挤压规则**而非第二套坐标）：
- `speedHeaderRight` 返回 `number | null`：菜单键左缘与资源保留区之间**容不下 48px 就不渲染标题**（速度按钮自带 1x/2x/4x 标签，标题是锦上添花不是信息）；渲染层对 `null` `setVisible(false)`。
- `trainingBarRect(width, waveVisible)`：y 从「上方各行」推导（无尽多一行就往下挪一行），不再用固定常量；签名加 `waveVisible` 由调用方传入。
- 新测试：532/600px 断言标题为 `null`；进度条 y 恒在 tick 行之下、无尽比战役低一行。

**教训：布局验收必须包含窄视口。** M8 的桌面视口测试全绿，但「右对齐+左链推导」的布局在窄视口下的行为只有真实渲染才暴露——**每个布局模块的测试都应有一组 `532px` 级别的窄宽度断言**（本轮已给 header/进度条补上；其余布局函数按需跟进）。

## M10 已交付（敌方用巨人/法师 + 关卡 3 经济重扫）

M6.4 留下的「敌方不用新单位」缺口正式关闭。全部改动落在 LEVEL_3 数据 + 敌方档案，零 sim 机制改动（`nextBuildType` 缺口实测未触发，继续留档）。

- **实测先行**：popCap 12 下敌方峰值金币重测 = **150**（M6.4 时 280，AI 更快把钱花进轮转）——400 金巨人不可能，强化经济是硬前置。
- `data/levels.ts` — `LEVEL_3.startGold` 200→**300**、`startMiners` 3→**5**（双方对称），含完整扫描表注释。
- `sim/ai-profile.ts` — `LEVEL_3_ENEMY.buildOrder` 加 `'giant'`, `'mage'`（fewest-owned 轮转自动分配配比）。
- **扫描结果（5 种子，训练台账验证「真的造了」）**：300/4→158s 无巨人 · **300/5→192s 有巨人** · 400/4→184s 无 · 450/3→196s 有 · 260/4→157s 无 · 280/5、260/5→192s 无。选 300/5 = 能造出巨人的最温和强化。
- **M4b 教训第三次应验**：给敌方加钱 → 对局**变短**（280→192s）。时长 192s 在窗口内（下缘），接受并钉死。
- **`nextBuildType` 买不起卡死缺口未触发**（每个买得起的格子都实际造出巨人）——Q2-B「数据绕开而非修 sim」被证实，缺口继续留档不修。
- `sim/level-3-winnable.test.ts` — 锚点 280→**192** 重钉 + **新构成断言**：训练台账（真实决策路径重放、AI 命令先于玩家消费）断言敌方训练命令含 `giant ≥ 1`，防 M6.4 式静默空转。
- **spec §8.4.4b M10 修订**。
- 回归：关卡 1 指纹 / counter-relations / 无尽锚点全部未动（**877 tests** 全绿）。

### M10 的关键设计（容易忘的）

- **「训练台账」是比幸存者更强的证据**：`runMatch` 的 survivors 显示不了「造过但死了的巨人」；重放真实决策路径并记录敌方 train 命令，才是「AI 真的造了 X」的一手证据。该 helper（`enemyTrainLedger`）已留在测试文件里，以后任何 buildOrder 改动都可以复用。
- **敌我经济必须对称强化**：LEVEL_3 是对称关，`startGold/startMiners` 改一边就破坏对称。300/5 是双方同改。
- **给敌方加钱 = 对局变短**（不是变长）：敌方军队更早成型，但玩家 12 人口军队也提前成熟，净效果 280→192s。想拉长对局应该加人口或强化基地，不是给钱。
- **250+ 金的差距不会被「稍微加点钱」填平**：峰值 150 vs 巨人 400，必须把起始金拉到 300 量级才能在轮转点上买得起。



M8b 上线后用户继续在 532×960 窗口使用，暴露出比按钮重叠更深的问题：**顶条三个元素物理上放不下**（资源 230px + 战线 40% + 按钮簇 316px > 532px），且触屏完全无法滚动/缩放。

### M9a 触屏手势（`input/gestures.ts`，纯模块 15 tests）

- `PanTracker`：按下→拖动→抬起状态机；`TAP_SLOP_PX=12` 内不启动拖动（点击仍是点击）；超阈值后增量上报。
- `PinchTracker`：双指距离变化 → 缩放增量（`PINCH_ZOOM_RATE=0.005`，200px 张开 ≈ +1.0 缩放，clamp 到 0.6~1.2）。
- BattleScene 接线：pointerdown/move/up（+upoutside）；第二根手指按下启动 pinch 并取消 pan；**拖动超过阈值的手势不触发 handleClick**（拖完不清空选中）；菜单确认浮层打开期间手势冻结；桌面键鼠/滚轮/边缘滚动**零改动**（pointer events 天然并存，鼠标拖动=平移）。
- 浏览器实测：暂停对局上拖左 150px，基地屏幕位置右移同幅，钳制无露白。

### M9b 窄视口顶条「放不下」的系统性解法

**实测根因**：532px 下三元素总需求 769px。M8b 只修了文字级重叠（速度标题），没解决「物理放不下」。本轮三规则：

1. **战线指示器让位**：`frontlinePanelRect` 收缩到「资源保留区(240) 与按钮簇(316) 之间的自由带」，`visible=false` 当自由带 < `FRONTLINE_MIN_WIDTH(60)`——532px 时自由带为负 → **指示器整体隐藏**（唯一非交互元素，最后让位）。`{rect, visible}` 返回形状；histogram/baseBar 同链收缩。桌面 1280px 完整 40% 不变。
2. **资源读数分两行**：`resourceLines` + 渲染器 `narrowResource` 标志（由菜单键左缘推导，`menu.x - 22 < 240`）——单行 230px 会伸进按钮簇，两行各 ~110px 在保留区内。行 y=10/28，**第二行结束于 tick 标签(44) 之上**；resourceBg 背景从行位置推导。
3. **`RESOURCE_RESERVE_X` 单一来源**：clickGuard 的 `cornerW` 与 header 的判据都从它取值，不再各写一个 240。

**教训（铁律 #7 变体 + M8b 教训的推广）**：布局模块之间通过**导出的纯函数/常量**互相同步（`topRightClusterWidth` / `RESOURCE_RESERVE_X` / `FRONTLINE_MIN_WIDTH`），禁止任何一方硬编码对方的数字——M8 的 240 是第一个事故，M8b 的固定 y=66 是第二个，本轮全部收敛为推导链。**窄视口断言（532px 级）是布局模块测试的必选项**，本轮 frontline/hud 全部补齐。

## M7c 已交付（关卡 3 人口放宽）

用户抱怨「第三关 8 人口很快到顶」→ 实测确认后扫描放宽。改动只有一处数据 + 锚点重钉：

- `data/levels.ts` — `LEVEL_3.popCap` **8 → 12**（含完整扫描表注释）。扫描（5 种子、`runMatch` 真实路径、只改 popCap）：8→281s（基线）、**12→280s**、16→213s、24→212s。选 12：与窗口中心 270s 距离 +10s（正中），且解锁「双巨人 + 6 矿工」结构（8 人口下不可能）。16/24 实测等效——16 之后节奏被敌方早期崩溃饱和，额外人口不改变对局形状。
- `sim/level-3-winnable.test.ts` — 锚点 281 → **280** 重钉；新增断言「玩家以 12 存活」钉住人口结构。
- **spec §8.4.4b（新）** — 关卡 3 记录 + 扫描表 + 「16 之后饱和」结论。
- **基线体检（本次扫描前实测，5 种子）**：双方 30s 内满 8/8 并全程满员；玩家金币后期积压 ~2790；敌方 t≈120s 起 0 单位，最后 ~160s 是无对抗磨基地——281s 锚点的本质是「8 人口军队磨 3000 血基地」。
- **敌方 buildOrder 不动**：巨人 400 金进敌方队列会触发 `nextBuildType` 买不起缺口；「敌方用巨人/法师」仍是独立任务（先强化 LEVEL_3 经济到峰值 ≥400）。

### M7c 的关键设计（容易忘的）

- **扫描再次验证 M4b 方法论，且实测推翻了 grilling 推荐**：曾推荐 16（预计「中等改动」），实测 16 与 24 等效且时长掉到 213s，12 才是正中窗口的答案。「先扫再选」救了这个决定——真实验证了「跑一遍到底测一遍」。
- **`minerTarget 7 + 1` 是 8 人口被锁死的机制根因**：AI 在 ramp 期把人口全花在矿工上，buildOrder 的弓箭手永远轮不到（8 = 7 矿工 + 1 战斗位）。12 人口给了 buildOrder 第 2、3 项展开空间。
- **一次性探针脚本**：内联 `npx tsx --eval` 带 `require()` 在 tsx ESM 互操作下会失败——写成真 .ts 文件（import 语法）跑完即删。
- **关卡 1 黄金指纹 / counter-relations / 无尽锚点全部纹丝不动**（837 tests 全绿）——popCap 只属于 LEVEL_3。

## M6.5 已交付（巨人视觉 + 射程修复）

巨人从「换个颜色的火柴人」变成「一眼很厉害」：整体缩放 1.5× + 专属巨锤。纯渲染层，零 sim 改动。

- `render/stickman/rig.ts` — 新增 `VISUAL_SCALE`（giant=1.5，其余=1.0）、`WEAPON: Record<UnitTypeId, WeaponSpec>`（giant 带锤头，其余共用 `DEFAULT_WEAPON`）、`hipHeightFor(scale)`。全部 Phaser-free，配 5 条新测试（共 799 tests）。
- `render/stickman/skeleton.ts` — `createStickman` 按 typeId 取 scale/weapon；容器初始 `setScale(s,s)`；`setFacing` 改为 `setScale(dir*s, s)`（保持缩放）；武器 shaft+可选 head 两块；`stickmanHipHeight(typeId)` 取代全局 `STICKMAN_HIP_HEIGHT` 的调用。
- `render/ghost.ts` / `render/scenes/BattleScene.ts` — 改用 `stickmanHipHeight(typeId)` 定位。
- **spec §12 风险 #7 修订**：区分通道从「配色 + 武器形状」升级为「配色 + 武器形状 + 体型」，记录 M6.5 修订。
- **`data/units.ts` — `giant.attackRange` 30 → 44**。原值 30 < `bodyRadius_giant + bodyRadius_miner` = 22 + 10 = 32，导致巨人对**所有**它能物理接触的单位永远打不到（分离系统保证最小中心距 ≥ 32px，射程 30 永远小于 32）。修为 44 后覆盖最坏情况（22+22=44）。纯数据表改动，零 sim 代码改动。
- **`sim/counter-relations.test.ts`** — `mage x1 vs giant x1` 期望 `'player'` → `'enemy'`：旧 30 射程时巨人打不到法师（33 > 30），法师 74s 风筝胜——那是 bug 不是设计。44 射程后巨人能命中法师，958 tick 击杀。
- **`sim/range-invariant.test.ts`（新）** — 结构性不变量测试：每个近战攻击方的 `attackRange >= bodyRadius_self + bodyRadius_target`。唯一已知例外：`swordsman → giant`（30 < 36），记录为设计限制（矛兵 45 射程是巨人克星）。配 2 条测试（共 801 tests）。

### M6.5 的关键设计（容易忘的）

- **体型是渲染层专属通道。** 不动 sim `bodyRadius`（giant 仍 22）、不动 `separation`、不动 `counter-relations` 锚点。视觉 1.5× 使巨人 1.0× 相机下头宽 ≈21px，0.6× 屏 ≈13px——可辨识但不夸张。
- **`setFacing` 必须携带缩放。** 原实现 `container.setScale(dir, 1)` 会把 Y 缩放清零；改为 `dir*scale` 后朝向翻转与体型缩放共存。
- **`STICKMAN_HIP_HEIGHT` 是 scale=1 的全局值，已废弃**（仍导出以保兼容）。新代码用 `stickmanHipHeight(typeId)` = `hipHeightFor(VISUAL_SCALE[typeId])` = `LEG_LENGTH × scale`。若忘记，巨人 1.5× 时脚会踩到地线下 9px。
- **巨锤 = shaft(14×4) + head(10×14) 两块矩形。** head 在 shaft 端部，两块共用 `pose.weapon` 旋转。非巨人 unit 的 `WEAPON` 指向 `DEFAULT_WEAPON`（16×3 剑），`headWidth=0` 时不建 head 块。
- **`attackRange` 是中心到中心距离，不是边缘到边缘。** `distanceToTarget` 对单位目标返回 `|x_target - x_self|`（中心距），对基地目标才减去 `BASE_RADIUS`。分离系统保证的最小中心距 = `bodyRadius_A + bodyRadius_B`。所以近战攻击方要命中目标，必须 `attackRange >= bodyRadius_A + bodyRadius_B`。这是 M6.5 射程修复的根因，也是 `range-invariant.test.ts` 守住的不变量。
- **剑士 → 巨人是已知设计限制**（30 < 36），不是 bug。矛兵（45 射程）是巨人的克星。若日后想「剑士也能打巨人」，需改 `swordsman.attackRange` 到 36+ 并重扫 `counter-relations` 锚点（剑士 x5 vs 巨人 死锁 → 剑士磨死），本轮不动。

### M6.4 的关键设计（容易忘的）

- **「扫出来的值不变 ≠ 改动生效」。** 把 giant+mage 加进 level-3 档案 buildOrder 后重扫 `minerTarget × decisionIntervalTicks`（5 种子，同 M4b 方法论），结果 281s 锚点**纹丝不动**、其余格全 400s 超时判负。单发脚本（用完即删）验证根因：关卡 3 敌方**峰值金币只有 280**（整局 281s，矿工被玩家推进军队不断击杀，经济被压制），巨人 400 金**永远买不起**；法师 150 金虽买得起，但 `nextBuildType` 选「拥有数最少」，giant(0)/mage(0)/archer(0) 并列时 archer 先中 → **法师被影子化**。最终敌方 281s 只造出 13 矿工 + 1 剑士，**0 巨人 0 法师**。改 buildOrder 是「空操作」，已回退 `ai-profile.ts`，不留误导注释。
- **Q3′ 决定 = A（仅玩家可造巨人/法师）**。敌方不用新单位是关卡 3 经济结构的自然结果，不是缺陷。若日后想「敌方也会用巨人」，是独立关卡设计任务（强化敌方经济 + 重扫档案 + 重钉锚点），不是 UI 修复的范围。
- **`nextBuildType` 的「买不起就整 tick 不造兵」是已知机制缺口**（无回退到次选）。当前所有档案的 buildOrder 都是 4 旧兵种，该缺口从未触发；一旦 buildOrder 含昂贵单位（如巨人 400 金），缺口会变成「经济被卡死」。若要修复需重扫全部关卡锚点（最高风险），本轮不动。

## M6 已交付

关卡 3、巨人、法师 + 控制技能。M6.1 与 M6.2 全部落在 `data/`、`i18n/`、`sim/`（纯逻辑），未触碰 `sim/` 现有机制；M6.3 给 `Projectile` 新增 `attackerType` 字段并扩展 `applyDamage` 签名，关卡 1 指纹 / 关卡 2 276s / `counter-relations` 全绿。

- `data/levels.ts` — `LEVEL_3`（levelId `level-3`，对称经济关，`winCondition: 'base'`，`enemyProfile: 'level-3'`）；`LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_ENDLESS]`
- `sim/ai-profile.ts` — `LEVEL_3_ENEMY = { decisionIntervalTicks: 30, minerTarget: 7, buildOrder: ['miner', 'swordsman', 'archer'], advanceRatio: 1.0, retreatRatio: 0.4 }`，实测 281s（5 种子全绿）；`AiProfileId` 新增 `'level-3'`
- `data/units.ts` — `giant`（500hp/12armor/heavy/r22/55speed/60dmg/1.8s cd，金 400，pop 3，15s）；`mage`（60hp/0armor/light/r11/70speed/22dmg/ranged/150range/2.0s cd/0.4s windup/300ps 弹速，金 150，pop 1，10s，`stunOnHitTicks: 30`）；`UnitDef` 新增可选 `stunOnHitTicks?: number`
- `data/unitTicks.ts` — `UnitTickStats` 新增 `stunOnHit: number`（取自 `def.stunOnHitTicks ?? 0`）；`giant`/`mage` 已登记
- `sim/types.ts` — `Projectile` 新增 `attackerType: UnitTypeId`（M6.3 才需要；M6.2 未改 `Projectile`）
- `sim/systems/combat.ts` — `applyDamage(world, attackerSide, target, amount, attackerType?)`：近战传入 `unit.typeId`，远程传入 `p.attackerType`；命中存活目标时若 `UNIT_TICKS[attackerType].stunOnHit > 0` 则设 `victim.stunTicksLeft` + `state='stunned'`；**先判死再挂晕**（击杀不眩晕尸体）
- `sim/hash.ts` — 弹丸哈希行加入 `p.attackerType`
- `render/stickman/palette.ts` — `giant`（深棕）、`mage`（灰绿）
- `i18n/zh-CN.ts` — `unit.giant: '巨人'`、`unit.mage: '法师'`、`level.level-3.name: '第三关'`
- `sim/harness.ts` — `expandRoster` 顺序 `['archer', 'miner', 'spearman', 'swordsman', 'giant', 'mage']`
- `sim/level-3-winnable.test.ts`（新）— 5 种子全胜、基地拆除（`baseHp.enemy === 0`）、时长 180–360s、钉死 281s、可败（`'none'` 档案）、确定性
- `sim/counter-relations.test.ts` — 新增 6 行（巨人 3 行 + 法师 3 行），全部实测钉死，旧行未动

### M6 的关键设计（容易忘的）

- **巨人是坦克，不是碾压者。** 1 巨人 vs 5 剑士 = **死锁**（6000 tick 超时，双方各有残留）；1 巨人 vs 8 弓箭手 = **敌胜**（弓箭手穿透重甲 ~30s 击杀）；1 巨人 vs 4 矛兵 = **敌胜**（heavy bonus 1.6 弥补 armor 12，~42s）。巨人的定位是**需要掩护或数量优势**的前排，不是 1vN 的碾压单位。
- **法师 1v1 打不过任何近战**（与弓箭手同规则）：mage x1 vs swordsman x2 → 敌胜（513 tick）；mage x1 vs spearman x2 → 敌胜。**M6.5 前**法师对巨人反而**胜**（mage x1 vs giant x1 → 玩家胜，4055 tick）：那是巨人 30 射程打不到法师（33 > 30）的 bug。**M6.5 修复后**（射程 44）法师 1v1 打不过巨人（958 tick 敌胜），与规则一致。
- **`stunOnHitTicks` 是 `UnitDef` 上的可选字段，不进 `hashWorld`**（表是静态的）；`stunTicksLeft` 已在 `Unit` 上（v1 预留，`hash.ts` 已覆盖）。M6.3 只是给 `stunTicksLeft` 加了一个**生产者**（法师命中），消费侧（`ai.ts` 第 3 步、`movement.ts` 第 4 步）早已就绪。
- **`Projectile.attackerType` 进了哈希。** M6.3 把 `attackerType` 加入弹丸哈希行，**关卡 1 / 关卡 2 无弹丸**（剑士/矛兵/弓箭手对撞 + 基地条件），所以回归锚点全绿。若未来关卡引入远程单位，新增的 `attackerType` 字段会改变弹丸哈希，需同步更新 `hash.ts` 的弹丸行（已做）。
- **M6.2 未改 `Projectile`**：巨人近战，不涉及远程弹丸，`applyDamage` 的 `attackerType` 参数是 M6.3 才加的（M6.2 提交时 `applyDamage` 签名未变）。

## M6 未做

- **关卡 3 浏览器肉眼验收。** 逻辑核心已由 794 tests 钉死（5 种子全胜、281s、可败、确定性）；浏览器「下一关」按钮流转与结算浮层由用户验收。
- **巨人 / 法师浏览器肉眼验收。** 渲染层配色已登记（`palette.ts`），骨骼朝向复用现有逻辑（`rig.ts` 已测）；浏览器里实际观感由用户验收。
- **敌方用巨人/法师（M6.4 Q3′=A 留下的已知缺口）。** 关卡 3 敌方峰值金币仅 280，造不出 400 金巨人；`nextBuildType` 无「买不起就回退次选」逻辑。若日后要敌方也造新单位：①强化 LEVEL_3 经济（`startGold`/`mineGold`/`popCap`）使峰值 ≥400；②重扫 level-3 档案 + 重钉 281s 锚点；③视情况补 `nextBuildType` 回退逻辑。本轮 M6.4 已实测确认 buildOrder 改动是空操作并回退，**未实现**。
- **眩晕视觉反馈（M6.4 Q5=A 留下的可选项）。** 被眩晕单位站着不动 1s 本身可读，未加眩晕圈/音效。若日后要做：读 `unit.stunTicksLeft`（渲染层只读 sim，合规）画脚下圈，需配 `render/` 测试（iron rule #7）；或走 M5c `render/sound/` 管线加 `stun` 事件。

## M5c 已交付

程序化音效与 GitHub Pages 部署工件。音频全部落在 `render/sound/`，不碰 `sim/`（→ 零 `hashWorld` 风险，关卡 1 指纹 / 关卡 2 276s / `counter-relations` 全绿）。部署只写了 `.github/workflows/deploy.yml`，**不 push**（无 remote，spec §11 原话「如实记为未做」）。

- `render/sound/detect.ts`（新）— `snapshotWorld(world)`、`diffSfx(prev, cur)`、`SFX_PER_TICK_CAP=8`、`PRIORITY=['hit','swing','death','base','training','gold']`。纯函数，29 测试钉死。
- `render/sound/recipes.ts`（新）— 6 种 WebAudio 音色配方（hit / swing / death / base / training / gold），base 是唯一用 LFO 的。
- `render/sound/sfx.ts`（新）— 薄渲染器 `AudioManager`：`unlock()` 惰性建 `AudioContext`、`setMuted()` 暂停/结算冻结、`play(events)` 按事件表发声。两个纯判定 `shouldCreateContext` 与 `mutedEventGate` 已测试。
- `render/scenes/BattleScene.ts` — 接线：首次 `keydown`/`pointerdown` 解锁；`paused || decided` 时 `setMuted(true)`；每 tick 边界 `diffSfx(prev, cur)` → `play(events)`（`ticks > 0` 才跑，批处理无关）；`prev` 快照在 tick 前捕获（sim 原地推进，否则 `prev === cur` 永远无差分）。
- `.github/workflows/deploy.yml`（新）— 官方工件流：`push: master` → `npm ci` → `tsc` → `eslint` → `vite build` → `actions/upload-pages-artifact` → `actions/deploy-pages`。**未 push、未验证**（无 remote）。

### M5c 的关键设计（容易忘的）

- **音效不入 sim。** 检测器读的是**渲染层快照**（`id` / `state` / `windupTicksLeft` / `typeId` / `gold` / `bases.hp` / `nextUnitId` / `projectiles.ticksToImpact` / `trainingQueueLen`），不是 sim 事件列表——加事件会进 `hashWorld`，徒增确定性风险（spec §13 Q2）。
- **`prev` 是「上一 tick 结束时的深拷贝快照」。** sim 是原地推进（非拷贝），所以 `prev` 必须**在 `advanceWorld` 之前**捕获；若 `prev === cur` 引用同一对象，差分永远为空。`snapshotWorld` 是纯函数，字段级浅拷贝（值是原语/小对象，无需深拷贝）。
- **批处理无关（Q1）。** 1x 与 4x 行为一致：检测器只在「tick 边界」调用一次（随 `advanceWorld` 之后），不在每帧调用。`ticks === 0`（暂停 / 结算）时**跳过差分**，不跑检测器。
- **上限 8 + 固定优先级（Q2/Q10）。** 密集交战时事件表按 `hit > swing > death > base > training > gold` 稳定排序后截断到 8，**低优先级先丢**；「给 12 个事件 → 断言保留哪 8 个」是 `detect.test.ts` 钉死的客观行为。
- **首次输入才建 `AudioContext`（Q4）。** `shouldCreateContext` 纯函数检查 `sfxUnlockEvents` 里是否已有 `keydown` 或 `pointerdown`；每帧调用一次，返回 true 时 `unlock()` 恰好一次（幂等）。锁定后不再处理。
- **暂停 / 结算双保险静默（Q5）。** `setMuted(true)` 同时 `ctx.suspend()`（冻结在发声中的尾巴）+ 事件门控（`mutedEventGate` 返回空表，`play` 不发声）。恢复时 `ctx.resume()`。
- **近战 hit 与 swing 同 tick 绑定（Q7）。** `windupTicksLeft` 归 0 的 tick 同时出 `swing` + `hit`（出刀即命中）；远程 hit 在箭矢 `ticksToImpact` 归 0 的 tick 单独出。
- **`diffSfx` 已内置 `truncateByPriority`。** 调用方拿到的是**已截断**的表，`AudioManager.play` 不再做二次截断（避免双重截断）。

## M5c 未做

- **部署未 push、未验证。** 无 `.git` remote（spec §11 原话「没有 remote 就如实记为未做」）。`deploy.yml` 工件已就绪，用户启用 GitHub Pages 后即可用。
- **音效未在浏览器肉眼验收。** 检测器 / 渲染器逻辑已由 779 tests 钉死；浏览器首次输入解锁 / 暂停静默 / 1x-4x 一致 等肉眼项由用户验收。

## M5a 已交付

无尽模式真的无界了：波次表**按需增长**，难度**只靠预算**。

- `sim/endless.ts`（新）— `endlessWaveAt(n)`：第 N 波 25 秒后到，预算 `100 + 60N`，按**固定构成阶梯**花钱
- `sim/waves.ts` — `advanceWaves` 在 `endless` 且表用尽时**追加并生成**一波（非无尽关卡完全不受影响）
- `data/levels.ts` — `LEVEL_ENDLESS` 加入 `LEVELS`（第 3 项）
- **删除两个死字段**：`difficultyMult`、`nextWaveTick`

### M5a 的关键设计（容易忘的）

- **难度只靠波次预算，没有乘算系数。** 原设计的「HP/攻击 × `min(1+0.03N, 2.0)`」已**删除**：实测表明预算单独就足以产生不可避免的战败，而且乘算需要把系数快照到每个 `Unit` 上（否则在场老单位也会变强），那就得改 `hashWorld` 的 unit 行 —— 本项目已两次漏过哈希覆盖。
- **`difficultyMult` 与 `nextWaveTick` 已删除。** 前者是死字段（拷进 `World` 无人读），后者是无人读的残留。删它们是纯减法，**已用关卡 1 黄金指纹验证零影响**。
- **无尽生成不用 PRNG。** 构成是**固定阶梯**（1~3 波只有剑士，第 4 波加弓箭手，第 7 波加矛兵），所以「第 N 波」完全可复现，这让「玩家撑到第 N 波」成为**断言**而不是分布。
- **无尽只能战败。** `endless: true` 让「敌方单位归零」永不判胜（M4a 已实现）；玩家侧「单位归零即负」无条件保持。
- **实测：参考玩家在第 8 波战败（225s）**，5 个种子完全一致。这个值**被测试钉死**（不只是区间）—— 区间会在注释悄悄说谎时依然通过，M4b 已因此吃过两次亏。
- **`rngState` 被哈希但从未被消费** —— 所以不同种子产生**不同哈希、相同对局**。不影响正确性，但是确定性守卫里的一处噪声（spec §15 有记录）。

## M5b 已交付

表现层与基础设施收口：战线终于有了全局视图，进度终于记得住，无尽终于显示分数。**全部在 `render/`、`i18n/`、新增 `save/` 内完成，未触碰 `src/sim/`**，所以无 `hashWorld` 风险，也不改变任何对局行为（关卡 1 指纹、关卡 2 的 276s、`counter-relations` 全绿）。

- `render/frontline/layout.ts`（新）— 纯函数：`combatUnitCounts`（**只统计战斗单位**，24 桶，边界归左桶、越界钳到首/末桶）、`normalizeCounts`、`frontlinePanelRect`（视口 40% 居中）、`baseBarRects`
- `render/frontline/index.ts`（新）— 薄渲染器：直方图（玩家从中线向上、敌方向下）+ 双方基地血条
- `render/clickGuard.ts`（新）— 纯函数 `shouldIgnoreClick`：保留底部 HUD、顶部左右各 240px、**顶部中央指示器**（按指示器实际矩形，随视口宽变化）
- `i18n/index.ts` — `LOCALES` 注册表 + `setLocale`/`getLocale`，`t()` 查当前表
- `save/storage.ts`（新）— 单一键 `stick-war-web:save`，`loadSave` **容错读**、`saveGame` try/catch、`advanceFurthestLevel`（**仅赢时推进、不回退、封顶**）、`recordBestWave`、`browserStorage`
- `render/hud/` — 无尽波次行（`waveText` 纯函数）+ **修 `label0` 缓存缺陷**
- `render/result/` — `resultSubtitle(levelId, ticks, extra?)` 无尽分支追加「波次 N · 最高 M」
- `render/scenes/BattleScene.ts` — 存档接线（读速度偏好、赢时推进进度、无尽败时写最高波次）+ dev-only FPS
- `render/scenes/BootScene.ts` — **从最远解锁关卡开始**
- `src/vite-env.d.ts`（新）— 让 `import.meta.env.DEV` 有类型

### M5b 的关键设计（容易忘的）

- **直方图只统计战斗单位，不含矿工。** 矿工在基地与矿点之间往返，会形成两座**静态凸起**，把战线信号淹没。这是 spec §7.3.1 的硬性口径。
- **顶部中央会被点击穿透（已修）。** 原 `handleClick` 只保留左右各 240px，而指示器在顶部**居中** —— 点它会误选/取消单位。现在走纯函数 `shouldIgnoreClick`，保留区**由指示器布局推导**，不再是写死的 240px。
- **进度 = 最远解锁，仅在赢时推进，且封顶在最后一关。** `advanceFurthestLevel(cur, wonIdx, won, maxIndex)` 返回 `min(maxIndex, max(cur, wonIdx+1))`：赢 `i` 解锁 `i+1`；**打败最后一个战役关不能把「恢复」停在无尽**（无尽不可通关）。`LAST_CAMPAIGN_INDEX` 用**扫描**算出（`findLastIndex` 是 ES2023，超出本项目 ES2020 lib）。
- **存档读取必须容错。** 损坏 JSON / `version` 不符 / 缺字段 / `getItem` 抛异常 —— 全部**静默回落**，绝不崩。写路径 try/catch（隐私模式）。**不存进行中的对局**：刷新 = 从最远关卡重开。
- **`level.endless.name` 曾缺失** → 无尽结算显示裸键。已补，并加**常备护栏测试**：遍历 `LEVELS` 断言每个 `level.<id>.name` 存在（将来加关卡漏键会被抓住）。
- **`label0` 缺陷**：姿态按钮的标签在构造时缓存、`sync` 不刷新，语言切换不会反映。已改为**每次 `sync` 从 `t(key)` 重取**。
- **FPS 仅 dev 显示。** `fpsSuffix()` 由 `import.meta.env.DEV` 门控，生产构建会**常量折叠成 `return ""`**（已在 `dist` 中核实）。性能验收本身是**外部 Playwright 实测**（S3），不是这个计数器。
- **浏览器实测（肉眼项）**：①指示器随缩放/相机正确、矿工不入直方图 ②点指示器不误选、点单位仍能选中 ③无尽 HUD 显示「波次 N」、结算显示「无尽模式 · 用时 · 波次 N · 最高 M」（无裸键）④手改存档为 `{furthestLevel:2, speedPreference:4}` 后刷新 → 直接进无尽、速度 4x ⑤失败后 `furthestLevel` **未推进**（仍为 0）。**发现并修掉一处**：无尽波次行与 tick 标签在 y≈44 重叠 → 波次行下移到 y=64，资源面板背景随波次可见性增高。

## M3 已交付

`src/sim/` 的最后两个空壳 system 现在有真实逻辑，渲染层有了完整的可玩界面：

- `economy` — 矿工往返（`TargetRef` 新增 `mine` 变体）、采集计时、入账、人口重算
- `commands` — `train` 与 `setStance`，`side` 强制校验（玩家与 AI 共用指令类型）
- `training`（新）— 串行队列、下单扣金/出生占人口、出生位置外推搜索
- `ai` — 矿工三段优先级（有敌+撤退→逃；有敌→继续挖；无敌→挖）
- `movement` — 矿工按「点」导航（矿点 / 基地前沿），撤退停在基地**前沿**
- `render/` — 相机（滚动+缩放，钳制含 origin 偏移）、HUD（资源/指令/速度）、
  选中、`i18n`、`input/` 适配器、`advanceWorld` 帧驱动

## M4a 已交付

`src/sim/` 里敌方终于会「造兵、推进、撤退」，波次脚本也真的会出怪。**全部在 sim 内完成，因此每一项都能 headless 客观验收** —— 这是把 M4 拆成 a/b 的全部意义。

- `sim/ai-profile.ts`（新）— 一套 AI 的旋钮：决策间隔、矿工目标、兵种配比、姿态阈值。**档案即难度**（spec §9.1 说难度 = 决策频率与贪心程度）。两个档案：`ENEMY_STANDARD`（保守）与 `PLAYER_REFERENCE`（参考玩家）。
- `sim/tactic.ts`（新）— 战术层纯函数：读世界 → 产出**玩家同款 `Command`**。只在决策 tick 产出（`world.tick % interval === 0`）。
- `sim/waves.ts`（新）— 波次推进，复用 `findSpawnX`，姿态硬编码 `advance`。
- `systems/commands.ts` — 战术层在**消费循环之前**跑，同 tick 生效。`world.aiProfile === 'standard'` 才跑。
- `systems/cleanup.ts` — 歼灭判胜加了「且无待出波次」条件。
- `data/levels.ts` — `LEVEL_1`（4 波：5/50/110/180 秒，敌方基地 1500，无经济）。
- `sim/harness.ts` — `runMatch(config, seed, playerProfile)`，双侧都由战术层驱动。

## M4a 的关键设计（容易忘的）

- **战术层在 `commandsSystem` 第 2 步，不是 `aiSystem`**：`commands` = 战术层（「造什么、推不推」），`ai` = 单位层（「找最近的敌人打」）。产出**玩家同款 `Command`**，所以 AI 是**在替玩家按按钮**，天然公平，且不新增任何 `World` 字段、六步顺序不变。
- **`aiProfile: 'none'` 有两个用途**：脚本关卡（敌方无经济，跑战术层只会下永远付不起的单），以及**平衡 harness**（它测的是纯兵种对撞，有 AI 会变成在测档案）。
- **「敌方单位归零」不等于胜利**：脚本关卡的敌方兵力**全在波次表里**，t=0 时敌方合法地有 0 个单位。不修的话**关卡 1 会在第 1 tick 判玩家胜**（已实测确认）。无尽模式同理永远不能靠清场获胜。
- **矿工数要连队列一起数**：矿工训练 5 秒。只数场上单位会让 AI 在头几个还在训练时反复下单 —— 它会把开局的钱全买成矿工，一个兵都不造。
- **`minerTarget = 6` 是实测值**：12 个种子扫关卡 1，4 → 0/12 胜，5~8 → 12/12 胜，10 → 0/12 胜。低于它产能跟不上波次，高于它钱全变成矿工、永远凑不出军队。
- **参考玩家是 M4a 的核心产出**：双侧同战术层、不同档案，于是「关卡能通关」从主观判断变成**确定性断言**（`level-winnable.test.ts`，5 个种子）。这是 spec §11「能打赢和打输」的可执行形式。

## M4b 已交付

基地终于决定胜负，远程单位终于能打基地，玩家终于能看见结果并进入下一关。

- `MatchConfig.winCondition: 'annihilation' | 'base'`（默认前者）。关卡 1 用 `'annihilation'`，关卡 2 用 `'base'`。
- `MatchConfig.enemyProfile?: AiProfileId` + `sim/ai-profile.ts` 的 `AI_PROFILES` 注册表。敌方档案不再硬编码，关卡可自带取值。
- `LEVEL_2`（对称经济关）+ `LEVELS` 注册表（**数组顺序即关卡顺序**）。`RENDER_DEMO_MATCH` / `RENDER_DEMO_SEED` 已删。
- `render/result/layout.ts`（纯函数）+ `render/result/index.ts`（薄渲染器，与 `createHud` 同形）。
- `BattleScene.init(data)` + `restart({config, seed})`：`R` 重玩**当前**关，「下一关」进下一关，最后一关时按钮变「返回第一关」。
- `Projectile.target: TargetRef`（替代 `targetId: number`）—— 基地终于能作为弹丸目标。
- 判胜后**停止推进世界**（spec §6.6 一直这么要求，此前从未兑现）。

## M4b 的关键设计（容易忘的）

- **`winCondition` 不从 `enemyAi` 推导**：前者是「怎么算赢」，后者是「敌方有没有经济」。二者只是恰好在本作两关上重合。
- **玩家侧永远是「单位归零即负」**，与 `winCondition` 无关 —— 没有翻盘机制，给一个「还能赢」的显示只会让人等一个永远不会来的结果。
- **`endless` 下「敌方单位归零」永不判胜**（无尽只能战败）。
- **关卡 1 行为被冻结**：`src/sim/level-1-regression.test.ts` 断言其**单位状态指纹**在 5 个种子、5 个检查点逐字节不变。
  - **为什么用指纹而不是哈希**：`winCondition` 必须进 `hashWorld`，而**加一个哈希字段会改变每一个哈希字符串**，所以「哈希不变」不能证明行为不变。指纹只取单位状态，与哈希字段列表无关。
- **`AiProfileId` 定义在 `data/types.ts`**，不是 `sim/ai-profile.ts` —— `MatchConfig` 要引用它，而 `data/` 不得 import `sim/`。

## 两次「实测方法本身是错的」（M4b 的教训）

关卡 2 敌方档案扫描失败了**两次**，两次都产出了看起来合理的表格。两者都是被「有一条测试钉住时长」才发现的 —— **如果没有那条测试，错误的表格会带着一段自信的注释永久留在代码里**。

| # | 错法 | 后果 |
|---|---|---|
| 1 | 在测试循环里**同时驱动双方** | 测试把玩家指令排在敌方之前，而 `commandsSystem` 先消费 AI 的。这一个顺序差异值几十秒（报 211s，真值 216s） |
| 2 | 扫描时 **spread 了 `PLAYER_REFERENCE`** | 于是扫的是 `advanceRatio 0.9 / retreatRatio 0.35`，而实际要发布的档案是 `1.0 / 0.4` —— 表格描述了一个**不存在的档案** |

**规则**：扫描必须驱动**游戏真正会跑的那条路径**（改注册表条目让 `runMatch` 驱动敌方，而不是自己拼指令），并且必须在**即将发布的那个档案基础上**只改要扫的旋钮。

## 经济：一维车道的双向通行（M4a 实测修复）

**症状：1 矿工 2.33 金/秒（符合 spec），12 矿工 0.22 金/秒随后彻底停摆。** M3 的验收测试只用了 1~2 个矿工，单个矿工独占车道，所以缩放这一半从未被测过。

**根因**：战场只有一条轴，矿点在基地与前线之间，矿工**必然双向通行**。出去的和回来的正面对撞 —— 积分让各走 2.33px 靠近，分离又各推回 2.33px，**净位移恰好为零**，运金车永远到不了入账点。**一维世界里对向单位无法互相穿过**，这不是调参问题。附带地，一个 `hold` 的剑士被矿工流顶得后退 7px，战线也永远推不出去。

**修法**：矿工对**非矿工**不做分离；矿工之间**仅在对向时**不做分离（同向仍分离，否则会在矿点叠成一坨）。战斗单位之间保留完整分离 —— 战线与弓箭手掩护不受影响，`counter-relations.test.ts` 仍全体一致。

**另修**：`findSpawnX` 现在只把「新单位真的会与之分离」的单位算作占位。否则一群矿工会把新造的剑士顶到战线前方 130px，它独自先到、没有掩护、白白送掉。

**实测（稳态，预热 10s，60s 窗口）**：1 → 2.33 · 3 → 6.00 · 4 → 8.00 · 6 → 10.67 · 8 → 14.67 · 12 → **19.33** 金/秒。人均效率随人数下降（单车道拥堵）。spec §8.3 原写「12 矿工 28.8 金/秒」是按互不干扰推演的，**不可实现**，已加勘误。

## M4b 实测数据（设计访谈与实施期间测得）

**① 对称经济关里基地曾是装饰品。** 实测 30 局，双方基地**全部满血 3000/3000，一局都没被碰过** —— 「敌方单位归零」总抢在攻城之前触发。→ 新增 `winCondition`。

**② 「加强敌方」是错的杠杆。** 给敌方加钱会让对局**更短**（169 → 145 → 110 秒）：资源越快变成军队，越快被歼灭。没有任何配置能接近 5~8 分钟（最长 206 秒）。→ 时长目标改为 **3~6 分钟**。

**③ 弓箭手对基地零伤害（M2 遗留缺陷，已修）。** `spawnProjectile` 只处理 `target.kind === 'unit'`，对基地**静默返回**。10 个弓箭手围住基地打到超时，`baseHp` 一动不动。→ `Projectile` 携带 `TargetRef`。

**④ 拆基地实测（10 单位 vs 3000 HP）**：剑士 70.1s · **弓箭手 80.8s**（修复前为「永不」）· 矛兵 45.1s。矛兵比剑士快 1.55×。

**⑤ 基地条件下不会卡死。** 实测 243~276 秒结束。金矿储量有限（各 6000），最坏情况是资源耗尽后由尚存军队推平基地 —— 已实测验证：一个极端配置跑到 **7.8 分钟**（矿脉从 6000 降到 1280）后仍然分出了胜负。

**⑥ 关卡 2 敌方档案（实测扫描，`mt=8 iv=30` → 276s）**。完整表格与两次错法见 `src/sim/ai-profile.ts` 的注释。

**⑦ 浏览器实测（肉眼项）**：关卡 1 失败 → 浮层显示「失败 / 第一关 · 用时 1:22」+「重玩」「下一关」→ 点「下一关」进入关卡 2（金币 200/矿工 3，敌方有矿工经济，1x）→ 失败后按钮变为「**返回第一关**」→ 点击回到关卡 1。全链路通过。

## 原 M4b 开工前必须处理（已全部解决）

1. ~~关卡 2 未做~~ → `LEVEL_2` + 实测敌方档案。
2. ~~胜负浮层未做~~ → `render/result/`。
3. ~~关卡流转未定~~ → 浮层按钮 + `BattleScene.init(data)`。
4. ~~`RENDER_DEMO_MATCH` 仍被使用~~ → **已删除**，改为 `LEVELS`。
5. ~~`difficultyMult` 仍是死字段~~ → **M5a 已删除**（决定不用它，见 spec §15）。

## M5b 开工前必须处理（已全部解决，仅音效/部署拆到 M5c）

1. ~~战线指示器未做~~ → `render/frontline/{layout,index}.ts`（**只统计战斗单位**、24 桶）+ `render/clickGuard.ts`（顶部中央点击守卫）。
2. **音效未做**（spec §7.4 列了 6 种）→ **拆到 M5c**（需肉眼验收：首次输入解锁、暂停/结算静默）。
3. ~~localStorage 未做~~ → `save/storage.ts`（单一键、带版本号、**读取容错**）。
4. ~~i18n 只有中文~~ → `i18n/index.ts` 加 `LOCALES` + `setLocale`；**不写英文文案**。
5. ~~无尽模式的 HUD 与结算未适配~~ → HUD 波次行 + 结算副标题追加波次/最高。
6. **部署未做** → **拆到 M5c**：无 `.github/`，**且无 git remote**。**没有 remote 就如实记为「未做」**。
7. ~~性能验收已改写~~（S3）：按**实测负载（约 25 单位）**表述；dev-only FPS 已加。

## 原 M4 开工前必须处理（M4a 已清）

1. ~~敌方无经济~~ ✅ 战术层已接上。
2. ~~关卡系统未实现~~ ✅ `waves`/`waveIndex` 已被消费，`LEVEL_1` 已就绪。
3. ~~战线指示器未做~~ → 见上（M5b）。
4. ~~`hash.ts` 需覆盖经济状态~~ ✅ 并已覆盖 `waves` / `waveIndex` / `aiProfile`。
5. **harness 测不了「拆基地」效率** → 仍未处理，见下。

## M3 关键设计（容易忘的）

- **矿点在基地的战场侧**（玩家 550 / 敌方 2450），不是后方：M2 的走廊把单位钳制在 `[354, 2646]`，放在后方矿工永远走不到。
- **矿工的姿态由工作推导**（有目标→`advance`，无目标→`hold`），因为 `createWorld` 给初始矿工 `hold`，而 `movementSystem` 对 `hold` 直接返回 —— 只给 `target` 不给姿态的话矿工永远不动。**唯一的例外是 `retreat`**：它是玩家的真实指令，必须粘住，不能被覆盖。
- **`carrying === 0` 不等于「矿脉已空」**：整个采集过程中 `carrying` 都是 0。判定采集是否结束要看 `gatherTicksLeft`，否则矿工会每次都在第一个 tick 放弃采集、无限重来。
- **金币与人口的时机是分开的**：矿脉在**采集完成**时扣除，金币在**抵达基地**时入账 —— 所以运金途中被打死是真实的经济损失。
- **指令只进本帧第一个 tick**：4x 下一帧跑多个 tick，若把指令发给每个 tick，一次点击会花 4 倍金币。`advanceWorld` 的 `takeCommands` 回调**只在 `ticks > 0` 时被调用**，所以「0 tick 帧丢弃指令」这个 bug 在结构上不可能发生。
- **速度无关的正确表述是「批处理无关」**：同样数量的 tick 必须产出相同哈希。spec §11 第 4 条原文（1x 与 4x 哈希相同）是**不可实现的**，已在 spec 中加勘误。
- **相机 `scrollX` 不是世界左缘**：Phaser 相机 `originX = 0.5`，`worldView.x = scrollX + W/2 − (W/z)/2`。钳制必须含 `(W/z − W)/2` 偏移，否则 0.6x 时相机停在离世界右缘 400px 处 —— 不露空白，但**永远看不到敌方基地**。点击→世界坐标同理，用 `cam.getWorldPoint()`，别手算。
- **`hashWorld` 是确定性回归的唯一守卫**：新增 `World` 字段必须同步进哈希，否则回归测试会漏检。
- **骨骼有两条朝向约定**（`render/stickman/rig.ts`）：**腿从竖直算起**（0 = 朝下），**臂从水平算起**（0 = 朝前）。腿是**竖**矩形（pivot 在顶边），臂是**横**矩形（pivot 在内端）。两者不可互换 —— 腿曾被画成横矩形而姿态按竖直写，结果**每个单位每一帧**都「脚朝前伸」且悬在离地 18px 处，从 M1 一直错到 M3 后。`rig.test.ts` 现在守住这条：断言「画的矩形方向必须与静止轴向一致」。
- **`STICKMAN_HIP_HEIGHT = LEG_LENGTH` 只在腿真朝下时才正确** —— 它决定脚是否踩在地面线上。

## 平衡：弓箭手过强（M3 后已修复）

**结论：已修复，判别固化为测试。** 弓箭手曾**严格占优** —— 无掩护也能打赢剑士与矛兵，且更便宜、训练更快。9 个按 spec §6.5 期望构造的判别场景里只有 4 个成立。

修好它的两处改动：

| 改动 | 从 → 到 | 为什么 |
|---|---|---|
| 弓箭手 `maxHp` | 80 → **70** | 80 时挨剑士 3 击，70 时 2 击 —— **只惩罚无掩护的弓箭手**（有掩护的靠前排挡刀，输出时间不变） |
| 矛兵 `bonusVs.light` | 缺失 → **1.5** | 「十个矛兵打不过十个弓箭手」是全游戏唯一违反 §6.5「弓箭手 1v1 打不过任何近战」处，属**机制缺失** |

改动后 **10 个场景 × 6 个种子全部一致**，掩护伤害倍率从 2.45 升到 **3.39**。

**为什么选这两个数字（别随手改）**：
- 弓箭手 HP **刻意避开 65 与 45** —— 它们恰落在伤害断点上（`ceil(65/32.5)`、`ceil(45/24)`），胜负会取决于「多挨一击」，任何其他改动都会让它漂移。70 是唯一不在断点上的取值。
- 矛兵 `light ×1.5` 是**实测下限**：1.4 与 1.45 仍会让十个弓箭手赢九个矛兵。

**排查中被推翻的假设（我曾在 AGENTS.md 里写错，记录以免重复走弯路）**：
- ❌ **「射程 200 让弓箭手白拿约 6 轮齐射」** —— 射程降到 180 **完全无变化**，160 也几乎无变化（仍胜），要到 140 才翻转。且降射程会**破坏**有掩护场景：弓箭手靠射程越过前排射击，射程一降就打不到。
- ❌ **「加造价能平衡」** —— 对撞 harness **不消耗金币**，造价只影响场景标签，不改变任何结果。
- ❌ **「经济系统会让弓箭手更弱」** —— 反了。弓箭手造价更低（80 vs 100/90）、训练更快（7s vs 8s/7s），经济只会**强化**它。

**验证工具**：`src/sim/counter-relations.test.ts` —— 10 个场景 × 6 种子，必须全体一致。
此前 `harness.test.ts` 只 `console.table` 打印矩阵、断言「不抛异常」，所以弓箭手严格占优时测试套件**依然是绿的**。**平衡是 spec 要求，不是待汇报的趣闻。**

**仍未处理**：矛兵对基地效率比剑士高 75%（§8.3）。M3 的修订不涉及它（基地是重甲）。注意现有 harness **测不了**它 —— 对局在某一方单位归零时结束，胜方没机会拆基地，要测需新增场景类型。

**重要提醒：R1/R2 确实生效**（倍率 3.39，见上）。受控实验：同样 6 弓箭手 vs 同样 10 剑士，有掩护造成 1370 伤害、无掩护 613。

## 工作方式

- 实现前先确认 spec 已评审通过，且实施计划已存在。
- 每个里程碑独立验收，验收标准是客观的（能跑 / 能打赢 / 哈希一致），不接受「感觉差不多了」。
- 数值改动集中在 `src/data/`，靠 M2 的 headless harness 验证，不靠手动玩。
- **验收必须实测，不能靠推断。** M1 的插值缺陷就是靠浏览器里逐帧计数抓出来的（`syncStickmen` 调用 120 次 / 120 帧，而修复前只会调用 20 次）。
- **Phaser 4 陷阱的 ESLint 规则必须用 `no-restricted-syntax`**：`no-restricted-properties` 只匹配裸标识符对象，抓不到 `Phaser.Math.TAU`（真正的陷阱），只能抓到 JS 里本就是 `undefined` 的 `Math.TAU`。
