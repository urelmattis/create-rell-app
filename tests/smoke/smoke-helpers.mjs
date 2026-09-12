// Pure helper functions for the smoke test runner.
//
// Kept separate from `smoke-test.mjs` so they can be unit-tested by Vitest
// without invoking the full scaffold/install/build pipeline (which is
// far too slow for `npm test`). The runner imports these helpers and
// layers on the filesystem + subprocess orchestration.
//
// ESM `.mjs` rather than `.ts` so the runner can be executed directly with
// `node` on any Node 22+ machine without a build or loader flag. A sibling
// `smoke-helpers.d.ts` provides TypeScript declarations for consumers
// (the unit test file and any future typed callers).

/**
 * Per-template command matrix. This is the single source of truth for
 * "what does a healthy scaffold look like" — used by both the runner
 * (to execute each step) and the unit tests (to verify shape).
 *
 * The AC for Story 6.1 says "npm run build succeeds for each scaffold".
 * Because the Expo-based templates don't ship a `build` script (Expo's
 * build pipeline needs native toolchains we can't assume in CI), we
 * substitute `typecheck` for them. This divergence from the literal AC
 * is documented in the story's Dev Notes.
 */
export const TEMPLATES = Object.freeze({
  web: Object.freeze({
    // No `next build` step — it requires real CLERK_SECRET_KEY / SUPABASE
    // env vars at build time because Next.js collects page data for server
    // routes. Lint + typecheck validates the code compiles correctly;
    // `next build` is a deployment concern, not a scaffold-quality check.
    steps: Object.freeze([
      Object.freeze({ label: 'install', cmd: 'npm', args: Object.freeze(['install']) }),
      Object.freeze({ label: 'lint', cmd: 'npm', args: Object.freeze(['run', 'lint']) }),
      Object.freeze({
        label: 'typecheck',
        cmd: 'npm',
        args: Object.freeze(['run', 'typecheck']),
      }),
      // The same gates the generated ci.yml runs; branch protection requires them.
      Object.freeze({
        label: 'format:check',
        cmd: 'npm',
        args: Object.freeze(['run', 'format:check']),
      }),
      Object.freeze({ label: 'test', cmd: 'npm', args: Object.freeze(['run', 'test']) }),
    ]),
    requiredFiles: Object.freeze([
      'package.json',
      'README.md',
      '.env.example',
      '.gitignore',
      '.gitattributes',
      '.env.local',
      'scripts/check-env.mjs',
      '.github/workflows/ci.yml',
      '.github/workflows/agent-explore.yml',
      '.github/dependabot.yml',
      'CLAUDE.md',
      'CONTEXT.md',
      'docs/agents/triage-labels.md',
      '.claude/settings.json',
      'scripts/queue-install.sh',
    ]),
  }),
  mobile: Object.freeze({
    steps: Object.freeze([
      Object.freeze({ label: 'install', cmd: 'npm', args: Object.freeze(['install']) }),
      Object.freeze({ label: 'lint', cmd: 'npm', args: Object.freeze(['run', 'lint']) }),
      Object.freeze({
        label: 'typecheck',
        cmd: 'npm',
        args: Object.freeze(['run', 'typecheck']),
      }),
      // The same gates the generated ci.yml runs; branch protection requires them.
      Object.freeze({
        label: 'format:check',
        cmd: 'npm',
        args: Object.freeze(['run', 'format:check']),
      }),
      Object.freeze({ label: 'test', cmd: 'npm', args: Object.freeze(['run', 'test']) }),
    ]),
    requiredFiles: Object.freeze([
      'package.json',
      'README.md',
      '.env.example',
      '.gitignore',
      '.gitattributes',
      '.env.local',
      'scripts/check-env.mjs',
      '.github/workflows/ci.yml',
      '.github/workflows/agent-explore.yml',
      '.github/dependabot.yml',
      'CLAUDE.md',
      'CONTEXT.md',
      'docs/agents/triage-labels.md',
      '.claude/settings.json',
      'scripts/queue-install.sh',
    ]),
  }),
  monolith: Object.freeze({
    steps: Object.freeze([
      Object.freeze({ label: 'install', cmd: 'npm', args: Object.freeze(['install']) }),
      Object.freeze({ label: 'lint', cmd: 'npm', args: Object.freeze(['run', 'lint']) }),
      // No `build:web` — same env-var constraint as web (see comment above).
      Object.freeze({
        label: 'typecheck',
        cmd: 'npm',
        args: Object.freeze(['run', 'typecheck']),
      }),
      // The same gates the generated ci.yml runs; branch protection requires them.
      Object.freeze({
        label: 'format:check',
        cmd: 'npm',
        args: Object.freeze(['run', 'format:check']),
      }),
      Object.freeze({ label: 'test', cmd: 'npm', args: Object.freeze(['run', 'test']) }),
    ]),
    requiredFiles: Object.freeze([
      'package.json',
      'README.md',
      '.gitignore',
      '.gitattributes',
      'apps/web/package.json',
      'apps/mobile/package.json',
      'packages/shared/package.json',
      'apps/web/.env.local',
      'apps/mobile/.env.local',
      'apps/web/scripts/check-env.mjs',
      'apps/mobile/scripts/check-env.mjs',
      '.github/workflows/ci.yml',
      '.github/workflows/agent-explore.yml',
      '.github/dependabot.yml',
      'CLAUDE.md',
      'CONTEXT.md',
      'docs/agents/triage-labels.md',
      '.claude/settings.json',
      'scripts/queue-install.sh',
    ]),
  }),
});

/**
 * The canonical list of template names the runner knows about, in the
 * order smoke tests execute them by default. Kept separate from
 * `Object.keys(TEMPLATES)` so the order is explicit and stable.
 */
export const ALL_TEMPLATE_NAMES = Object.freeze(['web', 'mobile', 'monolith']);

// Load-time invariant: TEMPLATES and ALL_TEMPLATE_NAMES must describe
// exactly the same set. Anyone adding a new template must update BOTH.
// A silent drift would cause default runs to skip or blow up at runtime
// instead of at module load — this assertion fails fast and loud.
{
  const templateKeys = Object.keys(TEMPLATES).sort();
  const canonical = [...ALL_TEMPLATE_NAMES].sort();
  const keysMatch =
    templateKeys.length === canonical.length && templateKeys.every((k, i) => k === canonical[i]);
  if (!keysMatch) {
    throw new Error(
      `smoke-helpers: TEMPLATES keys ${JSON.stringify(templateKeys)} do not match ALL_TEMPLATE_NAMES ${JSON.stringify(canonical)}`,
    );
  }
}

/**
 * Parse the `--templates=<list>` flag from a raw argv array.
 *
 * - `parseTemplatesFlag([])` → `['web', 'mobile', 'monolith']` (default)
 * - `parseTemplatesFlag(['--templates=web'])` → `['web']`
 * - `parseTemplatesFlag(['--templates=web,mobile'])` → `['web', 'mobile']`
 * - `parseTemplatesFlag(['--templates=bogus'])` → throws
 *
 * Whitespace around commas is tolerated. Duplicates collapse to one
 * entry while preserving the order of first appearance. An empty
 * comma-separated list (e.g. `--templates=`) throws — silent fallback
 * to the default would mask a typo.
 *
 * @param {readonly string[]} argv raw process.argv-like array
 * @returns {readonly string[]} ordered list of template names to run
 */
export function parseTemplatesFlag(argv) {
  const flag = argv.find((arg) => arg.startsWith('--templates='));
  if (flag === undefined) {
    return ALL_TEMPLATE_NAMES.slice();
  }

  const raw = flag.slice('--templates='.length);
  if (raw.trim() === '') {
    throw new Error('--templates= cannot be empty. Provide a comma-separated list.');
  }

  const names = [];
  const seen = new Set();
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (name === '') {
      throw new Error(`--templates contains an empty entry: ${JSON.stringify(raw)}`);
    }
    if (!ALL_TEMPLATE_NAMES.includes(name)) {
      throw new Error(
        `Unknown template ${JSON.stringify(name)}. Known: ${ALL_TEMPLATE_NAMES.join(', ')}`,
      );
    }
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

/**
 * Format a single template's result for the summary section.
 *
 * Examples:
 *   `web       : PASS (123.4s)`
 *   `mobile    : FAIL @ install (45.1s)`
 *
 * @param {string} name template name (padded to a fixed width for alignment)
 * @param {{ status: 'pass' | 'fail', failedStep?: string, durationMs: number }} result
 * @returns {string}
 */
export function formatSummaryLine(name, result) {
  const paddedName = name.padEnd(10, ' ');
  const seconds = (result.durationMs / 1000).toFixed(1);
  if (result.status === 'pass') {
    return `${paddedName}: PASS (${seconds}s)`;
  }
  const where = result.failedStep ? ` @ ${result.failedStep}` : '';
  return `${paddedName}: FAIL${where} (${seconds}s)`;
}

/**
 * Format the full summary block for a smoke run. Includes a header, one
 * line per template (via formatSummaryLine), and a final overall status.
 *
 * @param {ReadonlyArray<{ name: string, status: 'pass' | 'fail', failedStep?: string, durationMs: number }>} results
 * @returns {string}
 */
export function formatSummary(results) {
  const lines = ['', '── smoke test summary ──────────────────────────────'];
  for (const result of results) {
    lines.push(formatSummaryLine(result.name, result));
  }
  const overall = results.every((r) => r.status === 'pass') ? 'PASS' : 'FAIL';
  lines.push('────────────────────────────────────────────────────');
  lines.push(`overall   : ${overall}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Compute the final process exit code for a set of results. 0 on
 * all-pass, 1 on any failure, 1 on empty result list (nothing was run
 * — almost certainly a bug in the runner and should not be silent).
 *
 * @param {ReadonlyArray<{ status: 'pass' | 'fail' }>} results
 * @returns {0 | 1}
 */
export function computeExitCode(results) {
  if (results.length === 0) return 1;
  return results.every((r) => r.status === 'pass') ? 0 : 1;
}
