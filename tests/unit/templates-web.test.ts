import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffoldProject } from '../../src/scaffold.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(HERE, '..', '..', 'templates');
const WEB_DIR = join(TEMPLATES_DIR, 'web');

/**
 * Expected files in the solo web template. Mirrors the monolith's web/ file
 * set but with the shared/ pieces inlined into db/ and lib/validation/.
 */
const EXPECTED_WEB_FILES: ReadonlyArray<string> = [
  // Root configs
  'package.json',
  '_tsconfig.json',
  '_gitignore',
  '_env.example',
  '_husky/pre-commit',
  'README.md',
  '_github/workflows/ci.yml',
  '_github/dependabot.yml',
  'CLAUDE.md',
  'next.config.ts',
  'next-env.d.ts',
  'postcss.config.mjs',
  'components.json',
  '_eslint.config.mjs',
  'middleware.ts',
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
  'lib/env-server.ts',
  'lib/logger.ts',
  'lib/cn.ts',
  'lib/supabase/client.ts',
  'lib/supabase/server.ts',
  'lib/auth/current-user.ts',
  'lib/auth/roles.ts',
  'lib/auth/use-role.ts',
  'lib/billing/plan-to-role.ts',
  'lib/billing/event-handler.ts',
  'lib/validation/profile-form.ts',
  'lib/rate-limit.ts',
  'lib/flags.ts',
  // app/
  'app/layout.tsx',
  'app/page.tsx',
  'app/error.tsx',
  'app/loading.tsx',
  'app/globals.css',
  'app/(auth)/sign-in/[[...sign-in]]/page.tsx',
  'app/(auth)/sign-up/[[...sign-up]]/page.tsx',
  'app/dashboard/layout.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/loading.tsx',
  'app/dashboard/billing/page.tsx',
  'app/dashboard/settings/page.tsx',
  'app/dashboard/paid-feature/page.tsx',
  'app/api/me/role/route.ts',
  'app/api/webhooks/clerk-billing/route.ts',
  // components/
  'components/ui/Button.tsx',
  'components/ui/Card.tsx',
  'components/ui/Skeleton.tsx',
  'components/shared/SkeletonCard.tsx',
  'components/shared/SkeletonTable.tsx',
  'components/shared/OnboardingGreeting.tsx',
  'components/auth/RoleGate.tsx',
  'components/auth/PaywallPrompt.tsx',
  'components/forms/ProfileForm.tsx',
  // stores/
  'stores/app-store.ts',
  // scripts/
  'scripts/check-env.mjs',
];

describe('templates/web static file shape (Story 5.1)', () => {
  it('contains every expected template file', async () => {
    const missing: string[] = [];
    for (const relative of EXPECTED_WEB_FILES) {
      try {
        await stat(join(WEB_DIR, relative));
      } catch {
        missing.push(relative);
      }
    }
    expect(missing).toEqual([]);
  });

  it('package.json is a single standalone package — no workspaces field', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      name: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      workspaces?: unknown;
      prettier?: unknown;
      'lint-staged'?: unknown;
    };
    expect(parsed.name).toBe('{{projectName}}');
    expect(parsed.workspaces).toBeUndefined();
    // Merged scripts from monolith root + web workspace
    expect(parsed.scripts['dev']).toBe('next dev');
    expect(parsed.scripts['build']).toBe('next build');
    // Story 6.1: Next.js 16 removed the `next lint` subcommand — invoke
    // ESLint directly via the flat config. The eslint.config.mjs still
    // extends `eslint-config-next/flat`, just without going through the
    // deprecated CLI wrapper.
    expect(parsed.scripts['lint']).toBe('eslint .');
    expect(parsed.scripts['format']).toBe('prettier --write .');
    expect(parsed.scripts['prepare']).toBe('husky');
    expect(parsed.scripts['db:generate']).toBe('drizzle-kit generate');
    expect(parsed.scripts['db:migrate']).toBe('drizzle-kit migrate');
    // Prettier + lint-staged config blocks merged in
    expect(parsed.prettier).toBeDefined();
    expect(parsed['lint-staged']).toBeDefined();
  });

  it('package.json pins drizzle-orm + postgres (previously in shared) as runtime deps', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['drizzle-orm']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['postgres']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('package.json devDeps include drizzle-kit + the full DX toolchain', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { devDependencies: Record<string, string> };
    const exact = /^\d+\.\d+\.\d+$/;
    expect(parsed.devDependencies['drizzle-kit']).toMatch(exact);
    expect(parsed.devDependencies['husky']).toMatch(exact);
    expect(parsed.devDependencies['lint-staged']).toMatch(exact);
    expect(parsed.devDependencies['prettier']).toMatch(exact);
    expect(parsed.devDependencies['eslint']).toMatch(exact);
    expect(parsed.devDependencies['eslint-config-next']).toMatch(exact);
    expect(parsed.devDependencies['typescript-eslint']).toMatch(exact);
    expect(parsed.devDependencies['tailwindcss']).toMatch(exact);
  });

  it('_tsconfig.json is standalone — does not extend any base config', async () => {
    const text = await readFile(join(WEB_DIR, '_tsconfig.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      extends?: string;
      compilerOptions: Record<string, unknown>;
    };
    expect(parsed.extends).toBeUndefined();
    expect(parsed.compilerOptions['strict']).toBe(true);
    expect(parsed.compilerOptions['noUncheckedIndexedAccess']).toBe(true);
    const paths = parsed.compilerOptions['paths'] as Record<string, string[]>;
    expect(paths['@/*']).toEqual(['./*']);
  });

  it('next.config.ts does not transpilePackages (no shared workspace)', async () => {
    const text = await readFile(join(WEB_DIR, 'next.config.ts'), 'utf8');
    expect(text).not.toContain('transpilePackages');
    expect(text).not.toContain('shared');
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
    await walk(WEB_DIR);

    const offenders: string[] = [];
    for (const file of filesToCheck) {
      const text = await readFile(file, 'utf8');
      if (text.includes('@{{projectNameKebab}}/shared')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no template file references the workspaces field or shared/db path', async () => {
    const filesToCheck: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const childPath = join(dir, entry.name);
        // Skip README — it may legitimately discuss monorepo alternatives.
        if (entry.isDirectory()) {
          await walk(childPath);
        } else if (entry.isFile() && !entry.name.endsWith('.md')) {
          filesToCheck.push(childPath);
        }
      }
    }
    await walk(WEB_DIR);

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

  it('current-user + roles helpers wrap their exports in React cache() for per-render dedupe', async () => {
    const currentUser = await readFile(join(WEB_DIR, 'lib', 'auth', 'current-user.ts'), 'utf8');
    const roles = await readFile(join(WEB_DIR, 'lib', 'auth', 'roles.ts'), 'utf8');

    // Both files must pull React's cache() helper and actually invoke it.
    // Without this, calling e.g. getCurrentUserWithRole() in a layout and
    // again in the page it wraps would hit the DB twice per render.
    expect(currentUser).toContain("import { cache } from 'react'");
    expect(currentUser).toContain('cache(');
    expect(currentUser).toContain('getCurrentUserWithRole = cache(');

    expect(roles).toContain("import { cache } from 'react'");
    expect(roles).toContain('cache(');
    expect(roles).toContain('hasRole = cache(');
    expect(roles).toContain('currentUserHasRole = cache(');
    expect(roles).toContain('isAdmin = cache(');
    expect(roles).toContain('isPaid = cache(');
  });

  it('use-role client hook uses a module-level in-flight cache to avoid a refetch storm', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'auth', 'use-role.ts'), 'utf8');
    // Shared module-level memo pattern (instead of per-component fetch).
    expect(text).toContain('let cachedRole');
    expect(text).toContain('let inFlight');
    expect(text).toContain('async function fetchRole');
    // The fetch must still hit the same endpoint.
    expect(text).toContain("'/api/me/role'");
  });

  it('ProfileForm does not ship a raw console.log — uses a dev-only warn instead', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).not.toMatch(/console\.log\s*\(/);
    expect(text).toContain("process.env.NODE_ENV !== 'production'");
    expect(text).toContain("console.warn('[ProfileForm] onSubmit not wired");
    expect(text).toContain('TODO');
  });

  it('current-user, roles, use-role, RoleGate all import from local @/db paths', async () => {
    const files = [
      join(WEB_DIR, 'lib', 'auth', 'current-user.ts'),
      join(WEB_DIR, 'lib', 'auth', 'roles.ts'),
      join(WEB_DIR, 'lib', 'auth', 'use-role.ts'),
      join(WEB_DIR, 'components', 'auth', 'RoleGate.tsx'),
      join(WEB_DIR, 'lib', 'billing', 'plan-to-role.ts'),
      join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'),
    ];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      // Each file must reference the local @/db alias and not the shared pkg.
      expect(text).toContain('@/db/');
    }
  });

  it('ProfileForm imports the shared validation schema via @/lib/validation/profile-form', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain("from '@/lib/validation/profile-form'");
    expect(text).toContain('profileFormSchema');
  });

  it('db/schema.ts and db/queries.ts preserve the monolith behavior (user_roles + typed queries)', async () => {
    const schemaText = await readFile(join(WEB_DIR, 'db', 'schema.ts'), 'utf8');
    expect(schemaText).toMatch(/pgTable\(\s*'user_roles'/);
    expect(schemaText).toContain('export type Role');
    expect(schemaText).toContain("'super_admin'");
    expect(schemaText).toContain("'paid'");
    expect(schemaText).toContain("'free'");

    const queriesText = await readFile(join(WEB_DIR, 'db', 'queries.ts'), 'utf8');
    expect(queriesText).toContain('getUserRoleByClerkId');
    expect(queriesText).toContain('setUserRole');
  });

  // === Webhook replay safety (svix-id dedupe + user.created insert-only) ===

  it('db/schema.ts exports webhookDeliveries table for svix replay dedupe', async () => {
    const text = await readFile(join(WEB_DIR, 'db', 'schema.ts'), 'utf8');
    expect(text).toContain('export const webhookDeliveries');
    expect(text).toContain("'webhook_deliveries'");
    expect(text).toContain("'svix_id'");
    expect(text).toContain("'event_type'");
    expect(text).toContain("'processed_at'");
    expect(text).toContain('export type WebhookDelivery');
  });

  it('db/queries.ts exports insertDefaultUserRole and markWebhookSeen', async () => {
    const text = await readFile(join(WEB_DIR, 'db', 'queries.ts'), 'utf8');
    expect(text).toContain('export async function insertDefaultUserRole');
    expect(text).toContain('export async function markWebhookSeen');
    expect(text).toContain('onConflictDoNothing');
  });

  it('db/migrations/0002_webhook_deliveries.sql creates the dedupe table with RLS', async () => {
    const text = await readFile(
      join(WEB_DIR, 'db', 'migrations', '0002_webhook_deliveries.sql'),
      'utf8',
    );
    expect(text).toContain('CREATE TABLE IF NOT EXISTS "webhook_deliveries"');
    expect(text).toContain('"svix_id" text PRIMARY KEY');
    expect(text).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('event-handler.ts user.created case uses insertDefaultUserRole (not setUserRole)', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    // Extract the user.created case block so we don't match setUserRole
    // references from the subscription.* cases.
    const match = text.match(/case 'user\.created':[\s\S]*?(?=case '|default:)/);
    expect(match).not.toBeNull();
    const block = match?.[0] ?? '';
    expect(block).not.toContain('setUserRole');
    expect(block).toContain('insertDefaultUserRole');
    expect(block).toContain("role: 'free'");
  });

  it('event-handler.ts imports insertDefaultUserRole and markWebhookSeen from @/db/queries', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    expect(text).toContain('insertDefaultUserRole');
    expect(text).toContain('markWebhookSeen');
    expect(text).toContain("from '@/db/queries'");
  });

  it('event-handler.ts accepts an optional svixId and short-circuits replays', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    expect(text).toMatch(/handleBillingEvent\(\s*[\s\S]*event:[\s\S]*svixId\?:\s*string/);
    expect(text).toContain('markWebhookSeen(db, svixId, event.type)');
  });

  it('clerk-billing route.ts forwards svixId into handleBillingEvent', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    expect(text).toContain('handleBillingEvent(verifiedEvent, svixId)');
  });

  it('db/migrations/0000_initial.sql preserves RLS policies + auth.jwt sub', async () => {
    const text = await readFile(join(WEB_DIR, 'db', 'migrations', '0000_initial.sql'), 'utf8');
    expect(text).toContain('ENABLE ROW LEVEL SECURITY');
    expect(text).toContain("auth.jwt()->>'sub'");
    expect(text).toContain('select_user_roles_own');
  });

  it('drizzle.config.ts points at the local db/schema.ts', async () => {
    const text = await readFile(join(WEB_DIR, 'drizzle.config.ts'), 'utf8');
    expect(text).toContain("schema: './db/schema.ts'");
    expect(text).toContain("out: './db/migrations'");
    expect(text).toContain("dialect: 'postgresql'");
  });

  it('lib/env.ts validates public env via Zod (one error for all missing keys)', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).toContain("import { z } from 'zod'");
    expect(text).toContain('z.object(');
    // The exported shape downstream code imports must be preserved.
    expect(text).toContain('export const env');
    expect(text).toContain('publishableKey');
    expect(text).toContain('supabase');
    // The old hand-rolled helper must be gone — replaced by the Zod schema.
    expect(text).not.toContain('requiredPublic');
  });

  it('lib/env-server.ts uses server-only guard AND a Zod schema', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env-server.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain("import { z } from 'zod'");
    expect(text).toContain('z.object(');
    expect(text).toContain('export const serverEnv');
    // Preserves the nested shape: serverEnv.clerk.secretKey etc.
    expect(text).toContain('secretKey');
    expect(text).toContain('billingWebhookSigningSecret');
    expect(text).toContain('database');
    // Old hand-rolled helper must be gone.
    expect(text).not.toContain('requiredServer');
  });

  it('_env.example contains only web vars (no EXPO_PUBLIC_ keys)', async () => {
    const text = await readFile(join(WEB_DIR, '_env.example'), 'utf8');
    expect(text).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(text).toContain('CLERK_SECRET_KEY');
    expect(text).toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(text).not.toContain('EXPO_PUBLIC_');
  });

  it('_husky/pre-commit runs lint-staged', async () => {
    const text = await readFile(join(WEB_DIR, '_husky', 'pre-commit'), 'utf8');
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
    await walk(WEB_DIR);

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

// === Security hardening batch — rate limiting, flags, CSP, error redaction ===

describe('templates/web security hardening', () => {
  it('lib/rate-limit.ts exists and exports rateLimit', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'rate-limit.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain('export async function rateLimit');
    expect(text).toContain('RateLimitResult');
  });

  it('lib/flags.ts exists and exports a flag() helper', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'flags.ts'), 'utf8');
    expect(text).toContain('export function flag');
    expect(text).toContain('NEXT_PUBLIC_FLAG_');
    expect(text).toContain('FLAG_');
  });

  it('app/api/me/role/route.ts imports rateLimit and sets Cache-Control on success', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'api', 'me', 'role', 'route.ts'), 'utf8');
    expect(text).toContain("from '@/lib/rate-limit'");
    expect(text).toContain('rateLimit(');
    expect(text).toContain('Retry-After');
    expect(text).toContain('status: 429');
    expect(text).toContain('Cache-Control');
    expect(text).toContain('private, max-age=30, stale-while-revalidate=60');
  });

  it('next.config.ts ships core security headers including Strict-Transport-Security', async () => {
    const text = await readFile(join(WEB_DIR, 'next.config.ts'), 'utf8');
    expect(text).toMatch(/async\s+headers\s*\(\s*\)/);
    expect(text).toContain('Strict-Transport-Security');
    expect(text).toContain('X-Frame-Options');
    expect(text).toContain('X-Content-Type-Options');
    expect(text).toContain('Referrer-Policy');
    expect(text).toContain('Permissions-Policy');
    // Clerk CSP doc reference for users who want to enable CSP themselves.
    expect(text).toContain('clerk.com/docs/security/clerk-csp');
  });

  it('app/error.tsx redacts error.message in production', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'error.tsx'), 'utf8');
    expect(text).toContain("process.env.NODE_ENV === 'production'");
    // The dev branch still exposes error.message.
    expect(text).toContain('error.message');
  });

  it('lib/billing/plan-to-role.ts sanitizes the unknown-plan log output', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'plan-to-role.ts'), 'utf8');
    expect(text).toContain('safeKey');
    expect(text).toContain('.slice(0, 40)');
    // The raw planKey must not be passed directly into console.warn anymore.
    expect(text).not.toMatch(/console\.warn\([^)]*planKey\s*\)/);
  });
});

describe('templates/web end-to-end scaffold (Story 5.1)', () => {
  let tempRoot: string;
  let targetDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'crapp-web-scaffold-'));
    targetDir = join(tempRoot, 'my-web-app');
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
      templateDir: WEB_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-web-app', template: 'web', pm: 'pnpm' },
    });

    // +1 for the auto-generated .env.local sibling
    expect(result.filesWritten).toBe(EXPECTED_WEB_FILES.length + 1);

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

  it('renames _gitignore to .gitignore, _env.example to .env.example, _husky to .husky', async () => {
    await scaffoldProject({
      templateDir: WEB_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-web-app', template: 'web', pm: 'pnpm' },
    });

    const files = await walkAllFiles(targetDir);
    expect(files).toContain('.gitignore');
    expect(files).toContain('.env.example');
    expect(files).toContain('.husky/pre-commit');
    expect(files).not.toContain('_gitignore');
    expect(files).not.toContain('_env.example');
    expect(files.some((f) => f.startsWith('_husky/'))).toBe(false);
  });

  it('substitutes projectName in package.json', async () => {
    await scaffoldProject({
      templateDir: WEB_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-web-app', template: 'web', pm: 'pnpm' },
    });

    const text = await readFile(join(targetDir, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { name: string };
    expect(parsed.name).toBe('my-web-app');
  });

  it('substitutes pm-specific commands in the README', async () => {
    await scaffoldProject({
      templateDir: WEB_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-web-app', template: 'web', pm: 'pnpm' },
    });

    const readme = await readFile(join(targetDir, 'README.md'), 'utf8');
    expect(readme).toContain('pnpm install');
    expect(readme).toContain('pnpm run');
  });
});
