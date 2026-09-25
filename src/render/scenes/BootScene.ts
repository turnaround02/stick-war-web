import Phaser from 'phaser';

/**
 * Entry scene. M1 has nothing to preload (all art is procedural), so it
 * immediately hands off to the battle. Kept as its own scene so M5 can add
 * asset loading and a progress bar without touching BattleScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create(): void {
    this.scene.start('Battle');
  }
}
