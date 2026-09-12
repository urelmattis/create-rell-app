import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffoldProject } from '../../src/scaffold.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(HERE, '..', '..', 'templates');
const MOBILE_DIR = join(TEMPLATES_DIR, 'mobile');

/**
 * Expected files in the solo mobile template. Mirrors the monolith's mobile/
 * file set but with shared/db and shared/validation inlined into the root.
 */
const EXPECTED_MOBILE_FILES: ReadonlyArray<string> = [
  // Root configs
  'package.json',
  '_tsconfig.json',
  '_gitignore',
  '_gitattributes',
  '_env.example',
  '_husky/pre-commit',
  'README.md',
  '_github/workflows/ci.yml',
  '_github/dependabot.yml',
  'CLAUDE.md',
  'app.json',
  'babel.config.js',
  'metro.config.js',
  'tailwind.config.js',
  'nativewind-env.d.ts',
  'global.css',
  '_eslint.config.mjs',
  'drizzle.config.ts',
  // db/
  'db/README.md',
  'db/schema.ts',
  'db/queries.ts',
  'db/client.ts',
  'db/migrations/0000_initial.sql',
  'db/migrations/0001_rbac_helpers.sql',
  'db/migrations/0002_webhook_deliveries.sql',
  // lib/
  'lib/env.ts',
  'lib/token-cache.ts',
  'lib/supabase/client.ts',
  'lib/auth/use-role.ts',
  'lib/validation/profile-form.ts',
  // app/
  'app/_layout.tsx',
  'app/(auth)/_layout.tsx',
  'app/(auth)/sign-in.tsx',
  'app/(auth)/sign-up.tsx',
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/settings.tsx',
  // components/
  'components/auth/RoleGate.tsx',
  'components/auth/PaywallPrompt.tsx',
  'components/forms/ProfileForm.tsx',
  'components/shared/SkeletonCard.tsx',
  // stores/
  'stores/app-store.ts',
  // scripts/
  'scripts/check-env.mjs',
];

describe('templates/mobile static file shape (Story 5.2)', () => {
  it('contains every expected template file', async () => {
    const missing: string[] = [];
    for (const relative of EXPECTED_MOBILE_FILES) {
      try {
        await stat(join(MOBILE_DIR, relative));
      } catch {
        missing.push(relative);
      }
    }
    expect(missing).toEqual([]);
  });

  it('package.json is a single standalone package — no workspaces field', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      name: string;
      main: string;
      scripts: Record<string, string>;
      workspaces?: unknown;
      prettier?: unknown;
      'lint-staged'?: unknown;
    };
    expect(parsed.name).toBe('{{projectName}}');
    expect(parsed.main).toBe('expo-router/entry');
    expect(parsed.workspaces).toBeUndefined();
    expect(parsed.scripts['start']).toBe('expo start');
    expect(parsed.scripts['lint']).toBeDefined();
    expect(parsed.scripts['format']).toBe('prettier --write .');
    expect(parsed.scripts['prepare']).toBe('husky');
    expect(parsed.scripts['db:generate']).toBe('drizzle-kit generate');
    expect(parsed.prettier).toBeDefined();
    expect(parsed['lint-staged']).toBeDefined();
  });

  it('package.json pins drizzle-orm + postgres as deps and drizzle-kit as devDep', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const exact = /^\d+\.\d+\.\d+$/;
    expect(parsed.dependencies['drizzle-orm']).toMatch(exact);
    expect(parsed.dependencies['postgres']).toMatch(exact);
    expect(parsed.devDependencies['drizzle-kit']).toMatch(exact);
  });

  it('package.json devDeps include the full DX toolchain', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { devDependencies: Record<string, string> };
    const exact = /^\d+\.\d+\.\d+$/;
    expect(parsed.devDependencies['husky']).toMatch(exact);
    expect(parsed.devDependencies['lint-staged']).toMatch(exact);
    expect(parsed.devDependencies['prettier']).toMatch(exact);
    expect(parsed.devDependencies['eslint']).toMatch(exact);
    expect(parsed.devDependencies['typescript-eslint']).toMatch(exact);
    expect(parsed.devDependencies['eslint-config-prettier']).toMatch(exact);
  });

  it('_tsconfig.json is standalone — does not extend any base config', async () => {
    const text = await readFile(join(MOBILE_DIR, '_tsconfig.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      extends?: string;
      compilerOptions: Record<string, unknown>;
    };
    expect(parsed.extends).toBeUndefined();
    expect(parsed.compilerOptions['strict']).toBe(true);
    expect(parsed.compilerOptions['noUncheckedIndexedAccess']).toBe(true);
    expect(parsed.compilerOptions['jsx']).toBe('react-jsx');
    const paths = parsed.compilerOptions['paths'] as Record<string, string[]>;
    expect(paths['@/*']).toEqual(['./*']);
  });

  it('no template file imports from @{{projectNameKebab}}/shared', async () => {
    const filesToCheck: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const childPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(childPath);
        } else if (entry.isFile()) {
          filesToCheck.push(childPath);
        }
      }
    }
    await walk(MOBILE_DIR);

    const offenders: string[] = [];
    for (const file of filesToCheck) {
      const text = await readFile(file, 'utf8');
      if (text.includes('@{{projectNameKebab}}/shared')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no template file references workspaces or shared/db path', async () => {
    const filesToCheck: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const childPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(childPath);
        } else if (entry.isFile() && !entry.name.endsWith('.md')) {
          filesToCheck.push(childPath);
        }
      }
    }
    await walk(MOBILE_DIR);

    const offenders: string[] = [];
    const patterns = [/\bshared\/db\b/, /\bshared\/validation\b/, /"workspaces"/];
    for (const file of filesToCheck) {
      const text = await readFile(file, 'utf8');
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          offenders.push(`${file}: matched ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mobile useRole + RoleGate import Role from local ../../db/schema', async () => {
    const useRoleText = await readFile(join(MOBILE_DIR, 'lib', 'auth', 'use-role.ts'), 'utf8');
    expect(useRoleText).toContain("from '../../db/schema'");

    const roleGateText = await readFile(
      join(MOBILE_DIR, 'components', 'auth', 'RoleGate.tsx'),
      'utf8',
    );
    expect(roleGateText).toContain("from '../../db/schema'");
  });

  it('mobile ProfileForm imports the shared validation schema via local relative path', async () => {
    const text = await readFile(join(MOBILE_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain("from '../../lib/validation/profile-form'");
    expect(text).toContain('profileFormSchema');
  });

  it('db/schema.ts preserves the monolith behavior (user_roles + role enum)', async () => {
    const text = await readFile(join(MOBILE_DIR, 'db', 'schema.ts'), 'utf8');
    expect(text).toMatch(/pgTable\(\s*'user_roles'/);
    expect(text).toContain('export type Role');
    expect(text).toContain("'super_admin'");
    expect(text).toContain("'paid'");
    expect(text).toContain("'free'");
  });

  // === Webhook replay safety: schema + queries stay in lockstep with web ===

  it('db/schema.ts exports webhookDeliveries for cross-template consistency', async () => {
    // Mobile has no webhook handler, but the schema must stay in lockstep
    // with the web + monolith templates so drizzle-kit migrations generate
    // byte-identical output — see tests/unit/templates-consistency.test.ts.
    const text = await readFile(join(MOBILE_DIR, 'db', 'schema.ts'), 'utf8');
    expect(text).toContain('export const webhookDeliveries');
    expect(text).toContain("'webhook_deliveries'");
    expect(text).toContain("'svix_id'");
  });

  it('db/queries.ts exports insertDefaultUserRole and markWebhookSeen for consistency', async () => {
    const text = await readFile(join(MOBILE_DIR, 'db', 'queries.ts'), 'utf8');
    expect(text).toContain('export async function insertDefaultUserRole');
    expect(text).toContain('export async function markWebhookSeen');
    expect(text).toContain('onConflictDoNothing');
  });

  it('db/migrations/0002_webhook_deliveries.sql mirrors the web + monolith migration', async () => {
    const text = await readFile(
      join(MOBILE_DIR, 'db', 'migrations', '0002_webhook_deliveries.sql'),
      'utf8',
    );
    expect(text).toContain('CREATE TABLE IF NOT EXISTS "webhook_deliveries"');
    expect(text).toContain('"svix_id" text PRIMARY KEY');
    expect(text).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('db/client.ts warns that it is Node-only (dev tooling)', async () => {
    const text = await readFile(join(MOBILE_DIR, 'db', 'client.ts'), 'utf8');
    expect(text).toContain('Node');
    expect(text).toContain('useSupabaseClient');
  });

  it('drizzle.config.ts points at the local db/schema.ts', async () => {
    const text = await readFile(join(MOBILE_DIR, 'drizzle.config.ts'), 'utf8');
    expect(text).toContain("schema: './db/schema.ts'");
    expect(text).toContain("out: './db/migrations'");
    expect(text).toContain("dialect: 'postgresql'");
  });

  it('lib/env.ts validates public env via Zod (one error for all missing keys)', async () => {
    const text = await readFile(join(MOBILE_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).toContain("import { z } from 'zod'");
    expect(text).toContain('z.object(');
    // The exported shape downstream code imports must be preserved.
    expect(text).toContain('export const env');
    expect(text).toContain('publishableKey');
    expect(text).toContain('supabase');
    // Mobile env.ts is React Native — must NOT import server-only.
    expect(text).not.toContain("'server-only'");
    // The old hand-rolled helper must be gone — replaced by the Zod schema.
    expect(text).not.toContain('function required(');
  });

  it('_env.example contains only mobile vars (EXPO_PUBLIC_ keys)', async () => {
    const text = await readFile(join(MOBILE_DIR, '_env.example'), 'utf8');
    expect(text).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(text).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(text).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    // Web-only public vars must not appear.
    expect(text).not.toContain('NEXT_PUBLIC_');
    // And the web-only secrets must also stay out.
    expect(text).not.toContain('CLERK_SECRET_KEY');
    expect(text).not.toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
  });

  it('_husky/pre-commit runs lint-staged', async () => {
    const text = await readFile(join(MOBILE_DIR, '_husky', 'pre-commit'), 'utf8');
    expect(text).toContain('lint-staged');
  });

  it('no template file uses the deprecated getToken({ template: "supabase" }) JWT pattern', async () => {
    const filesToCheck: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const childPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(childPath);
        } else if (entry.isFile()) {
          filesToCheck.push(childPath);
        }
      }
    }
    await walk(MOBILE_DIR);

    const offenders: string[] = [];
    const deprecatedPatterns = [/template:\s*['"]supabase['"]/, /getToken\s*\(\s*\{\s*template:/];
    for (const file of filesToCheck) {
      const text = await readFile(file, 'utf8');
      for (const pattern of deprecatedPatterns) {
        if (pattern.test(text)) {
          offenders.push(`${file}: matched ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('templates/mobile end-to-end scaffold (Story 5.2)', () => {
  let tempRoot: string;
  let targetDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'crapp-mobile-scaffold-'));
    targetDir = join(tempRoot, 'my-mobile-app');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  async function walkAllFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function visit(dir: string, relative: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const childAbs = join(dir, entry.name);
        const childRel = relative === '' ? entry.name : relative + '/' + entry.name;
        if (entry.isDirectory()) {
          await visit(childAbs, childRel);
        } else if (entry.isFile()) {
          out.push(childRel);
        }
      }
    }
    await visit(root, '');
    return out;
  }

  it('produces a scaffold with no {{...}} tokens remaining in text files', async () => {
    const result = await scaffoldProject({
      templateDir: MOBILE_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-mobile-app', template: 'mobile', pm: 'pnpm' },
    });

    // +1 for the auto-generated .env.local sibling
    expect(result.filesWritten).toBe(EXPECTED_MOBILE_FILES.length + 1);

    const files = await walkAllFiles(targetDir);
    const textExtensions = new Set([
      '.ts',
      '.tsx',
      '.js',
      '.mjs',
      '.json',
      '.md',
      '.css',
      '.sql',
      '.example',
      '',
    ]);
    const leftoverTokens: Array<{ path: string; matches: string[] }> = [];
    for (const rel of files) {
      const ext = rel.includes('.') ? rel.slice(rel.lastIndexOf('.')) : '';
      if (!textExtensions.has(ext)) continue;
      const text = await readFile(join(targetDir, rel), 'utf8');
      const matches = text.match(/\{\{[\w]+\}\}/g);
      if (matches) leftoverTokens.push({ path: rel, matches });
    }

    expect(leftoverTokens).toEqual([]);
  });

  it('renames _gitignore, _env.example, _husky dotfiles', async () => {
    await scaffoldProject({
      templateDir: MOBILE_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-mobile-app', template: 'mobile', pm: 'pnpm' },
    });

    const files = await walkAllFiles(targetDir);
    expect(files).toContain('.gitignore');
    expect(files).toContain('.env.example');
    expect(files).toContain('.husky/pre-commit');
    expect(files).not.toContain('_gitignore');
    expect(files).not.toContain('_env.example');
  });

  it('substitutes projectName in package.json + app.json', async () => {
    await scaffoldProject({
      templateDir: MOBILE_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-mobile-app', template: 'mobile', pm: 'pnpm' },
    });

    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('my-mobile-app');

    const appJson = await readFile(join(targetDir, 'app.json'), 'utf8');
    expect(appJson).toContain('"name": "my-mobile-app"');
    expect(appJson).toContain('"slug": "my-mobile-app"');
  });
});
