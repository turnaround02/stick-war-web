# M5b 表现层与基础设施 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M5 剩下**可 headless 客观验收**的部分落地：战线指示器（Phaser-free 布局 + 薄渲染器）、无尽模式的 HUD/结算适配、i18n 加 locale 概念、localStorage 存档（带版本号、读取容错）、dev-only FPS 标签。**全部在 `render/`、`i18n/`、新增 `save/` 模块内完成，不触碰 `src/sim/`，因此无 `hashWorld` 风险，且不改变任何对局行为。**

**Architecture:** 每一项遵循项目铁律「可判定逻辑抽 Phaser-free 纯模块 + 薄渲染器 + 单测」：
- `render/frontline/layout.ts`（分桶 + 血条矩形，纯函数）+ `render/frontline/index.ts`（薄渲染器）
- `i18n/` 加 `LOCALES` 注册表 + `setLocale()` + 缺失键；`label0` 缓存缺陷修复
- `save/storage.ts`（存/取/容错，纯逻辑可用 jsdom 的 `localStorage` 打桩测试）+ 薄接线
- 无尽 HUD/结算分支走既有纯函数
- FPS 标签仅 `import.meta.env.DEV` 显示

**Tech Stack:** TypeScript ^5.7.2 / Vitest ^3 / Phaser ^4.2.1（仅渲染层）/ npm

**Spec:** `docs/superpowers/specs/2026-09-25-stick-war-web-design.md`（§7.3.1 战线指示器、§7.5.1 locale、§10.1.1 存档 schema、§11 M5b/M5c 拆分、§13.9 M5b 决策记录）

**M5c（本计划不含，需外部条件）：** 程序化音效（渲染层状态差分驱动，首次输入解锁、暂停/结算不播）+ GitHub Pages 部署（需用户提供 git remote，否则**如实记为「未做」**）。M5c 单独开一轮 grilling。

## Global Constraints

逐字取自 spec / AGENTS.md，**每个任务都隐含包含本节**。

- 代码标识符与注释用**英文**；UI 文案用中文走 i18n 键（键存在必须配测试）
- `src/sim/**` **禁止** import `phaser`、`render/`、`input/`、`i18n/`（本计划不碰 sim，天然满足）
- **本批改动全在渲染/i18n/存档层，不得改变任何对局行为**：关卡 1 黄金指纹、关卡 2 时长（276s）、`counter-relations` 全部保持绿
- 可判定逻辑（分桶、存档读/写、i18n 键、无尽分支文案）必须抽 Phaser-free 纯模块并配单测
- Vite `base = '/stick-war-web/'` 不动
- 每个任务收尾：`npx tsc --noEmit` + 相关测试；M5b 收尾：全量 `npm test` + `npm run lint` + `npm run build`

## Review Focus

spec 隐含、但最容易在实现中被打穿的五类失效模式。

| # | 输入 / 条件 | 合理预期 | 承接任务 |
|---|---|---|---|
| 1 | 一个含矿工的 sim 快照进直方图 | **矿工不出现在任何桶**（只统计战斗单位） | Task 1 |
| 2 | 单位 x 恰落在桶边界 / 越出 `[0, worldWidth]` | 边界归属确定（`floor` 归左桶）、越界钳到首/末桶，不产生 NaN 桶 | Task 1 |
| 3 | 点视线顶中央（指示器区域） | **不选/不取消单位**（点击守卫保留顶部中央） | Task 2 |
| 4 | `localStorage` 里是损坏 JSON / 缺字段 / `version` 不符 | **静默回落默认值**，绝不抛异常 | Task 4 |
| 5 | 任一关卡 id | `level.<id>.name` 键**一定存在**（无尽不能再显示裸键） | Task 3 |

---

## File Structure

```
src/
├── i18n/
│   ├── zh-CN.ts            # 修改：补 level.endless.name、ui.wave、result.best、ui.waveLabel
│   └── index.ts            # 修改：LOCALES 注册表 + setLocale() + t() 走当前表
├── save/
│   ├── storage.ts          # 新建：load/save/defaults + 容错读（纯逻辑，可打桩）
│   └── storage.test.ts     # 新建
├── render/
│   ├── frontline/
│   │   ├── layout.ts       # 新建：桶计数 + 基地血条矩形（纯函数）
│   │   ├── index.ts        # 新建：薄渲染器（createFrontline）
│   │   └── layout.test.ts  # 新建
│   ├── hud/
│   │   ├── layout.ts       # 修改：waveLabelText（无尽波次文案，纯函数）
│   │   └── index.ts        # 修改：姿态 label0 缺陷修复 + 无尽波次 HUD 行 + FPS
│   ├── result/
│   │   ├── layout.ts       # 修改：resultSubtitle 无尽分支（追加 波次/最高）
│   │   └── index.ts        # 修改：把 wave/best 传入
│   └── scenes/
│       ├── BattleScene.ts  # 修改：接 frontline、点击守卫顶部中央、存档读速度偏好、
│       │                   #       赢时推进 furthestLevel、无尽败时写 bestWave
│       └── BootScene.ts    # 修改：用存档的 furthestLevel 决定起始关卡
└── data/levels.ts          # 只读：LEVELS / levelId 供 i18n 覆盖测试
```

> **存档写时机注意（Task 5）：** 「赢时推进 `furthestLevel`」「无尽败时写 `endlessBestWave`」的**决策**（读旧值→算新值→写回）抽成 `save/` 纯函数并单测；`localStorage.setItem` 的 try/catch 包裹也在 `storage.ts`，不写进场景。场景只调用，不实现规则。

---

### Task 1: 战线指示器 —— 纯布局（分桶 + 血条）

分桶是纯算术，正是「肉眼看着对、边界错一位」的东西，必须先立测试。本任务只写纯模块与测试，不动 Phaser。

**Files:**
- Create: `src/render/frontline/layout.ts`
- Test: `src/render/frontline/layout.test.ts`

**Interfaces（新建，供 Task 2 的渲染器使用）:**
- `FRONTLINE_METRICS = { buckets: 24, barH, ... }`（常量）
- `combatUnitCount(world: World, side: Side): number[]`（**返回 24 桶的计数数组，不含矿工**）
- `histogramBuckets(counts, buckets): number[]`（归一化到 0~1 供渲染高度）
- `baseBarRect(width, height, metrics): {player: Rect, enemy: Rect}`（两端基地血条槽位）
- `frontlinePanelRect(width, height, metrics): Rect`（顶部居中，宽为视口 40%）

- [ ] **Step 1: 写失败测试 —— 矿工被排除**

```ts
import { combatUnitCount } from './layout';
import { createWorld } from '../../sim/createWorld';

const world = createWorld({ ...LEVEL_1, startMiners: { player: 5, enemy: 0 } }, 1);
// 手动往某桶塞矿工与剑士各一
```

先造一个最小 `World` 桩（或用 `createWorld` + `units.push`），放一个矿工与一个剑士同 x，断言 `combatUnitCount` 只计到剑士（矿工 +1 不出现）。**必须失败**（当前无此函数）。

Run: `npx vitest run src/render/frontline/layout.test.ts`
Expected: FAIL（模块/导出缺失）

- [ ] **Step 2: 实现 `layout.ts`**

桶边界按 `Math.min(bucketCount-1, Math.max(0, Math.floor((x - minX) / bucketW)))`；`bucketW = (worldWidth / bucketCount)`；**只遍历 `typeId !== 'miner'` 且 `state !== 'dead'`** 的单位。血条矩形用 `world.bases[side].hp / maxHp` 的比例。

- [ ] **Step 3: 写边界测试（会失败→实现后通过）**

- x 恰在桶边界归左桶
- x < 0 → 第 0 桶；x > worldWidth → 末桶（不产生越界索引/NaN）
- 空世界 → 全 0 计数

Run: `npx vitest run src/render/frontline/layout.test.ts`
Expected: PASS

- [ ] **Step 4: `npx tsc --noEmit`**

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(frontline): combat-only histogram + base bar layout (pure)

24 buckets, miners excluded (they form static humps that drown the
front-line signal). Boundary/overflow clamped. No Phaser — testable."
```

---

### Task 2: 战线指示器 —— 薄渲染器 + 点击守卫

把 Task 1 的布局变成 Phaser 对象；**同时修 `handleClick` 顶部中央穿透**（否则点指示器会误选单位）。

**Files:**
- Create: `src/render/frontline/index.ts`（`createFrontline`，返回 `{sync, layout, destroy}`，与 `createHud` 同形）
- Modify: `src/render/scenes/BattleScene.ts`（create 里挂 frontline、`layout()` 里调、`update` 里 sync；**扩展 `handleClick` 守卫**）

**Interfaces:**
- `createFrontline(scene, side, world?) => { sync(world), layout(w,h), destroy() }`

- [ ] **Step 1: 写点击守卫测试**

`handleClick` 是场景私有方法，抽出一个 Phaser-free 的 `shouldIgnoreTopCenter(pointerX, pointerY, viewportW, viewportH)` 到 `render/frontline/layout.ts`（或 `render/` 下新 `clickGuard.ts`），单测断言：
- 顶部中央（指示器正下方）→ `true`（忽略）
- 顶部左右各 240px 内 → `true`（旧行为保留）
- 中部空地 → `false`
- 底部 HUD → `true`

Run: `npx vitest run src/render/<clickguard or frontline>/*.test.ts`
Expected: 守卫新分支 FAIL，旧分支 PASS

- [ ] **Step 2: 实现 `clickGuard` 纯函数 + 渲染器**

`shouldIgnoreTopCenter` 用指示器矩形的**实际宽**（视口 40% 居中）判定，而非旧的固定 240px；`handleClick` 改为调用它。渲染器用 `Graphics` 画桶条 + `Text` 空，全部 `setScrollFactor(0)` 高 depth。

- [ ] **Step 3: 接进 `BattleScene`**（create/layout/update 三处，遵循 hud 的三态）

- [ ] **Step 4: `npx tsc --noEmit` + 相关测试 + 全量 `npm test`**（确认行为未变）

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(frontline): thin renderer + top-center click guard

Indicator reserved the top-center of the viewport but handleClick only
guarded the left/right 240px, so a click on the indicator leaked through
and (de)selected units. Route selection through a pure guard tested on
boundaries."
```

> **肉眼项（记录，不阻塞）：** 窗口缩放 + 相机滚动下指示器位置、矿工不出现在直方图——浏览器验。

---

### Task 3: i18n —— LOCALES + setLocale + 补键 + 修 label0

加 locale 概念与切换机制（**不写英文**），补齐缺失键，修姿态按钮 `label0` 缓存缺陷。

**Files:**
- Modify: `src/i18n/index.ts`（`LOCALES` 注册表、`currentLocale`、`setLocale(id)`、`t()` 改走当前表）
- Modify: `src/i18n/zh-CN.ts`（补键）
- Modify: `src/render/hud/index.ts`（`label0` 缺陷：姿态按钮 label 改在 `sync` 刷新，不再只设一次）
- Test: `src/i18n/index.test.ts`（**新建**）

**Interfaces:**
- `LOCALES: Record<string, {id, table}>`（当前仅 `zh-CN`）
- `setLocale(id: string): boolean`（未知 id 返回 false，不动当前表）
- `t(key)` 仍签名不变，但查**当前 locale 的表**

- [ ] **Step 1: 写失败测试**

`i18n/index.test.ts`：
- `t('level.endless.name')` **不等于** 键本身（当前缺失会返回裸键 → FAIL）
- 覆盖测试：遍历 `LEVELS` 每个 `levelId`，断言 `level.<id>.name` 键存在（`t` 不返回键本身）—— 这是防止未来再加关卡时漏键的**常备护栏**
- `setLocale('zh-CN')` 返回 true；`setLocale('xx-XX')` 返回 false 且当前表不变

Run: `npx vitest run src/i18n/index.test.ts`
Expected: FAIL（`level.endless.name` 缺失 + `setLocale` 不存在）

- [ ] **Step 2: 实现**

`zh-CN.ts` 补：`level.endless.name`、`ui.wave`（HUD 波次标签）、`result.best`（结算最高波次）。`index.ts` 建 `LOCALES` + `currentLocale` + `setLocale`，`t()` 查当前表。

- [ ] **Step 3: 修 `label0` 缺陷**

`hud/index.ts`：姿态按钮不再 `label.setText(b.label0)` 一次性；改为在 `sync(world)` 里每帧 `setText(t(key))`（或提供 `refreshStaticLabels()`，resize/locale 变化时调）。加一条测试：构造后切换「语言源」，姿态 label 会更新。

> 注：语言表当前只有一份，切换不可见的表现差异只在键存在性上；**测试的是机制**（label 跟随 `t()` 结果变化），不是英文文案。

- [ ] **Step 4: `npx tsc --noEmit` + `npm test`**

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(i18n): LOCALES registry + setLocale, fix cached label0

Add the locale concept (single zh-CN table for now, no English copy).
Fix the stance buttons caching label0 at build and never refreshing on
locale change. Guard test asserts every LEVELS id has a level.<id>.name
key so endless no longer shows its raw key."
```

---

### Task 4: 存档 —— schema + 容错读（纯逻辑）

`localStorage` 存/取，带版本号，**读取容错**（损坏/版本不符静默回落）。纯逻辑可打桩测试。

**Files:**
- Create: `src/save/storage.ts`
- Test: `src/save/storage.test.ts`

**Interfaces（Task 5 会用）:**
- `SAVE_KEY = 'stick-war-web:save'`
- `SaveData = { version: 1, furthestLevel: number, endlessBestWave: number, speedPreference: 1|2|4 }`
- `DEFAULT_SAVE: SaveData`
- `loadSave(storage): SaveData`（任何异常/缺字段/版本不符 → 合并回默认值，**不抛**）
- `saveGame(storage, data): void`（`JSON.stringify` + try/catch，隐私模式下不崩）
- `advanceFurthestLevel(cur, wonLevelIdx, won: boolean): number`（纯函数：仅 `won` 时推进到 `max`）
- `recordBestWave(cur, wave): number`（纯函数：`max`）

- [ ] **Step 1: 写失败测试**（用 `globalThis.localStorage` 打桩或内存 Map）

- 不存在键 → `loadSave` 返回 `DEFAULT_SAVE`
- 损坏 JSON（`{`）→ 返回默认，**不抛**
- `version: 999` → 返回默认（版本不符静默回落）
- 缺某字段（无 `speedPreference`）→ 该字段回落默认、其余保留
- `advanceFurthestLevel(1, 2, true) === 2`；`advanceFurthestLevel(1, 2, false) === 1`；`advanceFurthestLevel(3, 1, true) === 3`（不回退）
- `recordBestWave(12, 8) === 12`；`recordBestWave(12, 20) === 20`

Run: `npx vitest run src/save/storage.test.ts`
Expected: FAIL（模块缺失）

- [ ] **Step 2: 实现 `storage.ts`**（读路径 try/catch 包整段；写路径 try/catch；`loadSave` 逐字段合并默认）

- [ ] **Step 3: `npx tsc --noEmit` + 测试**

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(save): versioned localStorage schema with tolerant read

Single key stick-war-web:save {version,furthestLevel,endlessBestWave,
speedPreference}. Reads tolerate corruption / version mismatch / missing
fields (silent fallback, never throw); writes are try/caught (private
mode). Decision helpers are pure and tested."
```

---

### Task 5: 无尽 HUD/结算适配 + 存档接线

无尽模式：HUD 显示**当前波次**，结算显示「撑到第 N 波 + 历史最高」。接存档：开局读速度偏好，赢时推进关卡进度，无尽败时写最高波次。

**Files:**
- Modify: `src/render/hud/layout.ts`（`waveText(world): string`——仅无尽时非空，纯函数）
- Modify: `src/render/hud/index.ts`（渲染波次行）
- Modify: `src/render/result/layout.ts`（`resultSubtitle` 无尽分支：追加 `无尽模式 · 波次 N · 最高 M`）
- Modify: `src/render/result/index.ts`（传入 `wave`/`bestWave`）
- Modify: `src/render/scenes/BattleScene.ts` + `BootScene.ts`（接线：读存档→初始速度/起始关卡；`update` 判定结束→按 outcome 写存档）

**Interfaces:**
- `waveText(world): string`（`world.endless ? t('ui.wave') + ' ' + world.waveIndex : ''`）
- `resultSubtitle(levelId, ticks, extra?: {wave, bestWave})`（无尽时追加段；非无尽完全不变，向后兼容）

- [ ] **Step 1: 写失败测试**

- `waveText`：非无尽 → `''`；无尽 `waveIndex=8` → `t('ui.wave') + ' 8'`
- `resultSubtitle` 无尽分支：包含 `波次 8` 与 `最高 12`（用传入的 `wave`/`bestWave`）；**非无尽调用（不传 extra）输出与现状逐字节相同**（回归护栏）
- HUD 渲染波次：`sync` 后无尽世界波次行可见、非无尽隐藏（用 `layout.ts` 纯函数测，不依赖 Phaser）

Run: `npx vitest run src/render/hud src/render/result`
Expected: 新分支 FAIL，旧断言 PASS

- [ ] **Step 2: 实现**

`resultSubtitle` 保留现签名并在无尽时追加段；`waveText` 纯函数；场景接线读 `loadSave`（速度偏好作为初始 `this.speed`，起始关卡用 `furthestLevel`），结束判定处按 `outcome` 调 `advanceFurthestLevel` / `recordBestWave` 后 `saveGame`。

- [ ] **Step 3: 浏览器验（记录不阻塞）**

无尽局：HUD 顶部/资源区显示「波次 N」；结算副标题含「撑到第 N 波 · 最高 M」；「下一关」按钮在无尽（末项）显示「返回第一关」（现状已对，无需改）。

- [ ] **Step 4: `npx tsc --noEmit` + 全量 `npm test` + `npm run lint`**

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(endless+save): HUD wave, result best-wave, save wiring

Endless HUD shows the current wave (its score); the result subtitle
appends wave reached + best wave. Save loads initial speed + starting
level and records furthest level on win / best wave on endless loss."
```

---

### Task 6: dev-only FPS 标签

FPS 计数追加到既有 tick 标签，**仅 `import.meta.env.DEV` 显示**（生产不出现）。

**Files:**
- Modify: `src/render/scenes/BattleScene.ts`（`tickLabel` 追加 fps，仅 dev）

- [ ] **Step 1: 实现**

在 `update` 里用 `delta` 累积估算 fps（`1000/delta` 平滑，或用 `this.clock`）；`import.meta.env.DEV` 为真时把 `fps ~N` 拼进 `tickLabel`，否则不显示该段。**不新增可判定逻辑，纯渲染装饰，无单测要求**（但 `npx tsc` 必须过，且 build 后确认生产不含 FPS 段）。

- [ ] **Step 2: `npx tsc --noEmit` + `npm run build`**（确认 DEV 判定被 Vite 正确常量折叠）

- [ ] **Step 3: 提交**

```bash
git commit -m "feat(hud): dev-only FPS readout on the tick label

Appended to the existing tick label, gated on import.meta.env.DEV so the
production build shows no FPS. Performance acceptance itself is measured
externally via Playwright (S3), not by this counter."
```

---

### Task 7: M5b 收尾验收

- [ ] **Step 1: 全量 `npm test`**（所有既有测试保持绿，尤其 `level-1-regression`、`level-winnable`（276s）、`counter-relations`）
- [ ] **Step 2: `npx tsc --noEmit && npm run lint && npm run build`**
- [ ] **Step 3: 浏览器验收**（记录，肉眼项）：指示器随缩放/相机正确、矿工不入直方图、点击指示器不误选、无尽 HUD 波次、结算最高波次、刷新后从最远关卡/速度偏好恢复、localStorage 手改坏值不崩
- [ ] **Step 4: 更新 `AGENTS.md`**：M5b 勾选、追加「M5b 已交付」小节；M5c（音效+部署）记为待做（需 grilling + remote）
- [ ] **Step 5: 合并/提交到 `master`**（本里程碑纯渲染/i18n/存档层，若团队流程要求仍走分支则按 spec §10.2 的 `main`/`master` 现状对齐——**当前分支是 `master`**，如实记录）

---

## 执行纪律（TDD，来自 M5a 的教训）

1. 每个任务：**先写会失败的测试**，看着它红，再实现转绿。测试必须**真的能失败**（本项目多次因此揪出「注释说谎」）。
2. `npx tsc --noEmit` 每个任务收尾都跑（Vitest 不做类型检查）。
3. **不碰 `src/sim/`**：本批无 `hashWorld` 风险，但也意味着**不能用「行为哈希不变」来验收**——验收靠既有回归测试保持绿 + 新增渲染/i18n/存档单测。
4. 每处肉眼项**如实记录**，不假装完成（M5c 音效/部署同理）。
