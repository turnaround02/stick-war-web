import Phaser from 'phaser';
import { LEVELS, CAMPAIGN_SEED } from '../../data/levels';
import { browserStorage, loadSave, saveGame, DEFAULT_SAVE, type SaveData } from '../../save/storage';
import { t } from '../../i18n';
import {
  menuPanelRect,
  menuRows,
  menuAuxRect,
  menuToggleRects,
  nextSpeed,
  speedToggleLabel,
  sfxToggleLabel,
  canResetProgress,
  type MenuRow,
} from '../menu/layout';
import { helpPanelRect, helpLines, helpCloseRect, helpTitle, helpCloseLabel } from '../help/layout';

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

    // Preference toggles (M7b): click cycles the value and persists it through
    // the same tolerant write path as the reset button. Labels are re-derived
    // from the save so the button text always shows the CURRENT value.
    const toggles = menuToggleRects(width, height);
    this.buildToggle(toggles.speed, () => {
      const cur = loadSave(this.saveStorage);
      return { ...cur, speedPreference: nextSpeed(cur.speedPreference) };
    }, () => speedToggleLabel(loadSave(this.saveStorage).speedPreference));
    this.buildToggle(toggles.sfx, () => {
      const cur = loadSave(this.saveStorage);
      return { ...cur, sfxMuted: !cur.sfxMuted };
    }, () => sfxToggleLabel(loadSave(this.saveStorage).sfxMuted));

    // Reset progress: offered only when there IS progress, and it writes the
    // default save — the same tolerant write path the game already uses.
    if (canResetProgress(save.furthestLevel, save.endlessBestWave)) {
      this.buildAux(menuAuxRect(width, height));
    }

    // M12: the "how to play" entry, bottom-left of the panel (aux lives
    // bottom-centre; this sits left of it so the two never collide).
    this.buildHelpButton(width, height);
  }

  /** The help entry + overlay. Hidden by default; shown on click. */
  private buildHelpButton(width: number, height: number): void {
    const panel = menuPanelRect(width, height);
    const aux = menuAuxRect(width, height);
    const w = 120;
    const rect = this.add
      .rectangle(panel.x + 16 + w / 2, aux.y + aux.h / 2, w, aux.h, BUTTON_OFF)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(rect.x, rect.y, t('help.title'), { fontFamily: FONT, fontSize: '14px', color: TEXT_DIM })
      .setOrigin(0.5)
      .setDepth(12);

    // The overlay: dim + panel + lines + close. Built hidden, shown on click.
    const dim = this.add
      .rectangle(0, 0, width, height, OVERLAY_COLOR, 0.7)
      .setOrigin(0, 0)
      .setDepth(20)
      .setInteractive() // swallow clicks
      .setVisible(false);
    const hp = helpPanelRect(width, height);
    const helpPanel = this.add
      .rectangle(hp.x + hp.w / 2, hp.y + hp.h / 2, hp.w, hp.h, PANEL_COLOR, PANEL_ALPHA)
      .setDepth(21)
      .setVisible(false);
    const title = this.add
      .text(hp.x + hp.w / 2, hp.y + 24, helpTitle(), {
        fontFamily: FONT,
        fontSize: '20px',
        color: TEXT_LIGHT,
      })
      .setOrigin(0.5)
      .setDepth(22)
      .setVisible(false);
    const lineObjs = helpLines().map((line, i) =>
      this.add
        .text(hp.x + HELP_PAD, hp.y + 58 + i * HELP_LINE_H, line, {
          fontFamily: FONT,
          fontSize: '13px',
          color: TEXT_DIM,
        })
        .setDepth(22)
        .setVisible(false),
    );
    const close = helpCloseRect(width, height);
    const closeBtn = this.add
      .rectangle(close.x + close.w / 2, close.y + close.h / 2, close.w, close.h, BUTTON_ON)
      .setDepth(22)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    const closeLabel = this.add
      .text(closeBtn.x, closeBtn.y, helpCloseLabel(), {
        fontFamily: FONT,
        fontSize: '14px',
        color: TEXT_LIGHT,
      })
      .setOrigin(0.5)
      .setDepth(23)
      .setVisible(false);

    const all = [dim, helpPanel, title, ...lineObjs, closeBtn, closeLabel];
    rect.on('pointerdown', () => {
      for (const o of all) o.setVisible(true);
    });
    closeBtn.on('pointerdown', () => {
      for (const o of all) o.setVisible(false);
    });
  }

  /**
   * A preference toggle: label re-read from the save on every click (no stale
   * cache), value mutated by `nextSave` and persisted immediately.
   */
  private buildToggle(
    rect: { x: number; y: number; w: number; h: number },
    nextSave: () => SaveData,
    label: () => string,
  ): void {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const button = this.add
      .rectangle(cx, cy, rect.w, rect.h, BUTTON_ON)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(cx, cy, label(), { fontFamily: FONT, fontSize: '14px', color: TEXT_LIGHT })
      .setOrigin(0.5)
      .setDepth(12);

    button.on('pointerdown', () => {
      saveGame(this.saveStorage, nextSave());
      // Re-derive from the save: one source of truth for the shown value.
      text.setText(label());
    });
  }

  /** One level row: a button with the level name, and its mechanic description under it. */
  private buildRow(row: MenuRow): void {
    const cx = row.rect.x + row.rect.w / 2;
    const cy = row.rect.y + row.rect.h / 2;
    const color = row.enabled ? (row.endless ? BUTTON_ENDLESS : BUTTON_ON) : BUTTON_OFF;
    const labelColor = row.enabled ? TEXT_LIGHT : TEXT_DIM;

    const rect = this.add
      .rectangle(cx, cy, row.rect.w, row.rect.h, color)
      .setDepth(11);
    this.add
      .text(cx, cy - 9, row.label, { fontFamily: FONT, fontSize: '17px', color: labelColor })
      .setOrigin(0.5)
      .setDepth(12);
    this.add
      .text(cx, cy + 11, row.description, { fontFamily: FONT, fontSize: '11px', color: TEXT_DIM })
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

/** Help overlay line spacing (mirrors HELP_LAYOUT.lineH for text placement). */
const HELP_LINE_H = 26;
const HELP_PAD = 20;
