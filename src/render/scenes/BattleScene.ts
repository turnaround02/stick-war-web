import Phaser from 'phaser';
import { TICKS_PER_SEC, WORLD_WIDTH } from '../../data/constants';
import { RENDER_DEMO_MATCH, RENDER_DEMO_SEED } from '../../data/levels';
import { UNIT_TICKS } from '../../data/unitTicks';
import type { UnitTypeId } from '../../data/units';
import { createWorld } from '../../sim/createWorld';
import { step } from '../../sim/tick';
import type { Side, Unit, UnitState, World } from '../../sim/types';
import { FixedTimestep } from '../timestep';
import { spawnGhost } from '../ghost';
import { createProjectileLayer, type ProjectileLayer } from '../projectile';
import { createStickman, STICKMAN_HIP_HEIGHT, type Stickman } from '../stickman/skeleton';

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

  /** Last known appearance per unit, so a ghost can be spawned after removal. */
  private lastTypeId = new Map<number, UnitTypeId>();
  private lastFacing = new Map<number, 1 | -1>();

  constructor() {
    super({ key: 'Battle' });
  }

  create(): void {
    this.world = createWorld(RENDER_DEMO_MATCH, RENDER_DEMO_SEED);

    this.groundLine = this.add.graphics();
    this.projectiles = createProjectileLayer(this);

    this.syncStickmen();
    this.layout();

    this.tickLabel = this.add
      .text(12, 12, '', { fontFamily: 'monospace', fontSize: '16px', color: '#9aa4b2' })
      .setScrollFactor(0)
      .setDepth(1000);

    const onResize = () => this.layout();
    this.scale.on('resize', onResize);
    // Scene restart would otherwise stack a second listener and leak this one.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', onResize);
    });

    this.input.keyboard?.on('keydown-R', () => {
      this.scene.restart();
    });
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
    const ticks = this.timestep.advance(delta);

    for (let i = 0; i < ticks; i++) {
      step(this.world, []);
    }

    this.syncStickmen();
    this.projectiles.sync(this.world.projectiles, this.timestep.alpha);

    if (ticks > 0) {
      this.tickLabel.setText(`tick ${this.world.tick}  |  ${TICKS_PER_SEC} Hz logic`);
    }
  }

  /**
   * Recomputes viewport-derived geometry. Called on create and on every
   * resize. The sim is deliberately unaware of any of this.
   */
  private layout(): void {
    const { height } = this.scale;
    this.groundY = Math.round(height * GROUND_FRACTION);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, height);
    this.cameras.main.setScroll(0, 0);

    this.drawGround();
    this.projectiles.setGroundY(this.groundY);
    this.syncStickmen();
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
   * For `attack` this is windup progress, NOT time in state, so the contact
   * keyframe lands on the same tick the damage is applied (spec §7.1).
   */
  private phaseOf(unit: Unit): number {
    if (unit.state === 'attack') {
      const total = UNIT_TICKS[unit.typeId].windup;
      if (total <= 0) return 0;
      return 1 - unit.windupTicksLeft / total;
    }
    const cycle = STATE_CYCLE_TICKS[unit.state] ?? 30;
    return ((this.world.tick - unit.stateEnteredTick) % cycle) / cycle;
  }
}
