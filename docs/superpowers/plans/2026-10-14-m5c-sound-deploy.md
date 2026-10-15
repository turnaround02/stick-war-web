# M5c 实施计划：程序化音效与部署（2026-10-14）

> 设计访谈已完成（12 项决策，见 §A）。本文件是 M5c 的实施计划，逐任务 TDD 落地。
> **范围锁定**：音频全部落在 `render/`、新增 `save/` 不动、不碰 `sim/`（→ 零 `hashWorld` 风险，
> 关卡 1 指纹 / 关卡 2 276s / `counter-relations` 全部应保持绿）。部署只写 `.github/workflows/deploy.yml`
> 工件，**不 push、不验证**（无 remote，spec §11 原话「如实记为未做」）。

---

## A. 已定决策（设计访谈 Q1–Q12）

| # | 决策 | 结论 |
|---|---|---|
| Q1 | 检测器调用点 | 每个 tick 边界一次（随 `advanceWorld` 之后，传 prev/cur 两快照）；1x/4x 行为一致（批处理无关） |
| Q2 | 并发策略 | 全部事件发声 + **每 tick 发声上限 8**（防密集交战爆音） |
| Q3 | 音色种类 | **严格 6 种**，不细分近战/远程命中（spec §13 Q14 钦定） |
| Q4 | 首次输入 | 任意 `keydown` 或 `pointerdown` 首击 → 建 `AudioContext`；锁定后不再处理 |
| Q5 | 暂停/结算静默 | `ctx.suspend()`（冻结已发声）+ 事件门控（`muted` 时纯函数返回空事件表）双保险；恢复 `ctx.resume()` |
| Q6 | 部署交付物 | 只写 `.github/workflows/deploy.yml`，不 push、不验证，AGENTS.md / spec §11 记「未做（工件已就绪）」 |
| Q7 | 挥砍/命中粒度 | 各自独立事件，**同 tick 可共存**（近战在 windup 归 0 tick 同时出「挥砍」+「命中」；远程只在箭矢落地 tick 出「命中」） |
| Q8 | 金币触发口径 | 仅「金增加」发声；初始金在 World 构造时写好、无 prev 对比，差分天然免疫 |
| Q9 | 基地受损触发 | 每次 hp 下降发声（与 Q2 上限统一，检测器不背限流状态） |
| Q10 | 上限取哪 8 个 | **固定优先级截断**：命中 > 挥砍 > 死亡 > 基地受损 > 造兵完成 > 金币入账；可测 |
| Q11 | 音色配方 | 按 §C 配方表（常量，听觉不是断言对象，测试钉的是检测器） |
| Q12 | Pages workflow | `actions/deploy-pages` + `upload-pages-artifact` 官方工件流，文件名 `deploy.yml`，触发 `master` |

**六个事件种类**（`SfxKind`，严格 6 种）：

```ts
export type SfxKind =
  | 'swing'        // 挥砍（近战出刀帧 / 弓弦拉满帧）
  | 'hit'          // 命中（伤害落地：近战=出刀帧，远程=箭矢落地帧）
  | 'death'        // 死亡（state → 'dead'）
  | 'gold'         // 金币入账（gold[side] 增加）
  | 'training'     // 造兵完成（nextUnitId 增加，出单位）
  | 'base'         // 基地受损（bases[side].hp 下降）;
```

**优先级（Q10，上限 8 时保留顺序）**：`hit > swing > death > base > training > gold`。

---

## B. 架构与文件布局（照 `ghost.ts` / `frontline/layout.ts` 的形状）

```
src/render/sound/
  detect.ts        纯函数：diffSfx(prev, cur) → SfxEvent[]（§C 全部口径）
  detect.test.ts   检测器单测（每个事件种类正/负例 + 上限截断 + 优先级）
  recipes.ts       纯常量：6 种音色的 WebAudio 配方（§C 表）
  sfx.ts           薄渲染器：AudioManager（建 AudioContext、解锁、suspend/resume、按事件表发声）
                   仅 SFX.ts 有 Phaser/浏览器依赖，其余零依赖
```

`src/render/scenes/BattleScene.ts` 接线（薄）：
- 持有 `prevSnapshot` 与 `AudioManager`
- 首次 `keydown`/`pointerdown` → `audio.unlock()`
- 暂停 / `decided` → `audio.setMuted(true)`；恢复 → `false`
- 每个 tick 边界（`ticks > 0`，与 `spawnGhost` 同形）：`events = diffSfx(prev, cur)`；
  `audio.play(events)`（`muted` 时 `play` 内部读 `muted` 直接 no-op，检测器仍正常跑但被门控）

> **为什么检测器可以零 `World` 字段改动、零 `hashWorld` 风险**：`diffSfx` 入参是
> **两个 `World` 快照的浅引用**（渲染层已有 prev 快照先例——`ghost.ts` 按 id 差分、
> `frontline` 读 `world.units`），只读现有字段（`units`、`gold`、`bases`、`nextUnitId`、`tick`），
> 不写回、不加字段。`prev` 是上一 tick 的 `World` 对象引用（`advanceWorld` 返回的 `this.world`
> 每 tick 后自增），渲染层只需在每次 tick 后把 `this.world` 存为 `prev`、下一 tick 前差分。

**确定性铁律核对**：检测器是**纯函数**（同 prev/cur → 同事件表），无 `Math.random`、
无 `Date.now`；音频发声本身在渲染层，不进 sim、不进 `hashWorld`。

---

## C. 音色配方表（`recipes.ts` 常量，Q11）

| 音色 | 合成配方 | 时长 | 说明 |
|---|---|---|---|
| `swing`  | 噪声脉冲，低通 800Hz，快速指数衰减 | ~80ms | 出刀 / 拉弓 |
| `hit`    | 低频 thump：正弦 120→60Hz 滑降 + 短噪声 | ~120ms | 命中肉感 |
| `death`  | 更重 thump：80→40Hz，略长 | ~200ms | 倒地 |
| `gold`   | 短「叮」：方波 1200→2000Hz，双音上跳 | ~150ms | 入账清脆 |
| `training` | 闷「咚」：低通 300Hz 单音 | ~180ms | 出兵完成 |
| `base`   | 持续 rumble：低通 150Hz 噪声 + 颤动（LFO） | ~400ms | 基地受创 |

> 参数是打击感起点，非测试对象；测试钉的是检测器事件与上限。后续可微调（spec §10.2 第 8 条预期「必要时替换」）。

---

## D. 检测器口径（`detect.ts`，逐条可测）

`SfxEvent = { kind: SfxKind; side: Side }`。`diffSfx(prev: World, cur: World): SfxEvent[]`：

1. **swing（挥砍）**：`cur` 中近战单位（`UNITS[u.typeId].attackType === 'melee'`）
   且 `u.state === 'attack'` 且 `u.windupTicksLeft === 0` 且**该 tick 刚出刀**
   （`prev` 中同 id 单位 `windupTicksLeft > 0` 而 `cur === 0`）。远程单位出刀帧
   也发 `swing`（弓弦拉满音色同「挥砍」类），口径相同，按单位逐 tick 比对。
2. **hit（命中）**：
   - 近战：与 swing 同 tick，若**伤害实际落地**（`cur.stats[u.side].damageDealt > prev`
     且目标为存活单位/基地）→ 出 `hit`。（简化：近战 hit 与 swing 同 tick 绑定，
     但受 Q7「同 tick 可共存」约束——出刀即命中，故同 tick 同时发 swing+hit。）
   - 远程：`cur.projectiles` 中 `ticksToImpact` 本 tick 归 0（`prev` 中同 id `>0`）→ 出 `hit`。
3. **death（死亡）**：`cur` 中 `state === 'dead'` 且 `prev` 同 id `state !== 'dead'`（本 tick 新标死）。
4. **gold（金币）**：`cur.gold[side] > prev.gold[side]`。
5. **training（造兵）**：`cur.nextUnitId > prev.nextUnitId`（出单位；`nextUnitId` 是全局递增，
   差分即「本 tick 有新单位出生」）。
6. **base（基地受损）**：`cur.bases[side].hp < prev.bases[side].hp`。

**上限（Q2/Q10）**：事件表按优先级（§A）稳定排序后**截断到 8**；超出的低优先级丢弃。
截断是纯函数可测行为（「给 12 个事件 → 断言保留的是哪 8 个」）。

> **注意 `prev` 的稳定性**：渲染层每 tick 存 `prev = this.world`（引用），下一 tick
> `advanceWorld` 会**原地变更** `this.world`（sim 是原地推进，非拷贝）。所以 `prev`
> 必须是**上一 tick 结束时的深拷贝快照**（仅快照检测器要读的字段：
> 各 unit 的 `id/state/windupTicksLeft/typeId`、`gold`、`bases.hp`、`nextUnitId`、`projectiles` 的
> `id/ticksToImpact`）。`prev` 快照构造是纯函数（§E 测试覆盖），否则原地推进会让 prev===cur 永远无差分。

---

## E. 任务分解（逐任务 TDD：先写失败测试 → 实现 → tsc/lint/vitest 全绿 → commit）

- **T1** `detect.ts` + `recipes.ts`：纯函数 + 常量。测试：`detect.test.ts` 覆盖 §D 六类事件
  正/负例、`prev` 深拷贝口径、上限 8 截断与优先级排序（给 12 事件断言保留 8 个的精确组成）。
- **T2** `sfx.ts` `AudioManager`：薄渲染器。可测部分抽纯：`shouldCreateContext`（未解锁 false）、
  `eventsForMuted`（muted → `[]`，非 muted → 原表）。浏览器 `AudioContext` 本身不测（node 无），
  但「muted 时不发声」「未解锁不建 ctx」这两条规则抽成纯判定并测试。
- **T3** `BattleScene` 接线：首次输入解锁、暂停/结算静默、tick 边界 diff+play、prev 快照维护。
  （依赖 Phaser，node 测不了 → 规则已由 T1/T2 纯函数覆盖，接线层只做「把结果变成对象」。）
  浏览器验收（肉眼）：首次点击前有击打声/静音 → 点击后有声；暂停/结算静默；1x/4x 一致。
- **T4** 部署工件 `.github/workflows/deploy.yml`：`on: push: branches: [master]` +
  build → `actions/upload-pages-artifact` → `actions/deploy-pages`。不 push、不验证。
- **T5** 收尾：AGENTS.md「M5c 已交付/未做」小节 + spec §11 M5c 验收条目更新（音效已做、
  部署记「未做（工件已就绪，无 remote）」）；`npm test` / `tsc` / `lint` / `build` 全绿。

---

## F. 验收标准（客观）

- **音效**：① 首次输入前**不创建** `AudioContext`（`shouldCreateContext` 未解锁返回 false，浏览器实测）
  ② 暂停与结算时**静默**（`ctx.suspend()` + 事件门控，浏览器实测）③ 检测器 T1 全绿，
  上限 8 截断与优先级有测试钉死。
- **部署**：`deploy.yml` 语法正确（可本地 `actionlint` 或 push 后由 GitHub 校验；本次**不 push**，
  记「未做（工件已就绪）」。
- **回归**：不碰 `sim/`，关卡 1 指纹 / 关卡 2 276s / `counter-relations` 全绿。
