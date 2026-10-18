import Phaser from 'phaser';
import { BootScene } from './render/scenes/BootScene';
import { MenuScene } from './render/scenes/MenuScene';
import { BattleScene } from './render/scenes/BattleScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#1a1d24',
  // Phaser 4 flipped roundPixels to default false; we want crisp 1px lines.
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'game-container',
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, MenuScene, BattleScene],
};

new Phaser.Game(config);
