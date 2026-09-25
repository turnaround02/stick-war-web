import Phaser from 'phaser';
import { WORLD_WIDTH } from '../../data/constants';
import { DEFAULT_MATCH } from '../../data/levels';
import { createWorld } from '../../sim/createWorld';
import type { World } from '../../sim/types';

/** Ground sits this fraction down the viewport, leaving the lower third empty (spec §7.2). */
const GROUND_FRACTION = 2 / 3;

/**
 * Owns the Phaser side of the game: camera, drawing, and the fixed-timestep
 * driver. Reads sim state every frame and NEVER writes to it (spec §3.1).
 */
export class BattleScene extends Phaser.Scene {
  private world!: World;
  private groundLine!: Phaser.GameObjects.Graphics;
  private groundY = 0;

  constructor() {
    super({ key: 'Battle' });
  }

  create(): void {
    this.world = createWorld(DEFAULT_MATCH, 20260925);

    this.groundLine = this.add.graphics();

    this.layout();
    this.scale.on('resize', () => this.layout());
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

    // Base markers, so camera movement is legible before units exist.
    this.drawBaseMarker('player', 0x3f7fd0);
    this.drawBaseMarker('enemy', 0xd05a3f);
  }

  private drawBaseMarker(side: 'player' | 'enemy', color: number): void {
    const base = this.world.bases[side];
    this.groundLine.fillStyle(color, 0.6);
    this.groundLine.fillRect(base.x - 20, this.groundY - 60, 40, 60);
  }
}
