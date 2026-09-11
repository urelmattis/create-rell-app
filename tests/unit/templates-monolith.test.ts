import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffoldProject } from '../../src/scaffold.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(HERE, '..', '..', 'templates');
const MONOLITH_DIR = join(TEMPLATES_DIR, 'monolith');
const WEB_DIR = join(MONOLITH_DIR, 'apps', 'web');
const MOBILE_DIR = join(MONOLITH_DIR, 'apps', 'mobile');
const SHARED_DIR = join(MONOLITH_DIR, 'packages', 'shared');

/**
 * Expected files in the monolith template. Paths are relative to
 * `templates/monolith/`. Apps live under `apps/`, libraries under
 * `packages/`. Underscore-prefixed files become dotted on scaffold output
 * (handled by src/scaffold.ts).
 */
const EXPECTED_TEMPLATE_FILES: ReadonlyArray<string> = [
  'package.json',
  'tsconfig.base.json',
  '_gitignore',
  'README.md',
  '_github/workflows/ci.yml',
  '_github/dependabot.yml',
  'CLAUDE.md',
  'apps/web/package.json',
  'apps/web/next.config.ts',
  'apps/web/_tsconfig.json',
  'apps/web/next-env.d.ts',
  'apps/web/app/layout.tsx',
  'apps/web/app/page.tsx',
  'apps/web/app/error.tsx',
  'apps/web/app/loading.tsx',
  'apps/web/app/globals.css',
  'apps/web/lib/env.ts',
  'apps/web/lib/logger.ts',
  'apps/web/lib/supabase/client.ts',
  'apps/web/lib/supabase/server.ts',
  'apps/web/middleware.ts',
  'apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx',
  'apps/web/app/(auth)/sign-up/[[...sign-up]]/page.tsx',
  'apps/web/app/dashboard/layout.tsx',
  'apps/web/app/dashboard/page.tsx',
  'apps/mobile/package.json',
  'apps/mobile/app.json',
  'apps/mobile/babel.config.js',
  'apps/mobile/_tsconfig.json',
  'apps/mobile/app/_layout.tsx',
  'apps/mobile/lib/env.ts',
  'apps/mobile/lib/token-cache.ts',
  'apps/mobile/lib/supabase/client.ts',
  'apps/mobile/app/(auth)/_layout.tsx',
  'apps/mobile/app/(auth)/sign-in.tsx',
  'apps/mobile/app/(auth)/sign-up.tsx',
  'apps/mobile/app/(tabs)/_layout.tsx',
  'apps/mobile/app/(tabs)/index.tsx',
  'packages/shared/package.json',
  'packages/shared/_tsconfig.json',
  'packages/shared/index.ts',
  'packages/shared/drizzle.config.ts',
  'packages/shared/db/README.md',
  'packages/shared/db/schema.ts',
  'packages/shared/db/client.ts',
  'packages/shared/db/queries.ts',
  'packages/shared/db/migrations/0000_initial.sql',
  'apps/web/lib/auth/current-user.ts',
  'apps/web/app/dashboard/billing/page.tsx',
  'apps/web/lib/env-server.ts',
  'apps/web/lib/billing/plan-to-role.ts',
  'apps/web/lib/billing/event-handler.ts',
  'apps/web/lib/rate-limit.ts',
  'apps/web/lib/flags.ts',
  'apps/web/app/api/webhooks/clerk-billing/route.ts',
  'apps/web/lib/auth/roles.ts',
  'apps/web/lib/auth/use-role.ts',
  'apps/web/app/api/me/role/route.ts',
  'apps/mobile/lib/auth/use-role.ts',
  'packages/shared/db/migrations/0001_rbac_helpers.sql',
  'packages/shared/db/migrations/0002_webhook_deliveries.sql',
  'apps/web/components/auth/RoleGate.tsx',
  'apps/web/components/auth/PaywallPrompt.tsx',
  'apps/web/app/dashboard/paid-feature/page.tsx',
  'apps/mobile/components/auth/RoleGate.tsx',
  'apps/mobile/components/auth/PaywallPrompt.tsx',
  'apps/web/stores/app-store.ts',
  'apps/web/components/shared/OnboardingGreeting.tsx',
  'apps/mobile/stores/app-store.ts',
  'packages/shared/validation/profile-form.ts',
  'apps/web/components/forms/ProfileForm.tsx',
  'apps/web/app/dashboard/settings/page.tsx',
  'apps/mobile/components/forms/ProfileForm.tsx',
  'apps/mobile/app/(tabs)/settings.tsx',
  'apps/web/postcss.config.mjs',
  'apps/web/components.json',
  'apps/web/lib/cn.ts',
  'apps/web/components/ui/Button.tsx',
  'apps/web/components/ui/Card.tsx',
  'apps/web/components/ui/Skeleton.tsx',
  'apps/web/components/shared/SkeletonCard.tsx',
  'apps/web/components/shared/SkeletonTable.tsx',
  'apps/web/app/dashboard/loading.tsx',
  'apps/mobile/tailwind.config.js',
  'apps/mobile/global.css',
  'apps/mobile/metro.config.js',
  'apps/mobile/nativewind-env.d.ts',
  'apps/mobile/components/shared/SkeletonCard.tsx',
  '_husky/pre-commit',
  'apps/web/_eslint.config.mjs',
  'apps/mobile/_eslint.config.mjs',
  'apps/web/scripts/check-env.mjs',
  'apps/mobile/scripts/check-env.mjs',
  'apps/web/_env.example',
  'apps/mobile/_env.example',
  'pnpm-workspace.yaml',
];

describe('templates/monolith static file shape', () => {
  it('contains every expected template file', async () => {
    const missing: string[] = [];
    for (const relative of EXPECTED_TEMPLATE_FILES) {
      try {
        await stat(join(MONOLITH_DIR, relative));
      } catch {
        missing.push(relative);
      }
    }
    expect(missing).toEqual([]);
  });

  it('root package.json declares workspaces and references {{projectName}}', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8');
    expect(text).toContain('"workspaces"');
    expect(text).toContain('"apps/*"');
    expect(text).toContain('"packages/*"');
    expect(text).toContain('{{projectName}}');
  });

  it('root package.json scripts reference {{pmRunCmd}} for workspace forwarding', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8');
    expect(text).toContain('{{pmRunCmd}}');
  });

  it('web/package.json pins Next.js + React to exact versions', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // Exact-version regex: no `^`, `~`, `>=`, or tags like `latest`.
    const exactVersion = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
    for (const [name, version] of Object.entries(parsed.dependencies)) {
      expect(
        exactVersion.test(version),
        `web dependency ${name} is not pinned exact: ${version}`,
      ).toBe(true);
    }
    for (const [name, version] of Object.entries(parsed.devDependencies)) {
      expect(
        exactVersion.test(version),
        `web devDependency ${name} is not pinned exact: ${version}`,
      ).toBe(true);
    }
    expect(parsed.dependencies.next).toBeDefined();
    expect(parsed.dependencies.react).toBeDefined();
    expect(parsed.dependencies['react-dom']).toBeDefined();
  });

  it('mobile/package.json pins Expo + React Native to exact versions', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const exactVersion = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
    for (const [name, version] of Object.entries(parsed.dependencies)) {
      expect(
        exactVersion.test(version),
        `mobile dependency ${name} is not pinned exact: ${version}`,
      ).toBe(true);
    }
    expect(parsed.dependencies.expo).toBeDefined();
    expect(parsed.dependencies['expo-router']).toBeDefined();
    expect(parsed.dependencies['react-native']).toBeDefined();
  });

  it('shared/package.json uses the scoped @{{projectNameKebab}}/shared name', async () => {
    const text = await readFile(join(SHARED_DIR, 'package.json'), 'utf8');
    expect(text).toContain('@{{projectNameKebab}}/shared');
  });

  it('web root layout includes the {{projectName}} metadata token', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'layout.tsx'), 'utf8');
    expect(text).toContain("title: '{{projectName}}'");
  });

  it('mobile app.json references {{projectName}} and {{projectNameKebab}}', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app.json'), 'utf8');
    expect(text).toContain('{{projectName}}');
    expect(text).toContain('{{projectNameKebab}}');
  });

  it('README documents workspace layout with {{projectName}}', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'README.md'), 'utf8');
    expect(text).toContain('{{projectName}}');
    expect(text).toContain('apps/');
    expect(text).toContain('web/');
    expect(text).toContain('mobile/');
    expect(text).toContain('packages/');
    expect(text).toContain('shared/');
  });

  it('monolith root scripts are package-manager-agnostic (no npm-only --prefix)', async () => {
    const pkg = JSON.parse(await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8'));
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      expect(cmd, `${name} must not use npm-only --prefix`).not.toContain('--prefix');
    }
    expect(pkg.scripts['dev:web']).toContain('cd apps/web');
    expect(pkg.scripts['lint']).toContain('cd apps/web');
    expect(pkg.scripts['db:migrate']).toContain('cd packages/shared');
  });

  it('monolith ships pnpm-workspace.yaml for pnpm workspace discovery', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'pnpm-workspace.yaml'), 'utf8');
    expect(text).toContain('apps/*');
    expect(text).toContain('packages/*');
  });

  // The shared package resolves via a TS path alias + an explicit @types/node
  // declaration rather than npm's implicit workspace hoisting, so `tsc -b`
  // passes under pnpm/yarn too (CI smoke only exercises npm — this is the guard).
  it('app tsconfigs alias @<project>/shared into packages/shared', async () => {
    for (const dir of [WEB_DIR, MOBILE_DIR]) {
      const text = await readFile(join(dir, '_tsconfig.json'), 'utf8');
      expect(text, `${dir} missing the shared path alias`).toContain(
        '@{{projectNameKebab}}/shared',
      );
      expect(text, `${dir} alias should point into packages/shared`).toContain('packages/shared');
    }
  });

  it('packages/shared declares @types/node (its tsconfig sets types:["node"])', async () => {
    const pkg = JSON.parse(await readFile(join(SHARED_DIR, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['@types/node']).toBeDefined();
  });
});

// === Story 2.2 — Clerk + Supabase native 3P auth assertions ===

describe('templates/monolith Clerk + Supabase wiring (Story 2.2)', () => {
  it('web root layout imports ClerkProvider from @clerk/nextjs and wraps children', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'layout.tsx'), 'utf8');
    expect(text).toContain("import { ClerkProvider } from '@clerk/nextjs'");
    expect(text).toContain('<ClerkProvider>');
    expect(text).toContain('{children}');
  });

  it('web Supabase client uses the accessToken callback (native 3P auth)', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'supabase', 'client.ts'), 'utf8');
    expect(text).toContain("from '@supabase/supabase-js'");
    expect(text).toContain("from '@clerk/nextjs'");
    expect(text).toContain('accessToken');
    expect(text).toContain('useSession');
    expect(text).toContain('getToken');
  });

  it('web server Supabase client uses auth() from @clerk/nextjs/server', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'supabase', 'server.ts'), 'utf8');
    expect(text).toContain("from '@clerk/nextjs/server'");
    expect(text).toContain("import 'server-only'");
    expect(text).toContain('accessToken');
  });

  it('mobile root layout imports ClerkProvider from @clerk/clerk-expo', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '_layout.tsx'), 'utf8');
    expect(text).toContain("from '@clerk/clerk-expo'");
    expect(text).toContain('<ClerkProvider');
    expect(text).toContain('tokenCache');
  });

  it('mobile Supabase client uses the accessToken callback', async () => {
    const text = await readFile(join(MOBILE_DIR, 'lib', 'supabase', 'client.ts'), 'utf8');
    expect(text).toContain("from '@supabase/supabase-js'");
    expect(text).toContain("from '@clerk/clerk-expo'");
    expect(text).toContain('accessToken');
    expect(text).toContain('useAuth');
  });

  it('mobile tokenCache is backed by expo-secure-store', async () => {
    const text = await readFile(join(MOBILE_DIR, 'lib', 'token-cache.ts'), 'utf8');
    expect(text).toContain("from 'expo-secure-store'");
    expect(text).toContain('getToken');
    expect(text).toContain('saveToken');
  });

  it('web/lib/env.ts validates public (NEXT_PUBLIC_) keys; server secrets live in env-server.ts', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    const serverText = await readFile(join(WEB_DIR, 'lib', 'env-server.ts'), 'utf8');
    expect(serverText).toContain('CLERK_SECRET_KEY');
  });

  it('mobile/lib/env.ts validates all required EXPO_PUBLIC keys', async () => {
    const text = await readFile(join(MOBILE_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(text).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(text).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('per-app _env.example files document every required key', async () => {
    const webText = await readFile(join(WEB_DIR, '_env.example'), 'utf8');
    const mobileText = await readFile(join(MOBILE_DIR, '_env.example'), 'utf8');
    const webKeys = [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ];
    const mobileKeys = [
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ];
    for (const key of webKeys) {
      expect(webText).toContain(key);
    }
    for (const key of mobileKeys) {
      expect(mobileText).toContain(key);
    }
  });

  it('web package.json pins @clerk/nextjs and @supabase/supabase-js', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['@clerk/nextjs']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['@supabase/supabase-js']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mobile package.json pins @clerk/clerk-expo, @supabase/supabase-js, expo-secure-store', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['@clerk/clerk-expo']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['@supabase/supabase-js']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['expo-secure-store']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mobile/lib/env.ts does not reference CLERK_SECRET_KEY (secret must stay server-side)', async () => {
    const text = await readFile(join(MOBILE_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).not.toContain('CLERK_SECRET_KEY');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('monolith web/lib/env.ts validates public env via Zod (one error for all missing keys)', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).toContain("import { z } from 'zod'");
    expect(text).toContain('z.object(');
    // Preserves the nested shape downstream code imports.
    expect(text).toContain('export const env');
    expect(text).toContain('publishableKey');
    expect(text).toContain('supabase');
    expect(text).not.toContain('requiredPublic');
  });

  it('monolith web/lib/env-server.ts uses server-only guard AND a Zod schema', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env-server.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain("import { z } from 'zod'");
    expect(text).toContain('z.object(');
    expect(text).toContain('export const serverEnv');
    expect(text).toContain('secretKey');
    expect(text).toContain('billingWebhookSigningSecret');
    expect(text).toContain('database');
    expect(text).not.toContain('requiredServer');
  });

  // === Story 2.3 — middleware + sign-in/sign-up + protected routes ===

  it('web middleware uses clerkMiddleware and createRouteMatcher from @clerk/nextjs/server', async () => {
    const text = await readFile(join(WEB_DIR, 'middleware.ts'), 'utf8');
    expect(text).toContain("from '@clerk/nextjs/server'");
    expect(text).toContain('clerkMiddleware');
    expect(text).toContain('createRouteMatcher');
    expect(text).toContain('auth.protect');
    expect(text).toContain('matcher');
  });

  it('web middleware protects (dashboard) route group with no bypass', async () => {
    const text = await readFile(join(WEB_DIR, 'middleware.ts'), 'utf8');
    expect(text).toContain('dashboard');
    // Matcher must not have a loose "public routes skip auth" pattern.
    expect(text).not.toContain('publicRoutes');
  });

  it('web sign-in page imports SignIn from @clerk/nextjs', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', '(auth)', 'sign-in', '[[...sign-in]]', 'page.tsx'),
      'utf8',
    );
    expect(text).toContain("import { SignIn } from '@clerk/nextjs'");
    expect(text).toContain('<SignIn />');
  });

  it('web sign-up page imports SignUp from @clerk/nextjs', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', '(auth)', 'sign-up', '[[...sign-up]]', 'page.tsx'),
      'utf8',
    );
    expect(text).toContain("import { SignUp } from '@clerk/nextjs'");
    expect(text).toContain('<SignUp />');
  });

  it('web dashboard layout uses auth() + redirects unauthenticated users', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'layout.tsx'), 'utf8');
    expect(text).toContain("from '@clerk/nextjs/server'");
    expect(text).toContain('auth()');
    expect(text).toContain('redirect');
  });

  it('web dashboard layout uses UserButton', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'layout.tsx'), 'utf8');
    expect(text).toContain('UserButton');
  });

  it('web middleware dashboard matcher targets the real /dashboard URL (not a parenthesized group)', async () => {
    const text = await readFile(join(WEB_DIR, 'middleware.ts'), 'utf8');
    expect(text).toContain("'/dashboard(.*)'");
    // The parenthesized route group form is a bug — it would never match.
    expect(text).not.toContain('/(dashboard)');
  });

  it('mobile (auth)/sign-in uses useSignIn from @clerk/clerk-expo', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '(auth)', 'sign-in.tsx'), 'utf8');
    expect(text).toContain("import { useSignIn } from '@clerk/clerk-expo'");
    expect(text).toContain('signIn.create');
  });

  it('mobile (auth)/sign-up uses useSignUp from @clerk/clerk-expo', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '(auth)', 'sign-up.tsx'), 'utf8');
    expect(text).toContain("import { useSignUp } from '@clerk/clerk-expo'");
    expect(text).toContain('signUp.create');
  });

  it('mobile (tabs)/_layout.tsx redirects unauthenticated users via useAuth', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '(tabs)', '_layout.tsx'), 'utf8');
    expect(text).toContain("from '@clerk/clerk-expo'");
    expect(text).toContain('useAuth');
    expect(text).toContain('Redirect');
    expect(text).toContain('sign-in');
  });

  it('mobile root layout uses Slot (routing delegated to nested layouts)', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '_layout.tsx'), 'utf8');
    expect(text).toContain("from 'expo-router'");
    expect(text).toContain('Slot');
    // Old Story 2.1 used Stack.Screen name="index" — confirm we migrated.
    expect(text).not.toContain('Stack.Screen');
  });

  it('mobile/app/index.tsx was removed (replaced by (tabs)/index.tsx)', async () => {
    await expect(stat(join(MOBILE_DIR, 'app', 'index.tsx'))).rejects.toBeDefined();
  });

  // === Story 2.4 — Drizzle schema, queries, migrations ===

  it('shared/package.json pins drizzle-orm, postgres, drizzle-kit', async () => {
    const text = await readFile(join(SHARED_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const exact = /^\d+\.\d+\.\d+$/;
    expect(parsed.dependencies['drizzle-orm']).toMatch(exact);
    expect(parsed.dependencies['postgres']).toMatch(exact);
    expect(parsed.devDependencies['drizzle-kit']).toMatch(exact);
  });

  it('shared/db/schema.ts defines user_roles table with correct columns and naming', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'schema.ts'), 'utf8');
    // Table name — relax whitespace matching by searching for the literal
    // first-arg string anywhere in the file.
    expect(text).toMatch(/pgTable\(\s*'user_roles'/);
    // Column names (snake_case strings) — Drizzle uses `.text('clerk_user_id')`
    expect(text).toContain("'clerk_user_id'");
    expect(text).toContain("'created_at'");
    expect(text).toContain("'updated_at'");
    // Index name
    expect(text).toContain('idx_user_roles_clerk_user_id');
    // Role enum
    expect(text).toContain("'super_admin'");
    expect(text).toContain("'paid'");
    expect(text).toContain("'free'");
  });

  it('shared/db/schema.ts exports UserRole + NewUserRole + Role types', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'schema.ts'), 'utf8');
    expect(text).toContain('export type UserRole');
    expect(text).toContain('export type NewUserRole');
    expect(text).toContain('export type Role');
    expect(text).toContain('$inferSelect');
    expect(text).toContain('$inferInsert');
  });

  it('shared/db/client.ts uses drizzle + postgres and reads DATABASE_URL lazily', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'client.ts'), 'utf8');
    expect(text).toContain("from 'drizzle-orm/postgres-js'");
    expect(text).toContain("from 'postgres'");
    expect(text).toContain('DATABASE_URL');
    // Lazy-initialized client (review fix: module-load throw would break
    // next build on machines without DATABASE_URL set).
    expect(text).toContain('export function getDb');
    expect(text).toContain('cachedDb');
  });

  it('shared/db/queries.ts exports typed select + upsert helpers', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'queries.ts'), 'utf8');
    expect(text).toContain('getUserRoleByClerkId');
    expect(text).toContain('setUserRole');
    expect(text).toContain('eq');
    expect(text).toContain('onConflictDoUpdate');
    expect(text).toContain('returning');
  });

  it('shared/db/migrations/0000_initial.sql creates user_roles with RLS + auth.jwt sub policy', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'migrations', '0000_initial.sql'), 'utf8');
    expect(text).toContain('CREATE TABLE');
    expect(text).toContain('user_roles');
    expect(text).toContain('ENABLE ROW LEVEL SECURITY');
    expect(text).toContain("auth.jwt()->>'sub'");
    expect(text).toContain('select_user_roles_own');
    expect(text).toContain('CREATE POLICY');
    // The 'super_admin' literal appears in the CHECK constraint on the
    // role column even though the admin SELECT policy is intentionally
    // deferred to Story 3.3 (avoids recursive RLS lookup).
    expect(text).toContain("'super_admin'");
  });

  it('shared/index.ts re-exports schema and queries', async () => {
    const text = await readFile(join(SHARED_DIR, 'index.ts'), 'utf8');
    expect(text).toContain("from './db/schema'");
    expect(text).toContain("from './db/queries'");
  });

  it('web/next.config.ts transpiles @{{projectNameKebab}}/shared', async () => {
    const text = await readFile(join(WEB_DIR, 'next.config.ts'), 'utf8');
    expect(text).toContain('transpilePackages');
    expect(text).toContain('@{{projectNameKebab}}/shared');
  });

  it('monolith root package.json has db:generate / db:migrate / db:studio scripts', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8');
    expect(text).toContain('db:generate');
    expect(text).toContain('db:migrate');
    expect(text).toContain('db:studio');
  });

  it('shared/drizzle.config.ts points at the schema and Postgres dialect', async () => {
    const text = await readFile(join(SHARED_DIR, 'drizzle.config.ts'), 'utf8');
    expect(text).toContain("schema: './db/schema.ts'");
    expect(text).toContain("dialect: 'postgresql'");
    expect(text).toContain('DATABASE_URL');
  });

  // === Story 3.1 — Clerk Billing pricing page ===

  it('current-user helper reads auth() + getDb + getUserRoleByClerkId', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'auth', 'current-user.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain("from '@clerk/nextjs/server'");
    expect(text).toContain('getUserRoleByClerkId');
    expect(text).toContain('getDb');
    expect(text).toContain('getCurrentUserWithRole');
    // Default to 'free' when no row exists
    expect(text).toContain("'free'");
  });

  it('billing page uses Clerk PricingTable and shows the current role', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'billing', 'page.tsx'), 'utf8');
    expect(text).toContain("import { PricingTable } from '@clerk/nextjs'");
    expect(text).toContain('<PricingTable />');
    expect(text).toContain('getCurrentUserWithRole');
    expect(text).toContain('Current plan');
  });

  it('dashboard landing page links to /dashboard/billing', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'page.tsx'), 'utf8');
    expect(text).toContain("from 'next/link'");
    expect(text).toContain('/dashboard/billing');
  });

  it('web _env.example documents CLERK_BILLING_WEBHOOK_SIGNING_SECRET', async () => {
    const text = await readFile(join(WEB_DIR, '_env.example'), 'utf8');
    expect(text).toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
  });

  // === Story 3.2 — Billing webhook ===

  it('web package.json pins svix for webhook signature verification', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['svix']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('web/lib/env-server.ts reads CLERK_BILLING_WEBHOOK_SIGNING_SECRET behind server-only guard', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env-server.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
    expect(text).toContain('billingWebhookSigningSecret');
    expect(text).toContain('CLERK_SECRET_KEY');
    expect(text).toContain('export const serverEnv');
  });

  it('web/lib/env.ts is browser-safe and does not reference server secrets', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'env.ts'), 'utf8');
    expect(text).not.toContain("import 'server-only'");
    expect(text).not.toContain('CLERK_SECRET_KEY');
    expect(text).not.toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
    // Only NEXT_PUBLIC_* keys allowed in the browser-safe env.
    expect(text).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(text).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('plan-to-role.ts maps paid_tier to paid and defaults unknown to free', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'plan-to-role.ts'), 'utf8');
    expect(text).toContain("'paid_tier'");
    expect(text).toContain("return 'paid'");
    expect(text).toContain("'admin_tier'");
    expect(text).toContain("return 'super_admin'");
    expect(text).toContain("return 'free'");
    // Unknown plan must default to free (least privilege).
    expect(text).toContain('unknown plan');
  });

  it('event-handler.ts handles user.created + subscription.created + subscription.cancelled', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain("'user.created'");
    expect(text).toContain("'subscription.created'");
    expect(text).toContain("'subscription.updated'");
    expect(text).toContain("'subscription.cancelled'");
    expect(text).toContain("'subscription.deleted'");
    expect(text).toContain('setUserRole');
    expect(text).toContain('getDb');
    expect(text).toContain('planToRole');
  });

  it('event-handler downgrades cancelled subscriptions to free', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    // Look for the cancelled+deleted case block setting role 'free'.
    expect(text).toMatch(/subscription\.cancelled[\s\S]*setUserRole[\s\S]*'free'/);
  });

  it('event-handler returns processed:false for unknown event types', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    expect(text).toContain('processed: false');
    expect(text).toContain('default:');
  });

  it('clerk-billing route.ts reads raw body BEFORE any JSON parsing (svix requires raw HMAC body)', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    // Confirm req.text() appears before any req.json()
    expect(text).toContain('req.text()');
    expect(text).not.toContain('req.json()');
  });

  it('clerk-billing route.ts verifies svix signature and returns 400 on failure', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    expect(text).toContain("from 'svix'");
    expect(text).toContain('Webhook');
    expect(text).toContain('wh.verify');
    expect(text).toContain('svix-id');
    expect(text).toContain('svix-timestamp');
    expect(text).toContain('svix-signature');
    expect(text).toContain('status: 400');
  });

  it('clerk-billing route.ts delegates to handleBillingEvent and returns 500 on handler error', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    expect(text).toContain('handleBillingEvent');
    expect(text).toContain('status: 500');
  });

  it('clerk-billing route.ts does not leak internal errors in the response body', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    // Generic error responses only.
    expect(text).toContain("error: 'Invalid signature'");
    expect(text).toContain("error: 'Webhook processing failed'");
    // No stack trace or raw error message in the response.
    expect(text).not.toMatch(/error:\s*\(err as Error\)\.message/);
  });

  it('billing page documents that subscription management lives in Clerk UserButton', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'billing', 'page.tsx'), 'utf8');
    expect(text).toContain('UserButton');
  });

  // === Story 3.3 — Three-tier RBAC ===

  it('web/lib/auth/roles.ts exports hasRole / isAdmin / isPaid with server-only guard', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'auth', 'roles.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    // Helpers are wrapped in React's cache() to dedupe within a single render,
    // so each symbol is exported as a `const` rather than as an `async function`.
    expect(text).toContain("import { cache } from 'react'");
    expect(text).toContain('export const hasRole = cache(');
    expect(text).toContain('export const currentUserHasRole = cache(');
    expect(text).toContain('export const isAdmin = cache(');
    expect(text).toContain('export const isPaid = cache(');
    expect(text).toContain('getUserRoleByClerkId');
    expect(text).toContain('getDb');
    // isPaid must return true for super_admin (admins implicitly have paid access)
    expect(text).toMatch(/isPaid[\s\S]*super_admin/);
  });

  it('web/lib/auth/use-role.ts is a client hook fetching /api/me/role', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'auth', 'use-role.ts'), 'utf8');
    expect(text).toContain("'use client'");
    expect(text).toContain("from '@clerk/nextjs'");
    expect(text).toContain('useAuth');
    expect(text).toContain("'/api/me/role'");
    expect(text).toContain('useState');
    expect(text).toContain('useEffect');
    expect(text).toContain('export function useRole');
  });

  it('/api/me/role route handler reads auth() and returns JSON', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'api', 'me', 'role', 'route.ts'), 'utf8');
    expect(text).toContain('export async function GET');
    expect(text).toContain("from '@clerk/nextjs/server'");
    expect(text).toContain('auth()');
    expect(text).toContain('status: 401');
    expect(text).toContain('role');
    expect(text).toContain('getCurrentUserWithRole');
  });

  it('mobile/lib/auth/use-role.ts queries Supabase directly via useSupabaseClient', async () => {
    const text = await readFile(join(MOBILE_DIR, 'lib', 'auth', 'use-role.ts'), 'utf8');
    expect(text).toContain("from '@clerk/clerk-expo'");
    expect(text).toContain('useSupabaseClient');
    expect(text).toContain("'user_roles'");
    expect(text).toContain('clerk_user_id');
    expect(text).toContain('export function useRole');
  });

  it('0001_rbac_helpers.sql creates is_super_admin SECURITY DEFINER function', async () => {
    const text = await readFile(
      join(SHARED_DIR, 'db', 'migrations', '0001_rbac_helpers.sql'),
      'utf8',
    );
    expect(text).toContain('CREATE OR REPLACE FUNCTION public.is_super_admin');
    expect(text).toContain('SECURITY DEFINER');
    expect(text).toContain('SET search_path = public');
    expect(text).toContain("auth.jwt()->>'sub'");
    expect(text).toContain("role = 'super_admin'");
    expect(text).toContain('GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated');
  });

  it('0001_rbac_helpers.sql adds the select_user_roles_admin policy using the helper', async () => {
    const text = await readFile(
      join(SHARED_DIR, 'db', 'migrations', '0001_rbac_helpers.sql'),
      'utf8',
    );
    expect(text).toContain('CREATE POLICY "select_user_roles_admin"');
    expect(text).toContain('public.is_super_admin()');
    expect(text).toContain('FOR SELECT');
    expect(text).toContain('TO authenticated');
  });

  // === Story 3.4 — Paywall + RoleGate ===

  it('web RoleGate is a client component using useRole + hierarchy check', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'auth', 'RoleGate.tsx'), 'utf8');
    expect(text).toContain("'use client'");
    expect(text).toContain('useRole');
    expect(text).toContain('hasRequiredRole');
    expect(text).toContain('HIERARCHY');
    // Super admin > paid > free ordering
    expect(text).toMatch(/'free'[\s\S]*'paid'[\s\S]*'super_admin'/);
    expect(text).toContain('PaywallPrompt');
    expect(text).toContain('isLoading');
  });

  it('web RoleGate renders fallback on insufficient role and default to PaywallPrompt', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'auth', 'RoleGate.tsx'), 'utf8');
    expect(text).toContain('fallback ?? <PaywallPrompt />');
  });

  it('web PaywallPrompt links to /dashboard/billing via next/link', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'auth', 'PaywallPrompt.tsx'), 'utf8');
    expect(text).toContain("from 'next/link'");
    expect(text).toContain('/dashboard/billing');
  });

  it('demo paid-feature page uses RoleGate with requiredRole="paid"', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'dashboard', 'paid-feature', 'page.tsx'),
      'utf8',
    );
    expect(text).toContain('RoleGate');
    expect(text).toContain('requiredRole="paid"');
  });

  it('mobile RoleGate uses the mobile useRole hook', async () => {
    const text = await readFile(join(MOBILE_DIR, 'components', 'auth', 'RoleGate.tsx'), 'utf8');
    expect(text).toContain('useRole');
    expect(text).toContain('PaywallPrompt');
    expect(text).toContain('HIERARCHY');
    // Mobile imports from the relative path, not an '@' alias
    expect(text).toContain("from '../../lib/auth/use-role'");
  });

  it('mobile PaywallPrompt uses expo-router Link + React Native primitives', async () => {
    const text = await readFile(
      join(MOBILE_DIR, 'components', 'auth', 'PaywallPrompt.tsx'),
      'utf8',
    );
    expect(text).toContain("from 'expo-router'");
    expect(text).toContain("from 'react-native'");
    expect(text).toContain('Text');
    expect(text).toContain('View');
  });

  it('hierarchy ordering is the same on web and mobile RoleGate', async () => {
    const webText = await readFile(join(WEB_DIR, 'components', 'auth', 'RoleGate.tsx'), 'utf8');
    const mobileText = await readFile(
      join(MOBILE_DIR, 'components', 'auth', 'RoleGate.tsx'),
      'utf8',
    );
    // Both files should define the same hierarchy literal.
    const pattern = /HIERARCHY[^\n]*=[^\n]*\['free',\s*'paid',\s*'super_admin'\]/;
    expect(webText).toMatch(pattern);
    expect(mobileText).toMatch(pattern);
  });

  // === Story 4.1 — Zustand stores with persistence ===

  it('web app-store is a client module using zustand + persist + createJSONStorage', async () => {
    const text = await readFile(join(WEB_DIR, 'stores', 'app-store.ts'), 'utf8');
    expect(text).toContain("'use client'");
    expect(text).toContain("from 'zustand'");
    expect(text).toContain("from 'zustand/middleware'");
    expect(text).toContain('persist');
    expect(text).toContain('createJSONStorage');
    expect(text).toContain('useAppStore');
  });

  it('web app-store returns undefined storage on the server (SSR-safe)', async () => {
    const text = await readFile(join(WEB_DIR, 'stores', 'app-store.ts'), 'utf8');
    // Guard the window reference so Next.js server components don't crash.
    expect(text).toContain("typeof window !== 'undefined'");
    expect(text).toContain('window.localStorage');
  });

  it('web app-store partialize excludes ephemeral drawerOpen from persistence', async () => {
    const text = await readFile(join(WEB_DIR, 'stores', 'app-store.ts'), 'utf8');
    expect(text).toContain('partialize');
    // The partialized object must mention theme + onboardingComplete but NOT drawerOpen.
    expect(text).toMatch(/partialize:[\s\S]*theme:[\s\S]*onboardingComplete/);
    expect(text).not.toMatch(/partialize:[\s\S]*drawerOpen/);
  });

  it('web app-store uses the projectNameKebab-app storage key token', async () => {
    const text = await readFile(join(WEB_DIR, 'stores', 'app-store.ts'), 'utf8');
    expect(text).toContain('{{projectNameKebab}}-app');
  });

  it('mobile app-store uses zustand + persist backed by react-native-mmkv', async () => {
    const text = await readFile(join(MOBILE_DIR, 'stores', 'app-store.ts'), 'utf8');
    expect(text).toContain("from 'zustand'");
    expect(text).toContain("from 'zustand/middleware'");
    expect(text).toContain("from 'react-native-mmkv'");
    expect(text).toContain('new MMKV');
    expect(text).toContain('persist');
    expect(text).toContain('createJSONStorage');
    expect(text).toContain('useAppStore');
  });

  it('mobile app-store wraps MMKV in a StateStorage adapter', async () => {
    const text = await readFile(join(MOBILE_DIR, 'stores', 'app-store.ts'), 'utf8');
    expect(text).toContain('StateStorage');
    expect(text).toContain('getItem');
    expect(text).toContain('setItem');
    expect(text).toContain('removeItem');
  });

  it('mobile app-store partialize excludes drawerOpen from persistence', async () => {
    const text = await readFile(join(MOBILE_DIR, 'stores', 'app-store.ts'), 'utf8');
    expect(text).toContain('partialize');
    expect(text).toMatch(/partialize:[\s\S]*theme:[\s\S]*onboardingComplete/);
    expect(text).not.toMatch(/partialize:[\s\S]*drawerOpen/);
  });

  it('web AppState and mobile AppState share the same slice shape', async () => {
    const webText = await readFile(join(WEB_DIR, 'stores', 'app-store.ts'), 'utf8');
    const mobileText = await readFile(join(MOBILE_DIR, 'stores', 'app-store.ts'), 'utf8');
    // Both files must export the same AppState shape so shared code can
    // depend on it without forking on platform.
    const fields = ['theme: Theme', 'onboardingComplete: boolean', 'drawerOpen: boolean'];
    for (const field of fields) {
      expect(webText).toContain(field);
      expect(mobileText).toContain(field);
    }
    for (const action of ['setTheme', 'completeOnboarding', 'toggleDrawer']) {
      expect(webText).toContain(action);
      expect(mobileText).toContain(action);
    }
  });

  it('web dashboard page imports OnboardingGreeting (store demo consumer)', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'page.tsx'), 'utf8');
    expect(text).toContain('OnboardingGreeting');
    expect(text).toContain('@/components/shared/OnboardingGreeting');
  });

  it('web OnboardingGreeting is a client component reading useAppStore', async () => {
    const text = await readFile(
      join(WEB_DIR, 'components', 'shared', 'OnboardingGreeting.tsx'),
      'utf8',
    );
    expect(text).toContain("'use client'");
    expect(text).toContain('useAppStore');
    expect(text).toContain('onboardingComplete');
    expect(text).toContain('@/stores/app-store');
  });

  it('mobile home tab imports useAppStore to prove the store works', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '(tabs)', 'index.tsx'), 'utf8');
    expect(text).toContain('useAppStore');
    expect(text).toContain('../../stores/app-store');
  });

  it('web package.json pins zustand', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['zustand']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mobile package.json pins zustand + react-native-mmkv', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['zustand']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['react-native-mmkv']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // === Story 4.2 — React Hook Form + Zod ===

  it('shared profile-form schema uses z.object and derives its type via z.infer', async () => {
    const text = await readFile(join(SHARED_DIR, 'validation', 'profile-form.ts'), 'utf8');
    expect(text).toContain("from 'zod'");
    expect(text).toContain('export const profileFormSchema');
    expect(text).toContain('z.object');
    expect(text).toContain('export type ProfileFormValues');
    expect(text).toContain('z.infer<typeof profileFormSchema>');
  });

  it('shared profile-form schema defines displayName + bio + website with validation', async () => {
    const text = await readFile(join(SHARED_DIR, 'validation', 'profile-form.ts'), 'utf8');
    expect(text).toContain('displayName');
    expect(text).toContain('.min(2');
    expect(text).toContain('.max(60');
    expect(text).toContain('bio');
    expect(text).toContain('.max(280');
    expect(text).toContain('website');
    expect(text).toContain('.url(');
  });

  it('shared/index.ts re-exports the profile-form schema', async () => {
    const text = await readFile(join(SHARED_DIR, 'index.ts'), 'utf8');
    expect(text).toContain("from './validation/profile-form'");
  });

  it('shared/package.json pins zod', async () => {
    const text = await readFile(join(SHARED_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['zod']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('web ProfileForm is a client component using useForm + standardSchemaResolver', async () => {
    // Monolith uses standardSchemaResolver (not zodResolver) because Zod v4
    // implements the Standard Schema spec and the standard-schema resolver
    // avoids cross-workspace type resolution issues with zodResolver.
    const text = await readFile(join(WEB_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain("'use client'");
    expect(text).toContain("from 'react-hook-form'");
    expect(text).toContain("from '@hookform/resolvers/standard-schema'");
    expect(text).toContain('useForm');
    expect(text).toContain('standardSchemaResolver(profileFormSchema)');
  });

  it('web ProfileForm imports the shared schema via the workspace package', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain('@{{projectNameKebab}}/shared');
    expect(text).toContain('profileFormSchema');
    expect(text).toContain('ProfileFormValues');
  });

  it('web ProfileForm renders inline per-field error messages with role="alert"', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain('role="alert"');
    expect(text).toContain('errors.displayName');
    expect(text).toContain('errors.bio');
    expect(text).toContain('errors.website');
  });

  it('web settings page renders <ProfileForm />', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'settings', 'page.tsx'), 'utf8');
    expect(text).toContain("from '@/components/forms/ProfileForm'");
    expect(text).toContain('<ProfileForm />');
  });

  it('mobile ProfileForm uses Controller (RHF pattern for uncontrolled RN inputs)', async () => {
    const text = await readFile(join(MOBILE_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain("from 'react-hook-form'");
    expect(text).toContain('Controller');
    expect(text).toContain("from 'react-native'");
    expect(text).toContain('TextInput');
  });

  it('mobile ProfileForm imports the shared schema via the workspace package', async () => {
    const text = await readFile(join(MOBILE_DIR, 'components', 'forms', 'ProfileForm.tsx'), 'utf8');
    expect(text).toContain('@{{projectNameKebab}}/shared');
    expect(text).toContain('profileFormSchema');
    expect(text).toContain('ProfileFormValues');
  });

  it('mobile settings tab renders <ProfileForm />', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '(tabs)', 'settings.tsx'), 'utf8');
    expect(text).toContain('ProfileForm');
    expect(text).toContain('../../components/forms/ProfileForm');
  });

  it('mobile tabs layout registers the settings tab', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '(tabs)', '_layout.tsx'), 'utf8');
    expect(text).toContain('name="settings"');
  });

  it('web package.json pins react-hook-form, @hookform/resolvers, zod', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['react-hook-form']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['@hookform/resolvers']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['zod']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mobile package.json pins react-hook-form, @hookform/resolvers, zod', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['react-hook-form']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['@hookform/resolvers']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['zod']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // === Story 4.3 — Tailwind 4, shadcn base components, NativeWind ===

  it('web postcss.config.mjs registers @tailwindcss/postcss', async () => {
    const text = await readFile(join(WEB_DIR, 'postcss.config.mjs'), 'utf8');
    expect(text).toContain('@tailwindcss/postcss');
  });

  it('web globals.css imports Tailwind v4 CSS-first', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'globals.css'), 'utf8');
    expect(text).toContain("@import 'tailwindcss'");
  });

  it('web cn.ts combines clsx + tailwind-merge', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'cn.ts'), 'utf8');
    expect(text).toContain("from 'clsx'");
    expect(text).toContain("from 'tailwind-merge'");
    expect(text).toContain('twMerge(clsx');
    expect(text).toContain('export function cn');
  });

  it('web components.json is a valid shadcn config pointing to cn alias', async () => {
    const text = await readFile(join(WEB_DIR, 'components.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      tsx: boolean;
      rsc: boolean;
      aliases: { ui: string; utils: string };
      tailwind: { css: string };
    };
    expect(parsed.tsx).toBe(true);
    expect(parsed.rsc).toBe(true);
    expect(parsed.aliases.ui).toBe('@/components/ui');
    expect(parsed.aliases.utils).toBe('@/lib/cn');
    expect(parsed.tailwind.css).toBe('app/globals.css');
  });

  it('web Button uses cn() and forwardRef', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'ui', 'Button.tsx'), 'utf8');
    expect(text).toContain("from '@/lib/cn'");
    expect(text).toContain('forwardRef');
    expect(text).toContain('cn(');
    expect(text).toContain('variantClasses');
  });

  it('web Card exports Card, CardHeader, CardTitle, CardContent', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'ui', 'Card.tsx'), 'utf8');
    expect(text).toContain('export function Card');
    expect(text).toContain('export function CardHeader');
    expect(text).toContain('export function CardTitle');
    expect(text).toContain('export function CardContent');
    expect(text).toContain('cn(');
  });

  it('web Skeleton primitive uses animate-pulse and is aria-hidden', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'ui', 'Skeleton.tsx'), 'utf8');
    expect(text).toContain('animate-pulse');
    expect(text).toContain('aria-hidden');
    expect(text).toContain('cn(');
  });

  it('web SkeletonCard composes base Skeleton + Card primitives', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'shared', 'SkeletonCard.tsx'), 'utf8');
    expect(text).toContain("from '@/components/ui/Card'");
    expect(text).toContain("from '@/components/ui/Skeleton'");
    expect(text).toContain('aria-busy');
  });

  it('web SkeletonTable accepts rowCount and marks the region aria-busy', async () => {
    const text = await readFile(join(WEB_DIR, 'components', 'shared', 'SkeletonTable.tsx'), 'utf8');
    expect(text).toContain('rowCount');
    expect(text).toContain('aria-busy');
    expect(text).toContain('Array.from');
  });

  it('web dashboard loading.tsx renders SkeletonCard as route-level loader', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'loading.tsx'), 'utf8');
    expect(text).toContain('SkeletonCard');
    expect(text).toContain('@/components/shared/SkeletonCard');
    expect(text).toContain('<main');
    expect(text).toContain('aria-label');
  });

  it('web dashboard layout uses semantic <header>, <nav aria-label>, and <main>', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'layout.tsx'), 'utf8');
    expect(text).toContain('<header');
    expect(text).toContain('<nav aria-label="Primary"');
    expect(text).toContain('<main');
    expect(text).toContain('aria-label="Dashboard content"');
  });

  it('web billing page uses aria-labelledby on the section heading', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'dashboard', 'billing', 'page.tsx'), 'utf8');
    expect(text).toContain('aria-labelledby="billing-heading"');
    expect(text).toContain('id="billing-heading"');
  });

  it('web package.json pins tailwindcss, @tailwindcss/postcss, tailwind-merge, clsx', async () => {
    const text = await readFile(join(WEB_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.devDependencies['tailwindcss']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.devDependencies['@tailwindcss/postcss']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['tailwind-merge']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['clsx']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mobile tailwind.config.js uses the NativeWind preset and targets app/components globs', async () => {
    const text = await readFile(join(MOBILE_DIR, 'tailwind.config.js'), 'utf8');
    expect(text).toContain("require('nativewind/preset')");
    expect(text).toContain('./app/**/*.{ts,tsx}');
    expect(text).toContain('./components/**/*.{ts,tsx}');
  });

  it('mobile global.css contains the Tailwind directives', async () => {
    const text = await readFile(join(MOBILE_DIR, 'global.css'), 'utf8');
    expect(text).toContain('@tailwind base');
    expect(text).toContain('@tailwind components');
    expect(text).toContain('@tailwind utilities');
  });

  it('mobile metro.config.js wraps the Expo config with withNativeWind', async () => {
    const text = await readFile(join(MOBILE_DIR, 'metro.config.js'), 'utf8');
    expect(text).toContain("require('expo/metro-config')");
    expect(text).toContain("require('nativewind/metro')");
    expect(text).toContain('withNativeWind');
    expect(text).toContain("input: './global.css'");
  });

  it('mobile babel.config.js chains nativewind/babel after babel-preset-expo', async () => {
    const text = await readFile(join(MOBILE_DIR, 'babel.config.js'), 'utf8');
    expect(text).toContain('babel-preset-expo');
    expect(text).toContain("jsxImportSource: 'nativewind'");
    expect(text).toContain("'nativewind/babel'");
  });

  it('mobile nativewind-env.d.ts references nativewind/types', async () => {
    const text = await readFile(join(MOBILE_DIR, 'nativewind-env.d.ts'), 'utf8');
    expect(text).toContain('/// <reference types="nativewind/types" />');
  });

  it('mobile _tsconfig.json includes nativewind-env.d.ts', async () => {
    const text = await readFile(join(MOBILE_DIR, '_tsconfig.json'), 'utf8');
    expect(text).toContain('nativewind-env.d.ts');
  });

  it('mobile root layout imports global.css so Metro picks up NativeWind styles', async () => {
    const text = await readFile(join(MOBILE_DIR, 'app', '_layout.tsx'), 'utf8');
    expect(text).toContain("import '../global.css'");
  });

  it('mobile SkeletonCard uses className (NativeWind) on RN primitives', async () => {
    const text = await readFile(
      join(MOBILE_DIR, 'components', 'shared', 'SkeletonCard.tsx'),
      'utf8',
    );
    expect(text).toContain("from 'react-native'");
    expect(text).toContain('className=');
    expect(text).toContain('accessibilityRole');
  });

  it('mobile package.json pins nativewind, tailwindcss, react-native-reanimated', async () => {
    const text = await readFile(join(MOBILE_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies['nativewind']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.devDependencies['tailwindcss']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies['react-native-reanimated']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // === Story 4.4 — ESLint, Prettier, Husky, DX ===

  it('_husky/pre-commit runs lint-staged', async () => {
    const text = await readFile(join(MONOLITH_DIR, '_husky', 'pre-commit'), 'utf8');
    expect(text).toContain('lint-staged');
  });

  it('root package.json has lint, format, format:check, prepare scripts', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      scripts: Record<string, string>;
    };
    expect(parsed.scripts['lint']).toBeDefined();
    expect(parsed.scripts['format']).toBe('prettier --write .');
    expect(parsed.scripts['format:check']).toBe('prettier --check .');
    expect(parsed.scripts['prepare']).toBe('husky');
  });

  it('root package.json declares lint-staged and prettier config blocks', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      'lint-staged': Record<string, string[] | string>;
      prettier: Record<string, unknown>;
    };
    expect(parsed['lint-staged']).toBeDefined();
    expect(parsed.prettier).toBeDefined();
    expect(parsed.prettier['singleQuote']).toBe(true);
    expect(parsed['lint-staged']['*.{ts,tsx}']).toBeDefined();
  });

  it('root package.json pins husky, lint-staged, prettier, eslint, typescript-eslint, eslint-config-next', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      devDependencies: Record<string, string>;
    };
    const exact = /^\d+\.\d+\.\d+$/;
    expect(parsed.devDependencies['husky']).toMatch(exact);
    expect(parsed.devDependencies['lint-staged']).toMatch(exact);
    expect(parsed.devDependencies['prettier']).toMatch(exact);
    expect(parsed.devDependencies['eslint']).toMatch(exact);
    expect(parsed.devDependencies['typescript-eslint']).toMatch(exact);
    expect(parsed.devDependencies['eslint-config-next']).toMatch(exact);
    expect(parsed.devDependencies['eslint-config-prettier']).toMatch(exact);
  });

  it('web _eslint.config.mjs extends eslint-config-next and eslint-config-prettier', async () => {
    // Story 6.1: Next.js 16 renamed the flat-config entry point — it's no
    // longer under the `/flat` subpath and no longer a factory function.
    // The package default export is now a flat-config array, spread via
    // `...next`.
    const text = await readFile(join(WEB_DIR, '_eslint.config.mjs'), 'utf8');
    expect(text).toContain("from 'eslint-config-next'");
    expect(text).not.toContain("from 'eslint-config-next/flat'");
    expect(text).toContain("from 'eslint-config-prettier'");
    expect(text).toContain('no-explicit-any');
  });

  it('mobile _eslint.config.mjs uses typescript-eslint + prettier disable', async () => {
    const text = await readFile(join(MOBILE_DIR, '_eslint.config.mjs'), 'utf8');
    expect(text).toContain("from 'typescript-eslint'");
    expect(text).toContain("from 'eslint-config-prettier'");
    expect(text).toContain('__DEV__');
    expect(text).toContain('no-explicit-any');
  });

  it('tsconfig.base.json enables strict + noUncheckedIndexedAccess', async () => {
    const text = await readFile(join(MONOLITH_DIR, 'tsconfig.base.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(parsed.compilerOptions['strict']).toBe(true);
    expect(parsed.compilerOptions['noUncheckedIndexedAccess']).toBe(true);
    expect(parsed.compilerOptions['noImplicitOverride']).toBe(true);
  });

  it('_gitignore excludes .env files, secrets, and .husky/_ internal dir', async () => {
    const text = await readFile(join(MONOLITH_DIR, '_gitignore'), 'utf8');
    expect(text).toContain('.env');
    expect(text).toContain('.env.local');
    expect(text).toContain('!.env.example');
    expect(text).toContain('credentials.json');
    expect(text).toContain('*.pem');
    expect(text).toContain('*.key');
    expect(text).toContain('.husky/_');
  });

  it('supabase client.ts comments explain native 3P auth and warn against deprecated JWT template', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'supabase', 'client.ts'), 'utf8');
    // The comment block must mention the native callback AND explicitly
    // warn against the deprecated JWT template pattern.
    expect(text).toMatch(/native[^\n]*(third-party|3P)/i);
    expect(text).toContain('accessToken');
    expect(text).toContain('deprecated');
  });

  it('initial migration comments explain RLS construction and auth.jwt sub', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'migrations', '0000_initial.sql'), 'utf8');
    expect(text).toContain('RLS');
    expect(text).toContain("auth.jwt()->>'sub'");
    expect(text).toContain('deprecated');
  });

  it('clerk-billing route.ts comments explain signature validation on raw body', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    // Comments must mention signature validation running before JSON parse.
    expect(text).toMatch(/signature[^\n]*BEFORE/i);
    expect(text).toContain('raw');
    expect(text).toContain('HMAC');
  });

  // === Webhook replay safety (svix-id dedupe + user.created insert-only) ===

  it('monolith apps/web package.json has no duplicate dependency keys', async () => {
    // Regression guard — an earlier edit left two `"zod"` keys on adjacent
    // lines inside `dependencies`, which JSON.parse silently collapses.
    // Parse each dependency-bearing block naively by counting key
    // occurrences so a duplicate sneaking back in fails loudly. Scoped to
    // the dependency objects so legitimate top-level config blocks like
    // `"prettier"` don't collide with their devDep entries.
    const text = await readFile(join(MONOLITH_DIR, 'apps', 'web', 'package.json'), 'utf8');
    const blocks: Array<[string, string]> = [];
    for (const key of ['dependencies', 'devDependencies', 'scripts'] as const) {
      const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
      if (match?.[1]) blocks.push([key, match[1]]);
    }
    const dupes: Array<{ block: string; key: string; count: number }> = [];
    for (const [blockName, body] of blocks) {
      const keys = body.match(/"[^"]+"\s*:/g) ?? [];
      const counts = new Map<string, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const [key, count] of counts) {
        if (count > 1) dupes.push({ block: blockName, key, count });
      }
    }
    expect(dupes).toEqual([]);
  });

  it('monolith apps/web package.json declares full DX parity with the solo web template', async () => {
    // The monolith's apps/web package used to declare only a handful of
    // runtime deps because drizzle + eslint etc. lived at the root. Once the
    // web app gained its own db scripts and prettier/lint-staged blocks, it
    // needed the full toolchain too — bring it to parity with the solo
    // templates/web/package.json.
    const text = await readFile(join(MONOLITH_DIR, 'apps', 'web', 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      prettier?: unknown;
      'lint-staged'?: unknown;
    };
    // Drizzle scripts
    expect(parsed.scripts['db:generate']).toBe('drizzle-kit generate');
    expect(parsed.scripts['db:migrate']).toBe('drizzle-kit migrate');
    expect(parsed.scripts['db:push']).toBe('drizzle-kit push');
    expect(parsed.scripts['db:studio']).toBe('drizzle-kit studio');
    // Runtime deps
    expect(parsed.dependencies['drizzle-orm']).toBeDefined();
    expect(parsed.dependencies['postgres']).toBeDefined();
    // Dev toolchain
    expect(parsed.devDependencies['drizzle-kit']).toBeDefined();
    expect(parsed.devDependencies['eslint']).toBeDefined();
    expect(parsed.devDependencies['eslint-config-next']).toBeDefined();
    expect(parsed.devDependencies['eslint-config-prettier']).toBeDefined();
    expect(parsed.devDependencies['typescript-eslint']).toBeDefined();
    expect(parsed.devDependencies['@eslint/js']).toBeDefined();
    expect(parsed.devDependencies['@tailwindcss/postcss']).toBeDefined();
    expect(parsed.devDependencies['tailwindcss']).toBeDefined();
    expect(parsed.devDependencies['@types/node']).toBeDefined();
    expect(parsed.devDependencies['@types/react']).toBeDefined();
    expect(parsed.devDependencies['@types/react-dom']).toBeDefined();
    expect(parsed.devDependencies['husky']).toBeDefined();
    expect(parsed.devDependencies['lint-staged']).toBeDefined();
    expect(parsed.devDependencies['prettier']).toBeDefined();
    // Config blocks
    expect(parsed.prettier).toBeDefined();
    expect(parsed['lint-staged']).toBeDefined();
  });

  it('monolith apps/web package.json pins the same versions as templates/web/package.json', async () => {
    // The two files should share every dep name, pinned to the exact same
    // version. If someone bumps one without the other, the smoke builds
    // drift silently — guard against that here.
    const monoText = await readFile(join(MONOLITH_DIR, 'apps', 'web', 'package.json'), 'utf8');
    const soloText = await readFile(join(TEMPLATES_DIR, 'web', 'package.json'), 'utf8');
    const mono = JSON.parse(monoText) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const solo = JSON.parse(soloText) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const name of Object.keys(solo.dependencies)) {
      expect(
        mono.dependencies[name],
        `monolith apps/web missing or drifted dependency ${name}`,
      ).toBe(solo.dependencies[name]);
    }
    for (const name of Object.keys(solo.devDependencies)) {
      expect(
        mono.devDependencies[name],
        `monolith apps/web missing or drifted devDependency ${name}`,
      ).toBe(solo.devDependencies[name]);
    }
  });

  it('shared/db/schema.ts exports the webhookDeliveries table for svix replay dedupe', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'schema.ts'), 'utf8');
    expect(text).toContain('export const webhookDeliveries');
    expect(text).toContain("'webhook_deliveries'");
    expect(text).toContain("'svix_id'");
    expect(text).toContain("'event_type'");
    expect(text).toContain("'processed_at'");
    expect(text).toContain('export type WebhookDelivery');
  });

  it('shared/db/queries.ts exports insertDefaultUserRole and markWebhookSeen', async () => {
    const text = await readFile(join(SHARED_DIR, 'db', 'queries.ts'), 'utf8');
    expect(text).toContain('export async function insertDefaultUserRole');
    expect(text).toContain('export async function markWebhookSeen');
    // Both helpers must use ON CONFLICT DO NOTHING (insert-only semantics).
    expect(text).toContain('onConflictDoNothing');
  });

  it('shared/db/migrations/0002_webhook_deliveries.sql creates the dedupe table with RLS', async () => {
    const text = await readFile(
      join(SHARED_DIR, 'db', 'migrations', '0002_webhook_deliveries.sql'),
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
    // Result should still report role 'free'.
    expect(block).toContain("role: 'free'");
  });

  it('event-handler.ts imports insertDefaultUserRole and markWebhookSeen from shared', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    expect(text).toContain('insertDefaultUserRole');
    expect(text).toContain('markWebhookSeen');
  });

  it('event-handler.ts accepts an optional svixId and short-circuits replays', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'event-handler.ts'), 'utf8');
    // Signature: handleBillingEvent(event, svixId?)
    expect(text).toMatch(/handleBillingEvent\(\s*[\s\S]*event:[\s\S]*svixId\?:\s*string/);
    // Must call markWebhookSeen with svixId before the switch.
    expect(text).toContain('markWebhookSeen(db, svixId, event.type)');
  });

  it('clerk-billing route.ts forwards svixId into handleBillingEvent', async () => {
    const text = await readFile(
      join(WEB_DIR, 'app', 'api', 'webhooks', 'clerk-billing', 'route.ts'),
      'utf8',
    );
    expect(text).toContain('handleBillingEvent(verifiedEvent, svixId)');
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
    await walk(MONOLITH_DIR);

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

describe('templates/monolith security hardening', () => {
  it('apps/web/lib/rate-limit.ts exists and exports rateLimit', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'rate-limit.ts'), 'utf8');
    expect(text).toContain("import 'server-only'");
    expect(text).toContain('export async function rateLimit');
    expect(text).toContain('RateLimitResult');
  });

  it('apps/web/lib/flags.ts exists and exports a flag() helper', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'flags.ts'), 'utf8');
    expect(text).toContain('export function flag');
    expect(text).toContain('NEXT_PUBLIC_FLAG_');
    expect(text).toContain('FLAG_');
  });

  it('apps/web/app/api/me/role/route.ts imports rateLimit and sets Cache-Control on success', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'api', 'me', 'role', 'route.ts'), 'utf8');
    expect(text).toContain("from '@/lib/rate-limit'");
    expect(text).toContain('rateLimit(');
    expect(text).toContain('Retry-After');
    expect(text).toContain('status: 429');
    expect(text).toContain('Cache-Control');
    expect(text).toContain('private, max-age=30, stale-while-revalidate=60');
  });

  it('apps/web/next.config.ts ships core security headers including Strict-Transport-Security', async () => {
    const text = await readFile(join(WEB_DIR, 'next.config.ts'), 'utf8');
    expect(text).toMatch(/async\s+headers\s*\(\s*\)/);
    expect(text).toContain('Strict-Transport-Security');
    expect(text).toContain('X-Frame-Options');
    expect(text).toContain('X-Content-Type-Options');
    expect(text).toContain('Referrer-Policy');
    expect(text).toContain('Permissions-Policy');
    // Clerk CSP doc reference for users who want to enable CSP themselves.
    expect(text).toContain('clerk.com/docs/security/clerk-csp');
    // transpilePackages for the shared workspace must still be present.
    expect(text).toContain('transpilePackages');
  });

  it('apps/web/app/error.tsx redacts error.message in production', async () => {
    const text = await readFile(join(WEB_DIR, 'app', 'error.tsx'), 'utf8');
    expect(text).toContain("process.env.NODE_ENV === 'production'");
    // The dev branch still exposes error.message.
    expect(text).toContain('error.message');
  });

  it('apps/web/lib/billing/plan-to-role.ts sanitizes the unknown-plan log output', async () => {
    const text = await readFile(join(WEB_DIR, 'lib', 'billing', 'plan-to-role.ts'), 'utf8');
    expect(text).toContain('safeKey');
    expect(text).toContain('.slice(0, 40)');
    // The raw planKey must not be passed directly into console.warn anymore.
    expect(text).not.toMatch(/console\.warn\([^)]*planKey\s*\)/);
  });
});

describe('templates/monolith end-to-end scaffold', () => {
  let tempRoot: string;
  let targetDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'crapp-mono-scaffold-'));
    targetDir = join(tempRoot, 'my-app');
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
      templateDir: MONOLITH_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'monolith', pm: 'pnpm' },
    });

    // +2 for the auto-generated .env.local siblings (one per app)
    expect(result.filesWritten).toBe(EXPECTED_TEMPLATE_FILES.length + 2);

    const files = await walkAllFiles(targetDir);
    const textExtensions = new Set(['.ts', '.tsx', '.js', '.json', '.md', '.css', '.example', '']);
    // Files that intentionally keep unknown tokens (e.g. the README's list of
    // token examples referencing {{pmInstallCmd}} after substitution) are
    // covered by the pm* substitutions — after Story 1.4 those tokens all
    // resolve. Any leftover {{...}} at this point is a bug.
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

  it('renames _gitignore to .gitignore and per-app _env.example to .env.example', async () => {
    await scaffoldProject({
      templateDir: MONOLITH_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'monolith', pm: 'pnpm' },
    });

    const files = await walkAllFiles(targetDir);
    expect(files).toContain('.gitignore');
    expect(files).toContain('apps/web/.env.example');
    expect(files).toContain('apps/mobile/.env.example');
    expect(files).not.toContain('_gitignore');
    expect(files).not.toContain('_env.example');
  });

  it('renames _husky directory to .husky and ships the pre-commit hook (Story 4.4)', async () => {
    await scaffoldProject({
      templateDir: MONOLITH_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'monolith', pm: 'pnpm' },
    });

    const files = await walkAllFiles(targetDir);
    expect(files).toContain('.husky/pre-commit');
    // The underscore-prefixed path must not leak through.
    expect(files.some((f) => f.startsWith('_husky/'))).toBe(false);

    // Hook content should be the minimal husky v9 form — no husky.sh source.
    const hookText = await readFile(join(targetDir, '.husky', 'pre-commit'), 'utf8');
    expect(hookText).toContain('lint-staged');
    expect(hookText).not.toContain('husky.sh');
  });

  it('substitutes projectName correctly across web + mobile entry files', async () => {
    await scaffoldProject({
      templateDir: MONOLITH_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'monolith', pm: 'pnpm' },
    });

    const layout = await readFile(join(targetDir, 'apps', 'web', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain("title: 'my-app'");

    const appJson = await readFile(join(targetDir, 'apps', 'mobile', 'app.json'), 'utf8');
    expect(appJson).toContain('"name": "my-app"');
    expect(appJson).toContain('"slug": "my-app"');

    const sharedPkg = await readFile(join(targetDir, 'packages', 'shared', 'package.json'), 'utf8');
    expect(sharedPkg).toContain('@my-app/shared');
  });

  it('substitutes pm-specific commands in the README', async () => {
    await scaffoldProject({
      templateDir: MONOLITH_DIR,
      targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'monolith', pm: 'pnpm' },
    });

    const readme = await readFile(join(targetDir, 'README.md'), 'utf8');
    expect(readme).toContain('pnpm install');
    expect(readme).toContain('pnpm run');
  });
});
