import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const SIM_FILES = ['src/sim/**/*.ts'];

/**
 * Phaser 4 traps that apply everywhere.
 * Kept as a named list because the sim block below must include them too —
 * a later flat-config object REPLACES `no-restricted-properties` wholesale
 * rather than merging it, so the sim block has to restate these.
 *
 * NOTE: these are caught via no-restricted-syntax, not no-restricted-properties.
 * `no-restricted-properties` only matches a plain identifier as the object, so
 * it fires on `Math.TAU` — which is `undefined` in JS and nobody would write —
 * but MISSES `Phaser.Math.TAU`, whose object node is the member expression
 * `Phaser.Math`. That is the trap that actually matters, so it needs a syntax
 * selector.
 */
const PHASER4_TRAP_SELECTORS = [
  // `Phaser.Math.TAU` parses as MemberExpression whose `object` is itself a
  // MemberExpression (Phaser.Math). esquery reaches through it with the
  // dotted attribute path `object.object.name` / `object.property.name`.
  {
    selector:
      "MemberExpression[object.object.name='Phaser'][object.property.name='Math'][property.name=/^(TAU|PI2)$/]",
    message:
      'Phaser 4 changed Phaser.Math.TAU to PI*2 (v3 had PI/2) and removed Phaser.Math.PI2. Use Math.PI * 2 explicitly.',
  },
  // Bare `Math.TAU` / `Math.PI2`, which are undefined in plain JS anyway.
  {
    selector: "MemberExpression[object.name='Math'][property.name=/^(TAU|PI2)$/]",
    message:
      'Phaser 4 changed Math.TAU to PI*2 (v3 had PI/2) and removed Math.PI2. Use Math.PI * 2 explicitly.',
  },
];

/** Determinism rules. Bare identifiers, so no-restricted-properties handles them. */
const DETERMINISM_PROPERTIES = [
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
];

export default tseslint.config(
  // ESLint does not read .gitignore, so ignored paths must be listed here too.
  // `.worktrees/**` matters: git worktrees hold a full second copy of the
  // project including its build output, and linting those compressed bundles
  // produces thousands of meaningless errors.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.worktrees/**',
    ],
  },
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
      'no-restricted-syntax': ['error', ...PHASER4_TRAP_SELECTORS],
    },
  },

  // ── sim 边界：禁止渲染层与非确定性来源 ──────────────────────────
  // Must come AFTER the global block: this object's no-restricted-syntax and
  // no-restricted-properties replace the global ones for sim files, so it
  // restates the Phaser 4 traps alongside the determinism rules.
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
      'no-restricted-properties': ['error', ...DETERMINISM_PROPERTIES],
      'no-restricted-syntax': ['error', ...PHASER4_TRAP_SELECTORS],
    },
  },
);
