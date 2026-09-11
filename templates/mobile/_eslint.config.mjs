// Flat ESLint config for {{projectName}}.
//
// Uses `typescript-eslint` directly (no Expo-specific shared config is
// required for the plain typecheck-and-lint pass). The React Native-specific
// globals (`__DEV__`) are declared below so ESLint doesn't flag them as
// undefined. `eslint-config-prettier` disables formatting rules that Prettier
// already owns.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        __DEV__: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // CJS config files (babel, metro, tailwind) use `module.exports` and
  // `require()` which the TS/ESM rules flag. These are build-tool configs,
  // not app code — ignore them.
  {
    ignores: [
      'node_modules',
      '.expo',
      'dist',
      'build',
      // The sandcastle runner imports @ai-hero/sandcastle, installed only when used.
      '.sandcastle',
      'babel.config.js',
      'metro.config.js',
      'tailwind.config.js',
    ],
  },
];
