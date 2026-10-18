import Phaser from 'phaser';
import { LEVELS, CAMPAIGN_SEED } from '../../data/levels';
import { browserStorage, loadSave, saveGame, DEFAULT_SAVE } from '../../save/storage';
import { t } from '../../i18n';
import {
  menuPanelRect,
  menuRows,
  menuAuxRect,
  canResetProgress,
  type MenuRow,
} from '../menu/layout';

const FONT = 'monospace';
const TEXT_LIGHT = '#e8edf4';
const TEXT_DIM = '#6b7280';
const PANEL_COLOR = 0x141821;
const PANEL_ALPHA = 0.96;
const BUTTON_ON = 0x2f3a4a;
const BUTTON_OFF = 0x1c2028;
const BUTTON_ENDLESS = 0x3a3244;
const OVERLAY_COLOR = 0x0d1016;

/**
 * Level-select menu (M7).
 *
 * Shown before every battle. Rows come from `menu/layout.ts` (tested, pure);
 * unlock state reads the same `furthestLevel` the BootScene resume used, so the
 * menu can never offer a level the old flow would not have started.
 */
export class MenuScene extends Phaser.Scene {
  private saveStorage = browserStorage();

  constructor() {
    super({ key: 'Menu' });
  }

  create(): void {
    const save = loadSave(this.saveStorage);
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, OVERLAY_COLOR).setOrigin(0, 0).setDepth(0);

    const panel = menuPanelRect(width, height);
    this.add
      .rectangle(panel.x + panel.w / 2, panel.y + panel.h / 2, panel.w, panel.h, PANEL_COLOR, PANEL_ALPHA)
      .setDepth(10);

    this.add
      .text(panel.x + panel.w / 2, panel.y + MENU_TITLE_OFFSET, t('menu.title'), {
        fontFamily: FONT,
        fontSize: '28px',
        color: TEXT_LIGHT,
      })
      .setOrigin(0.5)
      .setDepth(11);

    const rows = menuRows(width, height, save.furthestLevel);
    for (const row of rows) this.buildRow(row);

    // Reset progress: offered only when there IS progress, and it writes the
    // default save — the same tolerant write path the game already uses.
    if (canResetProgress(save.furthestLevel, save.endlessBestWave)) {
      this.buildAux(menuAuxRect(width, height));
    }
  }

  /** One level row: a button (locked rows render grey and inert). */
  private buildRow(row: MenuRow): void {
    const cx = row.rect.x + row.rect.w / 2;
    const cy = row.rect.y + row.rect.h / 2;
    const color = row.enabled ? (row.endless ? BUTTON_ENDLESS : BUTTON_ON) : BUTTON_OFF;
    const labelColor = row.enabled ? TEXT_LIGHT : TEXT_DIM;

    const rect = this.add
      .rectangle(cx, cy, row.rect.w, row.rect.h, color)
      .setDepth(11);
    this.add
      .text(cx, cy, row.label, { fontFamily: FONT, fontSize: '17px', color: labelColor })
      .setOrigin(0.5)
      .setDepth(12);

    if (row.enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.startLevel(row.levelIndex));
    }
  }

  /** The reset button. Removes itself and rebuilds the scene when clicked. */
  private buildAux(rect: { x: number; y: number; w: number; h: number }): void {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const button = this.add
      .rectangle(cx, cy, rect.w, rect.h, BUTTON_OFF)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, t('menu.resetProgress'), { fontFamily: FONT, fontSize: '14px', color: TEXT_DIM })
      .setOrigin(0.5)
      .setDepth(12);

    button.on('pointerdown', () => {
      saveGame(this.saveStorage, { ...DEFAULT_SAVE });
      // Re-read: the scene rebuilds so the reset is immediately visible.
      this.scene.restart();
    });
  }

  private startLevel(index: number): void {
    const cfg = LEVELS[index];
    if (!cfg) return;
    // Campaign levels share the fixed campaign seed so a level always plays
    // the same; endless starts at the same seed too — determinism rules apply
    // to every mode equally (spec §5.1).
    this.scene.start('Battle', { config: cfg, seed: CAMPAIGN_SEED });
  }
}

/** Title baseline inside the panel, above the first row. */
const MENU_TITLE_OFFSET = 34;
