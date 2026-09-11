// Flat ESLint config for {{projectName}}.
//
// In Next.js 16, `eslint-config-next` ships as a flat-config array directly
// from the package default export (no `/flat` subpath, no factory function).
// We spread that array and append `eslint-config-prettier` so ESLint does
// not fight Prettier over formatting rules. `npm run lint` invokes
// `eslint .` directly — Next.js 16 removed the `next lint` subcommand.
//
// The custom rules block below re-declares the `@typescript-eslint` plugin
// because ESLint 10 flat config scopes plugin registrations to the config
// object they're declared in. `eslint-config-next` only registers the
// plugin under `files: ['**/*.ts','**/*.tsx']`, so our rules — which also
// only apply to TS files — must declare it locally for the rule namespace
// lookup to resolve.

import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const config = [
  ...next,
  prettier,
  // The sandcastle runner imports @ai-hero/sandcastle, installed only when used.
  { ignores: ['.sandcastle'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // PRD NFR / architecture: strict TypeScript — no `any` anywhere.
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused imports/vars are a code smell in a fresh scaffold.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
