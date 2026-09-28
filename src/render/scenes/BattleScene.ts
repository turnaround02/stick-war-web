import Phaser from 'phaser';
import { TICKS_PER_SEC, WORLD_WIDTH } from '../../data/constants';
import { RENDER_DEMO_MATCH, RENDER_DEMO_SEED } from '../../data/levels';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { UnitTypeId } from '../../data/units';
import { CommandQueue, KeyState, setStance as cmdSetStance, train as cmdTrain } from '../../input/desktop';
import { createWorld } from '../../sim/createWorld';
import type { Side, Stance, Unit, UnitState, World } from '../../sim/types';
import { clampScrollX, clampZoom, EDGE_SCROLL_MARGIN } from '../camera';
import { createHud, type Hud } from '../hud';
import { Selection, selectedIdsOf } from '../selection';
import { FixedTimestep, advanceWorld, type GameSpeed } from '../timestep';
import { spawnGhost } from '../ghost';
import { createProjectileLayer, type ProjectileLayer } from '../projectile';
import { createStickman, STICKMAN_HIP_HEIGHT, type Stickman } from '../stickman/skeleton';
import { attackPhase } from '../stickman/poses';

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
export class BattleScene extends Phaser.Scene {
  private world!: World;
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
  private speed: GameSpeed = 1;
  private paused = false;

  /** Last known appearance per unit, so a ghost can be spawned after removal. */
  private lastTypeId = new Map<number, UnitTypeId>();
  private lastFacing = new Map<number, 1 | -1>();

  constructor() {
    super({ key: 'Battle' });
  }

  create(): void {
    // Scene.restart() reuses this instance, so every mutable field must be
    // reset here. Without this, pressing R after pausing starts the new match
    // still paused, and stale selection/keys survive into it.
    this.world = createWorld(RENDER_DEMO_MATCH, RENDER_DEMO_SEED);
    this.timestep = new FixedTimestep();
    this.commands = new CommandQueue();
    this.keys = new KeyState();
    this.selection = new Selection();
    this.speed = 1;
    this.paused = false;
    this.stickmen.clear();
    this.lastTypeId.clear();
    this.lastFacing.clear();

    this.groundLine = this.add.graphics();
    this.projectiles = createProjectileLayer(this);
    this.selectedMarker = this.add.graphics().setDepth(6);

    this.hud = createHud(this, 'player', {
      onTrain: (typeId: UnitTypeId) => this.commands.push(cmdTrain('player', typeId)),
      onStance: (stance: Stance) => this.pushStanceToAll(stance),
      onSpeedChange: (speed: GameSpeed) => {
        this.speed = speed;
        this.hud.setSpeed(speed);
      },
      onTogglePause: () => this.togglePause(),
    });
    // Highlight the initial speed so the buttons do not all look inactive on load.
    this.hud.setSpeed(this.speed);
    this.hud.setPaused(this.paused);

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
      this.hud.destroy();
    });

    this.input.keyboard?.on('keydown-R', () => {
      this.scene.restart();
    });
  }

  /** Wires keyboard, pointer and wheel to input state and the command queue. */
  private setupInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown', (e: KeyboardEvent) => {
        // Browsers auto-repeat held keys; without this, holding Space flickers
        // pause and holding R restarts every repeat.
        if (e.repeat) return;

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
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.keys.clear());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleClick(p));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(clampZoom(cam.zoom - dy * 0.001));
      this.clampCamera();
    });
  }

  /** Selects the unit under the pointer, or clears the selection on empty ground. */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    // HUD clicks are handled by the interactive objects themselves; ignoring
    // them here stops a button press from also clearing the selection.
    const cam = this.cameras.main;
    const hudTop = this.scale.height - 64;
    if (pointer.y >= hudTop) return;
    if (pointer.y <= 56 && (pointer.x <= 240 || pointer.x >= this.scale.width - 240)) return;

    // Phaser's own inverse. Hand-rolling `pointer.x / zoom + scrollX` is wrong
    // once zoom != 1: with originX 0.5 the camera overhangs the origin by
    // (W/z - W)/2, so the error is 427 world px at 0.6x and 107 at 1.2x — a
    // click would select a unit far to its right, or nothing at all.
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
   * disagree about whether the game is paused.
   */
  private togglePause(): void {
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

    // Render-only work runs even while paused: a pause must freeze the
    // simulation, not the interface. Skipping this would leave a click made
    // while paused invisible until the player resumed.
    const ticks = this.paused
      ? 0
      : advanceWorld(this.timestep, this.world, delta, this.speed, () => this.commands.drain());

    this.syncStickmen();
    this.projectiles.sync(this.world.projectiles, this.timestep.alpha);
    this.drawSelectionMarkers();
    this.hud.sync(this.world);

    if (ticks > 0 || this.paused) {
      this.tickLabel.setText(
        `tick ${this.world.tick}  |  ${TICKS_PER_SEC} Hz  |  ${this.speed}x${this.paused ? '  ||' : ''}`,
      );
    }
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
