import Phaser from 'phaser';
import { LEVELS } from '../../data/levels';
import { browserStorage, loadSave } from '../../save/storage';

/**
 * Entry scene. M1 has nothing to preload (all art is procedural), so it
 * immediately hands off to the battle. Kept as its own scene so M5 can add
 * asset loading and a progress bar without touching BattleScene.
 *
 * M5b: it now resumes at the FURTHEST level the player has unlocked, read from
 * the save. Progress is "furthest reached", and no in-progress match is stored,
 * so a refresh restarts the furthest level from the top rather than dropping the
 * player back at level 1.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create(): void {
    const save = loadSave(browserStorage());
    const index = Math.min(Math.max(0, save.furthestLevel), LEVELS.length - 1);
    this.scene.start('Battle', { config: LEVELS[index] });
  }
}
