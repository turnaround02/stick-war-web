import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const SIM_FILES = ['src/sim/**/*.ts'];

/**
 * Phaser 4 traps that apply everywhere.
 * Kept as a named list because the sim block below must include them too —
 * a later flat-config object REPLACES `no-restricted-properties` wholesale
 * rather than merging it, so the sim block has to restate these.
 */
const PHASER4_TRAPS = [
  {
    object: 'Math',
    property: 'TAU',
    message:
      'Phaser 4 changed Math.TAU to PI*2 (v3 had PI/2). Use Math.PI * 2 explicitly.',
  },
  {
    object: 'Math',
    property: 'PI2',
    message: 'Math.PI2 was removed in Phaser 4. Use Math.PI * 2.',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── 全局约定：`_` 前缀表示「刻意未使用」 ────────────────────────
  // M1's tick systems take a TickContext they do not read yet. TypeScript's
  // noUnusedParameters honours the `_` prefix by default; the ESLint rule
  // does not, so the convention is declared here.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // ── 全局：Phaser 4 陷阱 ────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...PHASER4_TRAPS],
    },
  },

  // ── sim 边界：禁止渲染层与非确定性来源 ──────────────────────────
  // Must come AFTER the global block: this object's no-restricted-properties
  // replaces the global one for sim files, so it restates the Phaser 4 traps
  // alongside the determinism rules.
  {
    files: SIM_FILES,
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['phaser', '**/render/**', '**/input/**', '**/i18n/**'],
            message:
              'src/sim must stay renderer-agnostic. sim may only import from data/ and sim/.',
          },
        ],
      }],
      'no-restricted-properties': ['error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use sim/rng.ts seeded PRNG instead — Math.random breaks determinism.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Use world.tick instead — Date.now breaks determinism.',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'Use world.tick instead — performance.now breaks determinism.',
        },
        ...PHASER4_TRAPS,
      ],
    },
  },
);
