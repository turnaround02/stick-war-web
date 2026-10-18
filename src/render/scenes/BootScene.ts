import Phaser from 'phaser';

/**
 * Entry scene. M1 has nothing to preload (all art is procedural), so it
 * immediately hands off — since M7 to the LEVEL MENU rather than a battle.
 *
 * The menu owns level choice (gated by the save's furthest unlocked level);
 * the save is read there, not here, so there is exactly one place that turns
 * save state into a level pick.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create(): void {
    this.scene.start('Menu');
  }
}
