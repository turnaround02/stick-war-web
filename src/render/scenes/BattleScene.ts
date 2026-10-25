import Phaser from 'phaser';
import { TICKS_PER_SEC, WORLD_WIDTH } from '../../data/constants';
import { CAMPAIGN_SEED, LAST_CAMPAIGN_INDEX, LEVELS } from '../../data/levels';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { UnitTypeId } from '../../data/units';
import { CommandQueue, KeyState, setStance as cmdSetStance, train as cmdTrain } from '../../input/desktop';
import { PanTracker, PinchTracker } from '../../input/gestures';
import { t } from '../../i18n';
import { advanceFurthestLevel, browserStorage, loadSave, recordBestWave, saveGame, type SaveData } from '../../save/storage';
import { createWorld } from '../../sim/createWorld';
import type { MatchConfig, Side, Stance, Unit, UnitState, World } from '../../sim/types';
import { clampScrollX, clampZoom, EDGE_SCROLL_MARGIN } from '../camera';
import { createHud, type Hud } from '../hud';
import { stunRingFor, STUN_RING_COLOR, STUN_RING } from '../hud/stun-ring';
import { createResultOverlay, type ResultOverlay } from '../result';
import { createFrontline, type Frontline } from '../frontline';
import { shouldIgnoreClick } from '../clickGuard';
import {
  confirmPanelRect,
  confirmButtonRects,
  confirmTitle,
  confirmYesLabel,
  confirmNoLabel,
} from '../confirm/layout';
import { Selection, selectedIdsOf } from '../selection';
import { FixedTimestep, advanceWorld, type GameSpeed } from '../timestep';
import { spawnGhost } from '../ghost';
import { createProjectileLayer, type ProjectileLayer } from '../projectile';
import { createStickman, stickmanHipHeight, type Stickman } from '../stickman/skeleton';
import { attackPhase } from '../stickman/poses';
import {
  createAudioManager,
  shouldCreateContext,
  type AudioUnlockEvent,
} from '../sound/sfx';
import { diffSfx, snapshotWorld, type SfxSnapshot } from '../sound/detect';

/** Ground sits this fraction down the viewport, leaving the lower third empty (spec §7.2). */
const GROUND_FRACTION = 2 / 3;

/** Loop length per state, in ticks, for the states that cycle. */
const STATE_CYCLE_TICKS: Partial<Record<UnitState, number>> = {
  idle: 60,
  move: 24,
  gather: 30,
};

/**
 * Owns the Phaser side of the game: camera, drawing, and the fixed-timestep
 * driver. Reads sim state every frame and NEVER writes to it (spec §3.1).
 */
export class BattleScene extends Phaser.Scene {  private world!: World;
  private groundLine!: Phaser.GameObjects.Graphics;
  private groundY = 0;
  private stickmen = new Map<number, Stickman>();
  private timestep = new FixedTimestep();
  private tickLabel!: Phaser.GameObjects.Text;
  private projectiles!: ProjectileLayer;

  private commands = new CommandQueue();
  private keys = new KeyState();
  private selection = new Selection();
  private selectedMarker!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private result!: ResultOverlay;
  private frontline!: Frontline;
  private speed: GameSpeed = 1;
  private paused = false;
  /** Ticks simulated this match, for the result screen's "time taken". */
  private elapsedTicks = 0;

  /** The browser save, read at match start and written on a decided match. */
  private readonly saveStorage = browserStorage();
  private saveData: SaveData = loadSave(this.saveStorage);
  /** True once this match's result has been written, so update() writes once. */
  private resultRecorded = false;
  /** Smoothed frames-per-second, shown on the tick label in dev builds only. */
  private fps = 0;

  /** Which level is loaded, and with which seed. Set by init(). */
  private config: MatchConfig = LEVELS[0];
  private seed = CAMPAIGN_SEED;
  private levelIndex = 0;

  /**
   * M5c SFX (spec §7.4). The `AudioContext` is created lazily on the FIRST
   * key/pointer input (Q4), so this array records the input stream and the
   * pure `shouldCreateContext` decides when to unlock. The `prev` snapshot is
   * captured at the END of each tick, before `advanceWorld` mutates the world
   * in place — `diffSfx(prev, cur)` is then the set of sounds that played
   * this tick. `per-tick cap` and the `muted` gate are both in the detector
   * / pure-decision helpers, never here.
   */
  private audio = createAudioManager();
  private readonly sfxUnlockEvents: AudioUnlockEvent[] = [];
  private sfxUnlocked = false;
  /** Previous-tick world snapshot for `diffSfx`. Set in create() to the
   *  initial world so the first tick can be diffed. */
  private sfxPrev: SfxSnapshot | null = null;

  /**
   * Named so it can be detached on shutdown.
   *
   * This listener lives on the GAME-level emitter, which Phaser does not clear
   * when a scene shuts down — `Systems.shutdown` only clears the scene's own
   * emitter. Phaser's own input plugins do call `removeAllListeners()` on
   * shutdown, so theirs are fine; an anonymous arrow here would leak one
   * listener per restart and keep a dead scene's KeyState reachable.
   */
  private readonly onWindowBlur = (): void => this.keys.clear();

  /** Last known appearance per unit, so a ghost can be spawned after removal. */
  private lastTypeId = new Map<number, UnitTypeId>();

  /**
   * Touch/drag camera gestures (M9). Pointer events fire for mouse too, so a
   * mouse drag pans as a side effect; keyboard / wheel / edge-scroll keep
   * working exactly as before. The trackers are Phaser-free (`input/gestures`)
   * and asserted there; here they only drive `cam.scrollX` / `setZoom`.
   */
  private pan = new PanTracker();
  private pinch = new PinchTracker();
  /** How many pointers are currently down (1 = pan candidate, 2 = pinch). */
  private downPointers = 0;
  private lastFacing = new Map<number, 1 | -1>();

  constructor() {
    super({ key: 'Battle' });
  }

  /**
   * Receives the level to play. Phaser calls this before `create()`, and again
   * on every `scene.restart(data)`, which is how "replay" and "next level"
   * load a different match without a global registry value.
   *
   * Absent data falls back to the first level, so `scene.start('Battle')` from
   * BootScene needs no change.
   */
  init(data?: { config?: MatchConfig; seed?: number }): void {
    this.config = data?.config ?? LEVELS[0];
    this.seed = data?.seed ?? CAMPAIGN_SEED;
    this.levelIndex = Math.max(0, LEVELS.indexOf(this.config));
  }

  create(): void {
    // Scene.restart() reuses this instance, so every mutable field must be
    // reset here. Without this, pressing R after pausing starts the new match
    // still paused, and stale selection/keys survive into it.
    this.world = createWorld(this.config, this.seed);
    this.timestep = new FixedTimestep();
    this.commands = new CommandQueue();
    this.keys = new KeyState();
    this.selection = new Selection();
    // Start at the saved speed preference; the HUD highlights it below.
    this.saveData = loadSave(this.saveStorage);
    this.speed = this.saveData.speedPreference;
    this.resultRecorded = false;
    this.paused = false;
    this.elapsedTicks = 0;
    this.stickmen.clear();
    this.lastTypeId.clear();
    this.lastFacing.clear();

    // M5c: reset SFX state for the new match. The AudioContext itself persists
    // across restarts (re-creating it per match would be wasteful and could
    // lose the unlocked state); only the per-match diff window resets.
    this.sfxUnlockEvents.length = 0;
    this.sfxUnlocked = false;
    this.sfxPrev = snapshotWorld(this.world);
    // M7b: seed the gate from the saved preference — not a hard `false`, which
    // would unmute a user who turned sound off in the menu. The per-frame
    // update() call keeps this authoritative from the first frame on.
    this.audio.setMuted(this.saveData.sfxMuted);

    this.groundLine = this.add.graphics();
    this.projectiles = createProjectileLayer(this);
    this.selectedMarker = this.add.graphics().setDepth(6);

    this.hud = createHud(this, 'player', {
      onTrain: (typeId: UnitTypeId) => this.commands.push(cmdTrain('player', typeId)),
      onStance: (stance: Stance) => this.pushStanceToAll(stance),
      onSpeedChange: (speed: GameSpeed) => {
        this.speed = speed;
        this.hud.setSpeed(speed);
        // Persist the preference so the next match opens at the same speed.
        this.saveData = { ...this.saveData, speedPreference: speed };
        saveGame(this.saveStorage, this.saveData);
      },
      onTogglePause: () => this.togglePause(),
      onMenu: () => this.showMenuConfirm(),
    });
    // Highlight the initial speed so the buttons do not all look inactive on load.
    this.hud.setSpeed(this.speed);
    this.hud.setPaused(this.paused);
    this.result = createResultOverlay(this, {
      onReplay: () => this.replay(),
      onNextLevel: () => this.goToNextLevel(),
      onMenu: () => this.goToMenu(),
    });

    this.frontline = createFrontline(this);
    this.buildMenuConfirm();

    this.syncStickmen();
    this.layout();
    this.setupInput();

    this.tickLabel = this.add
      .text(12, 44, '', { fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b2' })
      .setScrollFactor(0)
      .setDepth(1000);

    const onResize = () => this.layout();
    this.scale.on('resize', onResize);
    // Scene restart would otherwise stack a second listener and leak this one.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', onResize);
      this.game.events.off(Phaser.Core.Events.BLUR, this.onWindowBlur);
      this.hud.destroy();
      this.result.destroy();
      this.frontline.destroy();
      for (const o of this.menuConfirm.all) o.destroy();
      this.audio.destroy();
    });

    // R replays the CURRENT level. A bare `restart()` would drop the level and
    // send the player back to level 1 from level 2.
    this.input.keyboard?.on('keydown-R', () => this.replay());
  }

  /** Restarts the current level from the beginning. */
  private replay(): void {
    this.scene.restart({ config: this.config, seed: this.seed });
  }

  /** Loads the next level, wrapping back to the first after the last. */
  private goToNextLevel(): void {
    const next = LEVELS[(this.levelIndex + 1) % LEVELS.length];
    this.scene.restart({ config: next, seed: this.seed });
  }

  /** Returns to the level-select menu (M7). The menu re-reads the save. */
  private goToMenu(): void {
    this.scene.start('Menu');
  }

  // ── In-game "return to menu?" confirm (M8) ────────────────────────
  // Returning discards the running match (no in-progress state is stored),
  // so the HUD's menu button opens this guard instead of acting directly.

  /** True while the confirm overlay is showing; blocks pause/tick underneath. */
  private menuConfirmOpen = false;
  private menuConfirm!: {
    dim: Phaser.GameObjects.Rectangle;
    panel: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.Text;
    yes: { rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
    no: { rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
    /** Everything that shows/hides/destroys together. */
    all: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text>;
  };

  /** Builds the (hidden) overlay once per scene instance. */
  private buildMenuConfirm(): void {
    const OVERLAY_DEPTH = 2000;
    const dim = this.add
      .rectangle(0, 0, 0, 0, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH)
      .setVisible(false)
      .setInteractive(); // swallow clicks over the battlefield

    const panel = this.add
      .rectangle(0, 0, 0, 0, 0x141821, 0.96)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 1)
      .setVisible(false);

    const title = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '16px', color: '#e8edf4' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 2)
      .setVisible(false);

    const makeButton = (color: number, onClick: () => void) => {
      const rect = this.add
        .rectangle(0, 0, 10, 10, color)
        .setScrollFactor(0)
        .setDepth(OVERLAY_DEPTH + 2)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      rect.on('pointerdown', onClick);
      const label = this.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '15px', color: '#e8edf4' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(OVERLAY_DEPTH + 3)
        .setVisible(false);
      return { rect, label };
    };

    const yes = makeButton(0x7a3b3b, () => this.goToMenu());
    const no = makeButton(0x2f3a4a, () => this.hideMenuConfirm());

    this.menuConfirm = {
      dim,
      panel,
      title,
      yes,
      no,
      all: [dim, panel, title, yes.rect, yes.label, no.rect, no.label],
    };
  }

  private showMenuConfirm(): void {
    this.menuConfirmOpen = true;
    const { width, height } = this.scale;
    for (const o of this.menuConfirm.all) o.setVisible(true);
    this.menuConfirm.title.setText(confirmTitle());

    const p = confirmPanelRect(width, height);
    this.menuConfirm.panel.setPosition(p.x + p.w / 2, p.y + p.h / 2);
    this.menuConfirm.panel.setSize(p.w, p.h);
    this.menuConfirm.dim.setSize(width, height);
    this.menuConfirm.title.setPosition(p.x + p.w / 2, p.y + 46);

    const b = confirmButtonRects(width, height);
    this.menuConfirm.yes.rect.setPosition(b.yes.x + b.yes.w / 2, b.yes.y + b.yes.h / 2);
    this.menuConfirm.yes.rect.setSize(b.yes.w, b.yes.h);
    this.menuConfirm.yes.label
      .setPosition(b.yes.x + b.yes.w / 2, b.yes.y + b.yes.h / 2)
      .setText(confirmYesLabel());
    this.menuConfirm.no.rect.setPosition(b.no.x + b.no.w / 2, b.no.y + b.no.h / 2);
    this.menuConfirm.no.rect.setSize(b.no.w, b.no.h);
    this.menuConfirm.no.label
      .setPosition(b.no.x + b.no.w / 2, b.no.y + b.no.h / 2)
      .setText(confirmNoLabel());
  }

  private hideMenuConfirm(): void {
    this.menuConfirmOpen = false;
    for (const o of this.menuConfirm.all) o.setVisible(false);
  }

  /** The label for the "next" button: another level, or back to the start. */
  private nextButtonLabel(): string {
    return this.levelIndex >= LEVELS.length - 1 ? t('result.restartCampaign') : t('result.next');
  }

  /** Wires keyboard, pointer and wheel to input state and the command queue. */
  private setupInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown', (e: KeyboardEvent) => {
        // Browsers auto-repeat held keys; without this, holding Space flickers
        // pause and holding R restarts every repeat.
        if (e.repeat) return;

        // M5c Q4: the first real input unlocks audio. We record the event; the
        // pure `shouldCreateContext` is checked every frame so the very first
        // tick after this input creates the context exactly once.
        this.sfxUnlockEvents.push({ type: 'keydown' });

        this.keys.update(e.code, true);
        // Stance hotkeys act on the SELECTION; with nothing selected they fall
        // back to the whole army, which is what the Q/W/E muscle memory wants.
        if (e.code === 'KeyQ') this.pushStance('advance');
        if (e.code === 'KeyW') this.pushStance('hold');
        if (e.code === 'KeyE') this.pushStance('retreat');
        if (e.code === 'Space') this.togglePause();
      });
      kb.on('keyup', (e: KeyboardEvent) => this.keys.update(e.code, false));
    }

    // A key released while the window is unfocused never fires keyup, so the
    // camera would scroll forever. Clearing on blur is the cheap fix.
    // Registered via a named handler so SHUTDOWN can detach it; see the field.
    this.game.events.on(Phaser.Core.Events.BLUR, this.onWindowBlur);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // M5c Q4: a pointer press is also a first-input unlock.
      this.sfxUnlockEvents.push({ type: 'pointerdown' });

      // M9: track multi-touch. The SECOND pointer down starts a pinch (and
      // cancels any pan); the first one drives the pan otherwise.
      this.downPointers += 1;
      if (this.menuConfirmOpen) {
        // Overlay owns the screen; still count the pointer so up/down balance.
        return;
      }
      if (this.downPointers === 2) {
        this.pinch.start(this.pointerDistance());
        this.pan.release();
      } else if (this.downPointers === 1) {
        this.pan.press(p.x);
      }

      this.handleClick(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.menuConfirmOpen) return;
      if (this.downPointers === 2 && this.pinch.active) {
        const delta = this.pinch.move(this.pointerDistance());
        if (delta !== 0) {
          const cam = this.cameras.main;
          cam.setZoom(clampZoom(cam.zoom + delta));
          this.clampCamera();
        }
        return;
      }
      if (this.downPointers === 1) {
        const delta = this.pan.drag(p.x);
        if (delta !== 0) {
          const cam = this.cameras.main;
          cam.setScroll(cam.scrollX + delta / cam.zoom, cam.scrollY);
          this.clampCamera();
        }
      }
    });
    const endPointer = () => {
      this.downPointers = Math.max(0, this.downPointers - 1);
      if (this.downPointers < 2) this.pinch.release();
      if (this.downPointers === 0) this.pan.release();
    };
    this.input.on('pointerup', endPointer);
    this.input.on('pointerupoutside', endPointer);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(clampZoom(cam.zoom - dy * 0.001));
      this.clampCamera();
    });
  }

  /** Current distance between the first two held pointers, or 0. */
  private pointerDistance(): number {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (!p1 || !p2 || !p1.isDown || !p2.isDown) return 0;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.hypot(dx, dy);
  }

  /** Selects the unit under the pointer, or clears the selection on empty ground. */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    // M9: a press that became a camera drag must not ALSO deselect. `handleClick`
    // runs on pointerdown (before any motion), so this only matters for the
    // *second* press of a drag that Phaser may re-report; the tracker's answer
    // is the authority on whether this session is a drag.
    if (this.pan.movedBeyondTap()) return;

    // HUD chrome and the frontline indicator own their own clicks; ignoring
    // them here stops a button press from also clearing the selection, and
    // stops a click on the top-centre indicator from (de)selecting a unit.
    // The reserved regions live in a pure, tested module so the indicator's
    // width tracks the viewport instead of a hardcoded span.
    if (shouldIgnoreClick(pointer.x, pointer.y, this.scale.width, this.scale.height)) return;

    // Phaser's own inverse. Hand-rolling `pointer.x / zoom + scrollX` is wrong
    // once zoom != 1: with originX 0.5 the camera overhangs the origin by
    // (W/z - W)/2, so the error is 427 world px at 0.6x and 107 at 1.2x — a
    // click would select a unit far to its right, or nothing at all.
    const cam = this.cameras.main;
    const worldX = cam.getWorldPoint(pointer.x, pointer.y).x;
    const hit = this.world.units.find(
      (u) => u.side === 'player' && u.state !== 'dead' && Math.abs(u.x - worldX) <= 20,
    );

    if (hit) this.selection.select(hit.id);
    else this.selection.clear();
  }

  /**
   * Flips pause and keeps the HUD in step.
   *
   * One method for both the Space key and the button, so the two can never
   * disagree about whether the game is paused. A decided match ignores it: the
   * result overlay IS the paused state, and toggling underneath it would let the
   * player resume a finished game. The menu confirm overlay owns the screen
   * while it is up, so Space must not toggle underneath it either.
   */
  private togglePause(): void {
    if (this.world.outcome !== 'ongoing') return;
    if (this.menuConfirmOpen) return;
    this.paused = !this.paused;
    this.hud.setPaused(this.paused);
  }

  /** Stance order for the selection, or the whole army when nothing is selected. */
  private pushStance(stance: Stance): void {
    const selected = selectedIdsOf(this.selection, this.world.units, 'player');
    if (selected.length > 0) {
      this.commands.push(cmdSetStance('player', selected, stance));
      return;
    }
    this.pushStanceToAll(stance);
  }

  private pushStanceToAll(stance: Stance): void {
    const ids = this.world.units
      .filter((u) => u.side === 'player' && u.state !== 'dead')
      .map((u) => u.id);
    if (ids.length === 0) return;
    this.commands.push(cmdSetStance('player', ids, stance));
  }

  /** Scrolls by keyboard and viewport edge, then clamps to the world. */
  private updateCamera(delta: number): void {
    const cam = this.cameras.main;
    const kbDir = this.keys.scrollDir();

    const pointer = this.input.activePointer;
    let edgeDir: -1 | 0 | 1 = 0;
    if (pointer.x <= EDGE_SCROLL_MARGIN) edgeDir = -1;
    else if (pointer.x >= this.scale.width - EDGE_SCROLL_MARGIN) edgeDir = 1;

    const dir = kbDir !== 0 ? kbDir : edgeDir;
    if (dir !== 0) {
      // px per ms, scaled by zoom so the on-screen speed feels constant.
      cam.setScroll(cam.scrollX + (dir * 0.9 * delta) / cam.zoom, cam.scrollY);
    }
    this.clampCamera();
  }

  private clampCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(clampZoom(cam.zoom));
    cam.setScroll(clampScrollX(cam.scrollX, WORLD_WIDTH, this.scale.width, cam.zoom), cam.scrollY);
  }

  /** Draws an ellipse under each selected unit. */
  private drawSelectionMarkers(): void {
    const g = this.selectedMarker;
    g.clear();

    // M6.4-Q5 follow-up: a mage-stunned unit stands frozen with no cue; draw
    // a pulsing yellow-green ring under it. Read-only from sim (stunTicksLeft).
    for (const unit of this.world.units) {
      if (unit.state !== 'stunned' || unit.stunTicksLeft <= 0) continue;
      const x = unit.prevX + (unit.x - unit.prevX) * this.timestep.alpha;
      const ring = stunRingFor(unit, x, this.groundY);
      if (!ring.visible) continue;
      g.lineStyle(2, STUN_RING_COLOR, 0.6 + 0.3 * ring.fraction);
      g.strokeEllipse(ring.x, ring.y, STUN_RING.rx * 2 * ring.pulse, STUN_RING.ry * 2);
    }

    if (this.selection.size === 0) return;

    g.lineStyle(2, 0xffffff, 0.75);
    for (const unit of this.world.units) {
      if (!this.selection.has(unit.id)) continue;
      const x = unit.prevX + (unit.x - unit.prevX) * this.timestep.alpha;
      g.strokeEllipse(x, this.groundY - 1, 34, 10);
    }
  }

  /**
   * The fixed-timestep driver (spec §3.3). Logic always runs at exactly 30 Hz
   * regardless of the display refresh rate; rendering interpolates between the
   * last two logic positions so motion stays smooth on a 60/120/144 Hz screen.
   *
   * syncStickmen() runs EVERY frame, not just tick frames. On a 144 Hz display
   * only ~1 frame in 5 advances a tick; gating the sync behind `ticks > 0`
   * would leave alpha pinned near 0 on the frames that do run (the accumulator
   * was just drained) and would skip the 4 frames in between entirely —
   * interpolation would never actually happen.
   */
  update(_time: number, delta: number): void {
    this.updateCamera(delta);

    // Exponential moving average, so the dev readout is legible rather than
    // flickering. delta is ms; guard against a zero/garbage delta.
    if (delta > 0) this.fps = this.fps === 0 ? 1000 / delta : this.fps * 0.9 + (1000 / delta) * 0.1;

    // Render-only work runs even while paused: a pause must freeze the
    // simulation, not the interface. Skipping this would leave a click made
    // while paused invisible until the player resumed.
    //
    // A decided match stops advancing too (spec §6.6). Continuing would make
    // "the final state" depend on how long the player took to click, and at 4x
    // would let the winner mop up a corpse army for no reason.
    //
    // The menu confirm overlay freezes the sim too: it is the paused state for
    // as long as it is up, so the match cannot slip away behind the dialog.
    const decided = this.world.outcome !== 'ongoing';
    const ticks =
      this.paused || decided || this.menuConfirmOpen
        ? 0
        : advanceWorld(this.timestep, this.world, delta, this.speed, () => this.commands.drain());
    this.elapsedTicks += ticks;

    // M5c: unlock audio on first real input (Q4). Checked every frame so the
    // very first tick after a key/pointer press creates the context exactly
    // once; `shouldCreateContext` is the pure decision.
    if (!this.sfxUnlocked && shouldCreateContext(this.sfxUnlockEvents)) {
      this.sfxUnlocked = true;
      this.audio.unlock();
    }

    // M5c Q5 + M7b: pause/result are silent, AND so is the user's menu sound
    // preference. `AudioManager.setMuted` is a TRANSIENT gate (re-set every
    // frame), the preference lives in the save — the OR merge happens here,
    // at the only call site, so the manager stays a dumb on/off switch.
    this.audio.setMuted(this.saveData.sfxMuted || this.paused || decided);

    // M5c: diff the previous-tick snapshot against the current world state
    // and play the events. `diffSfx` already applies the per-tick cap and
    // priority truncation. We only diff when a tick actually ran (a paused
    // or decided frame would diff a stale cur against cur and no-op, but we
    // skip the work entirely).
    if (ticks > 0 && this.sfxPrev !== null) {
      const cur = snapshotWorld(this.world);
      this.audio.play(diffSfx(this.sfxPrev, cur));
      this.sfxPrev = cur;
    }

    // Once the match is decided, record the result exactly once (spec §10.1.1).
    if (decided && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult();
    }

    this.syncStickmen();
    this.projectiles.sync(this.world.projectiles, this.timestep.alpha);
    this.drawSelectionMarkers();
    this.hud.sync(this.world);
    this.frontline.sync(this.world);
    this.result.sync(this.world, this.elapsedTicks, this.nextButtonLabel(), this.endlessResultInfo());

    if (ticks > 0 || this.paused || decided) {
      this.tickLabel.setText(
        `tick ${this.world.tick}  |  ${TICKS_PER_SEC} Hz  |  ${this.speed}x${this.paused ? '  ||' : ''}${this.fpsSuffix()}`,
      );
    }
  }

  /**
   * The dev-only FPS suffix for the tick label.
   *
   * Gated on `import.meta.env.DEV` so the production bundle shows no FPS at all
   * (spec §13.9 Q7/Q11). The acceptance for the perf standard is an EXTERNAL
   * Playwright measurement (S3), not this counter — this is just a handy dev
   * readout. Smoothed so a single slow frame does not make the number jump.
   */
  private fpsSuffix(): string {
    if (!import.meta.env.DEV) return '';
    return `  |  fps ~${Math.round(this.fps)}`;
  }

  /**
   * The endless score for the result overlay: the wave reached and the best
   * ever. Undefined for a campaign level, which has no wave score.
   */
  private endlessResultInfo(): { wave: number; bestWave: number } | undefined {
    if (!this.world.endless) return undefined;
    return { wave: this.world.waveIndex, bestWave: this.saveData.endlessBestWave };
  }

  /**
   * Persists this match's outcome: level progress on a win, best wave in
   * endless. The decisions themselves live in pure, tested helpers; this only
   * routes their answers to storage.
   */
  private recordResult(): void {
    const won = this.world.outcome === 'playerWin';
    let data = this.saveData;

    if (this.world.endless) {
      // Endless is always a loss; the score is the wave reached.
      data = {
        ...data,
        endlessBestWave: recordBestWave(data.endlessBestWave, this.world.waveIndex),
      };
    } else {
      data = {
        ...data,
        furthestLevel: advanceFurthestLevel(
          data.furthestLevel,
          this.levelIndex,
          won,
          LAST_CAMPAIGN_INDEX,
        ),
      };
    }

    this.saveData = data;
    saveGame(this.saveStorage, data);
  }

  /**
   * Recomputes viewport-derived geometry. Called on create and on every
   * resize. The sim is deliberately unaware of any of this.
   */
  private layout(): void {
    const { width, height } = this.scale;
    this.groundY = Math.round(height * GROUND_FRACTION);

    // Bounds are in WORLD units and do NOT depend on zoom: Phaser multiplies
    // the camera's own clamping by zoom itself, so the visible area stays
    // inside the world at every zoom level.
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height);
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setZoom(1);

    this.drawGround();
    this.projectiles.setGroundY(this.groundY);
    this.syncStickmen();
    this.hud.layout(width, height);
    this.frontline.layout(width);
    this.result.layout(width, height);
  }

  /** Draws the ground line and the base markers. Camera-agnostic: world coords only. */
  private drawGround(): void {
    this.groundLine.clear();

    // Sub-surface fill so the ground reads as solid.
    this.groundLine.fillStyle(0x2b3038, 1);
    this.groundLine.fillRect(0, this.groundY, WORLD_WIDTH, this.scale.height - this.groundY);

    // The ground line itself.
    this.groundLine.lineStyle(2, 0x5b6472, 1);
    this.groundLine.lineBetween(0, this.groundY, WORLD_WIDTH, this.groundY);

    // Base markers, so camera movement is legible.
    this.drawBaseMarker('player', 0x3f7fd0);
    this.drawBaseMarker('enemy', 0xd05a3f);
  }

  private drawBaseMarker(side: Side, color: number): void {
    const base = this.world.bases[side];
    const healthFraction = base.maxHp > 0 ? Math.max(0, base.hp / base.maxHp) : 0;
    this.groundLine.fillStyle(color, 0.6);
    this.groundLine.fillRect(base.x - 20, this.groundY - 60, 40, 60);
    // A brighter core that shrinks as the base takes damage.
    this.groundLine.fillStyle(0xffffff, 0.25 * healthFraction);
    this.groundLine.fillRect(base.x - 20, this.groundY - 60, 40, 60 * healthFraction);
  }

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
      stickman.container.setPosition(x, this.groundY - stickmanHipHeight(unit.typeId));
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
      this.lastTypeId.delete(id);
      this.lastFacing.delete(id);
    }

    for (const unit of this.world.units) {
      this.lastTypeId.set(unit.id, unit.typeId);
      this.lastFacing.set(unit.id, unit.side === 'player' ? 1 : -1);
    }
  }

  /**
   * Animation phase for a unit, 0..1.
   *
   * For `attack` this spans the WHOLE attack cycle (windup + cooldown), which
   * is what puts the contact keyframe on the same tick the damage lands — see
   * `attackPhase`. For every other state it is time in state modulo the cycle.
   */
  private phaseOf(unit: Unit): number {
    if (unit.state === 'attack') {
      const t = UNIT_TICKS[unit.typeId];
      return attackPhase(unit.windupTicksLeft, unit.cooldownTicksLeft, t.windup, t.attackCooldown);
    }
    const cycle = STATE_CYCLE_TICKS[unit.state] ?? 30;
    return ((this.world.tick - unit.stateEnteredTick) % cycle) / cycle;
  }
}
