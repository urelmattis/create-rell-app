import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDevCommand } from '../../src/banner.ts';

// ============================================================================
// Cross-template consistency suite (Story 5.3).
//
// These tests deliberately compare CONTENT across templates rather than
// verifying individual files. They catch drift between the monolith, solo
// web, and solo mobile templates — e.g. adding a new field to the monolith's
// AppState but forgetting to update the solo mobile store, or tweaking the
// RoleGate hierarchy on web but not mobile.
//
// Orthogonal to the per-template suites (templates-monolith, templates-web,
// templates-mobile) — those verify per-template correctness; this one
// verifies cross-template invariants.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(HERE, '..', '..', 'templates');

const MONOLITH_DIR = join(TEMPLATES_DIR, 'monolith');
const WEB_DIR = join(TEMPLATES_DIR, 'web');
const MOBILE_DIR = join(TEMPLATES_DIR, 'mobile');

// Locations of the three variants of a single conceptual file.
interface TripletLocations {
  monolith: string;
  web: string;
  mobile: string;
}

// Each template's "root directory" for root-level files (package.json, README,
// _gitignore, _husky/pre-commit).
const ROOT_DIRS: TripletLocations = {
  monolith: MONOLITH_DIR,
  web: WEB_DIR,
  mobile: MOBILE_DIR,
};

// Per-workspace roots inside the monolith template. Apps live under apps/,
// libraries under packages/.
const MONOLITH_WEB_DIR = join(MONOLITH_DIR, 'apps', 'web');
const MONOLITH_MOBILE_DIR = join(MONOLITH_DIR, 'apps', 'mobile');
const MONOLITH_SHARED_DIR = join(MONOLITH_DIR, 'packages', 'shared');
const MONOLITH_WEB_ENV = join(MONOLITH_WEB_DIR, '_env.example');
const MONOLITH_MOBILE_ENV = join(MONOLITH_MOBILE_DIR, '_env.example');

// Paths to the Drizzle schema file in each template. Monolith keeps it under
// packages/shared/db/; the solo templates inline it at db/ at the project root.
const SCHEMA_PATHS: TripletLocations = {
  monolith: join(MONOLITH_SHARED_DIR, 'db', 'schema.ts'),
  web: join(WEB_DIR, 'db', 'schema.ts'),
  mobile: join(MOBILE_DIR, 'db', 'schema.ts'),
};

// Paths to the initial RLS migration in each template.
const INITIAL_MIGRATION_PATHS: TripletLocations = {
  monolith: join(MONOLITH_SHARED_DIR, 'db', 'migrations', '0000_initial.sql'),
  web: join(WEB_DIR, 'db', 'migrations', '0000_initial.sql'),
  mobile: join(MOBILE_DIR, 'db', 'migrations', '0000_initial.sql'),
};

// Paths to the RoleGate component in each template.
const ROLE_GATE_PATHS: TripletLocations = {
  monolith: join(MONOLITH_WEB_DIR, 'components', 'auth', 'RoleGate.tsx'),
  web: join(WEB_DIR, 'components', 'auth', 'RoleGate.tsx'),
  mobile: join(MOBILE_DIR, 'components', 'auth', 'RoleGate.tsx'),
};

const MOBILE_ROLE_GATE_PATH = join(MOBILE_DIR, 'components', 'auth', 'RoleGate.tsx');

// Paths to the app-store for each "store-bearing" target. The monolith has
// two stores (web + mobile) under apps/; the solo templates have one each.
interface StorePaths {
  monolithWeb: string;
  monolithMobile: string;
  web: string;
  mobile: string;
}

const STORE_PATHS: StorePaths = {
  monolithWeb: join(MONOLITH_WEB_DIR, 'stores', 'app-store.ts'),
  monolithMobile: join(MONOLITH_MOBILE_DIR, 'stores', 'app-store.ts'),
  web: join(WEB_DIR, 'stores', 'app-store.ts'),
  mobile: join(MOBILE_DIR, 'stores', 'app-store.ts'),
};

// Paths to the Zod profile form schema in each template. Monolith keeps it
// in packages/shared/; solo templates inline it at lib/validation/.
const PROFILE_SCHEMA_PATHS: TripletLocations = {
  monolith: join(MONOLITH_SHARED_DIR, 'validation', 'profile-form.ts'),
  web: join(WEB_DIR, 'lib', 'validation', 'profile-form.ts'),
  mobile: join(MOBILE_DIR, 'lib', 'validation', 'profile-form.ts'),
};

const TEMPLATES = ['monolith', 'web', 'mobile'] as const;

// ===== Drizzle schema + naming =====

describe('cross-template DB naming consistency', () => {
  const expectedStringLiterals = [
    "'user_roles'",
    "'clerk_user_id'",
    "'created_at'",
    "'updated_at'",
    "'super_admin'",
    "'paid'",
    "'free'",
    'idx_user_roles_clerk_user_id',
  ];

  it.each(TEMPLATES)('schema.ts in %s template uses canonical DB naming', async (tpl) => {
    const text = await readFile(SCHEMA_PATHS[tpl], 'utf8');
    for (const literal of expectedStringLiterals) {
      expect(text, `${tpl} schema missing ${literal}`).toContain(literal);
    }
  });

  it.each(TEMPLATES)(
    '0000_initial.sql in %s uses same RLS policy name + auth.jwt sub',
    async (tpl) => {
      const text = await readFile(INITIAL_MIGRATION_PATHS[tpl], 'utf8');
      expect(text).toContain('ENABLE ROW LEVEL SECURITY');
      expect(text).toContain("auth.jwt()->>'sub'");
      expect(text).toContain('select_user_roles_own');
      expect(text).toContain('insert_user_roles_service');
      expect(text).toContain('update_user_roles_service');
    },
  );

  it('initial migration content is byte-identical across all three templates', async () => {
    const [mono, web, mobile] = await Promise.all([
      readFile(INITIAL_MIGRATION_PATHS.monolith, 'utf8'),
      readFile(INITIAL_MIGRATION_PATHS.web, 'utf8'),
      readFile(INITIAL_MIGRATION_PATHS.mobile, 'utf8'),
    ]);
    expect(web).toBe(mono);
    expect(mobile).toBe(mono);
  });

  it('0001_rbac_helpers.sql is byte-identical across all three templates', async () => {
    const paths = {
      monolith: join(MONOLITH_SHARED_DIR, 'db', 'migrations', '0001_rbac_helpers.sql'),
      web: join(WEB_DIR, 'db', 'migrations', '0001_rbac_helpers.sql'),
      mobile: join(MOBILE_DIR, 'db', 'migrations', '0001_rbac_helpers.sql'),
    };
    const [mono, web, mobile] = await Promise.all([
      readFile(paths.monolith, 'utf8'),
      readFile(paths.web, 'utf8'),
      readFile(paths.mobile, 'utf8'),
    ]);
    expect(web).toBe(mono);
    expect(mobile).toBe(mono);
  });

  it('0002_webhook_deliveries.sql is byte-identical across all three templates', async () => {
    const paths = {
      monolith: join(MONOLITH_SHARED_DIR, 'db', 'migrations', '0002_webhook_deliveries.sql'),
      web: join(WEB_DIR, 'db', 'migrations', '0002_webhook_deliveries.sql'),
      mobile: join(MOBILE_DIR, 'db', 'migrations', '0002_webhook_deliveries.sql'),
    };
    const [mono, web, mobile] = await Promise.all([
      readFile(paths.monolith, 'utf8'),
      readFile(paths.web, 'utf8'),
      readFile(paths.mobile, 'utf8'),
    ]);
    expect(web).toBe(mono);
    expect(mobile).toBe(mono);
  });

  it.each(TEMPLATES)(
    'schema.ts in %s template exports the webhookDeliveries table',
    async (tpl) => {
      const text = await readFile(SCHEMA_PATHS[tpl], 'utf8');
      expect(text).toContain('export const webhookDeliveries');
      expect(text).toContain("'webhook_deliveries'");
      expect(text).toContain("'svix_id'");
      expect(text).toContain("'event_type'");
      expect(text).toContain("'processed_at'");
    },
  );

  it.each(TEMPLATES)('queries.ts in %s template exports the replay-safe helpers', async (tpl) => {
    const queriesPath =
      tpl === 'monolith'
        ? join(MONOLITH_SHARED_DIR, 'db', 'queries.ts')
        : tpl === 'web'
          ? join(WEB_DIR, 'db', 'queries.ts')
          : join(MOBILE_DIR, 'db', 'queries.ts');
    const text = await readFile(queriesPath, 'utf8');
    expect(text).toContain('export async function insertDefaultUserRole');
    expect(text).toContain('export async function markWebhookSeen');
    expect(text).toContain('onConflictDoNothing');
  });
});

// ===== Env var naming =====

describe('cross-template environment variable naming', () => {
  it('web examples document NEXT_PUBLIC_CLERK/SUPABASE keys + CLERK_SECRET_KEY', async () => {
    for (const p of [join(WEB_DIR, '_env.example'), MONOLITH_WEB_ENV]) {
      const text = await readFile(p, 'utf8');
      expect(text).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
      expect(text).toContain('CLERK_SECRET_KEY');
      expect(text).toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
      expect(text).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(text).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
  });

  it('mobile examples document EXPO_PUBLIC_CLERK/SUPABASE keys (and no server secrets)', async () => {
    for (const p of [join(MOBILE_DIR, '_env.example'), MONOLITH_MOBILE_ENV]) {
      const text = await readFile(p, 'utf8');
      expect(text).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
      expect(text).toContain('EXPO_PUBLIC_SUPABASE_URL');
      expect(text).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
      expect(text).not.toContain('NEXT_PUBLIC_');
      expect(text).not.toContain('CLERK_SECRET_KEY');
    }
  });

  it('solo web _env.example does NOT leak mobile EXPO_PUBLIC_ keys', async () => {
    const text = await readFile(join(WEB_DIR, '_env.example'), 'utf8');
    expect(text).not.toContain('EXPO_PUBLIC_');
  });

  it('solo mobile _env.example does NOT leak web NEXT_PUBLIC_ keys or server secrets', async () => {
    const text = await readFile(join(MOBILE_DIR, '_env.example'), 'utf8');
    expect(text).not.toContain('NEXT_PUBLIC_');
    expect(text).not.toContain('CLERK_SECRET_KEY');
    expect(text).not.toContain('CLERK_BILLING_WEBHOOK_SIGNING_SECRET');
  });
});

// ===== README structure =====

describe('cross-template README structure', () => {
  const REQUIRED_SECTIONS = [
    '## Layout',
    '## Getting started',
    '## Stack',
    '## Useful commands',
    '## Notes',
  ];

  it.each(TEMPLATES)('README in %s template has every required section', async (tpl) => {
    const text = await readFile(join(ROOT_DIRS[tpl], 'README.md'), 'utf8');
    // Title line (single #)
    expect(text).toMatch(/^#\s+\{\{projectName\}\}/m);
    for (const section of REQUIRED_SECTIONS) {
      expect(text, `${tpl} README missing ${section}`).toContain(section);
    }
  });

  it.each(TEMPLATES)('README in %s warns about deprecated JWT template pattern', async (tpl) => {
    const text = await readFile(join(ROOT_DIRS[tpl], 'README.md'), 'utf8');
    expect(text).toMatch(/native/i);
    expect(text).toMatch(/deprecated/i);
  });
});

// ===== package.json scripts / prettier / lint-staged =====

describe('cross-template package.json DX scripts', () => {
  it.each(TEMPLATES)(
    '%s package.json declares format / format:check / prepare scripts',
    async (tpl) => {
      const text = await readFile(join(ROOT_DIRS[tpl], 'package.json'), 'utf8');
      const parsed = JSON.parse(text) as {
        scripts: Record<string, string>;
      };
      expect(parsed.scripts['format']).toBe('prettier --write .');
      expect(parsed.scripts['format:check']).toBe('prettier --check .');
      expect(parsed.scripts['prepare']).toBe('husky');
    },
  );

  it.each(TEMPLATES)('%s package.json declares the same Drizzle script keys', async (tpl) => {
    // The monolith proxies to the `shared` workspace via pm --prefix, while
    // the solo templates invoke drizzle-kit directly. The surface the user
    // sees — `{{pmRunCmd}} db:generate` etc. — is identical across all three.
    const text = await readFile(join(ROOT_DIRS[tpl], 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { scripts: Record<string, string> };
    expect(parsed.scripts['db:generate']).toBeDefined();
    expect(parsed.scripts['db:migrate']).toBeDefined();
    expect(parsed.scripts['db:push']).toBeDefined();
    expect(parsed.scripts['db:studio']).toBeDefined();
  });

  it.each(TEMPLATES)('%s package.json has the same Prettier config shape', async (tpl) => {
    const text = await readFile(join(ROOT_DIRS[tpl], 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as { prettier: Record<string, unknown> };
    expect(parsed.prettier).toEqual({
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      tabWidth: 2,
    });
  });

  it.each(TEMPLATES)('%s package.json has the same lint-staged glob structure', async (tpl) => {
    const text = await readFile(join(ROOT_DIRS[tpl], 'package.json'), 'utf8');
    const parsed = JSON.parse(text) as {
      'lint-staged': Record<string, string[] | string>;
    };
    expect(parsed['lint-staged']['*.{ts,tsx}']).toEqual(['prettier --write']);
    expect(parsed['lint-staged']['*.{js,jsx,mjs,cjs,json,css,md}']).toEqual(['prettier --write']);
  });

  it.each(TEMPLATES)(
    '%s package.json pins husky + lint-staged + prettier + eslint exactly',
    async (tpl) => {
      const text = await readFile(join(ROOT_DIRS[tpl], 'package.json'), 'utf8');
      const parsed = JSON.parse(text) as { devDependencies: Record<string, string> };
      const exact = /^\d+\.\d+\.\d+$/;
      expect(parsed.devDependencies['husky']).toMatch(exact);
      expect(parsed.devDependencies['lint-staged']).toMatch(exact);
      expect(parsed.devDependencies['prettier']).toMatch(exact);
      expect(parsed.devDependencies['eslint']).toMatch(exact);
    },
  );
});

// ===== RoleGate hierarchy =====

describe('cross-template RoleGate hierarchy', () => {
  const ROLE_GATE_TARGETS = {
    monolithWeb: join(MONOLITH_WEB_DIR, 'components', 'auth', 'RoleGate.tsx'),
    monolithMobile: MOBILE_ROLE_GATE_PATH.replace(MOBILE_DIR, MONOLITH_MOBILE_DIR),
    web: ROLE_GATE_PATHS.web,
    mobile: ROLE_GATE_PATHS.mobile,
  };

  const HIERARCHY_PATTERN = /HIERARCHY[^\n]*=[^\n]*\['free',\s*'paid',\s*'super_admin'\]/;

  it('every RoleGate file uses the identical hierarchy ordering', async () => {
    for (const [label, path] of Object.entries(ROLE_GATE_TARGETS)) {
      const text = await readFile(path, 'utf8');
      expect(text, `${label} RoleGate missing canonical hierarchy`).toMatch(HIERARCHY_PATTERN);
      expect(text, `${label} RoleGate missing hasRequiredRole helper`).toContain('hasRequiredRole');
    }
  });
});

// ===== Zustand store shape =====

describe('cross-template Zustand store shape', () => {
  const REQUIRED_FIELDS = ['theme: Theme', 'onboardingComplete: boolean', 'drawerOpen: boolean'];
  const REQUIRED_ACTIONS = ['setTheme', 'completeOnboarding', 'toggleDrawer'];

  const allStorePaths = [
    ['monolith web', STORE_PATHS.monolithWeb],
    ['monolith mobile', STORE_PATHS.monolithMobile],
    ['solo web', STORE_PATHS.web],
    ['solo mobile', STORE_PATHS.mobile],
  ] as const;

  it('every app-store exposes the same AppState shape + actions', async () => {
    for (const [label, path] of allStorePaths) {
      const text = await readFile(path, 'utf8');
      for (const field of REQUIRED_FIELDS) {
        expect(text, `${label} store missing field: ${field}`).toContain(field);
      }
      for (const action of REQUIRED_ACTIONS) {
        expect(text, `${label} store missing action: ${action}`).toContain(action);
      }
    }
  });

  it('every app-store uses the same {{projectNameKebab}}-app storage key token', async () => {
    for (const [label, path] of allStorePaths) {
      const text = await readFile(path, 'utf8');
      expect(text, `${label} store missing canonical storage key`).toContain(
        '{{projectNameKebab}}-app',
      );
    }
  });
});

// ===== Zod profile schema =====

describe('cross-template Zod profile schema consistency', () => {
  it.each(TEMPLATES)('%s profile-form schema has identical field rules', async (tpl) => {
    const text = await readFile(PROFILE_SCHEMA_PATHS[tpl], 'utf8');
    expect(text).toContain('displayName');
    expect(text).toContain('.min(2');
    expect(text).toContain('.max(60');
    expect(text).toContain('.max(280');
    expect(text).toContain('.url(');
    expect(text).toContain('z.infer<typeof profileFormSchema>');
  });

  it('all three profile-form files have byte-identical Zod declarations (the exported object)', async () => {
    // The HEADER comments legitimately differ (monolith mentions shared/,
    // solos mention lib/validation/), but the actual `profileFormSchema`
    // definition must be the same. Extract it via a regex.
    const extract = (src: string): string | null => {
      const match = src.match(
        /export const profileFormSchema[\s\S]*?export type ProfileFormValues[^;]*;/,
      );
      return match ? match[0] : null;
    };
    const [mono, web, mobile] = await Promise.all([
      readFile(PROFILE_SCHEMA_PATHS.monolith, 'utf8').then(extract),
      readFile(PROFILE_SCHEMA_PATHS.web, 'utf8').then(extract),
      readFile(PROFILE_SCHEMA_PATHS.mobile, 'utf8').then(extract),
    ]);
    expect(mono).not.toBeNull();
    expect(web).toBe(mono);
    expect(mobile).toBe(mono);
  });
});

// ===== Husky pre-commit =====

describe('cross-template Husky pre-commit consistency', () => {
  it.each(TEMPLATES)('%s _husky/pre-commit runs lint-staged with the same command', async (tpl) => {
    const text = await readFile(join(ROOT_DIRS[tpl], '_husky', 'pre-commit'), 'utf8');
    expect(text.trim()).toBe('npx lint-staged');
  });
});

// ===== .gitignore secrets exclusion =====

describe('cross-template .gitignore secrets exclusion', () => {
  const REQUIRED_GITIGNORE_ENTRIES = [
    '.env',
    '.env.local',
    '!.env.example',
    'credentials.json',
    '*.pem',
    '*.key',
    '.husky/_',
  ];

  it.each(TEMPLATES)('%s _gitignore excludes the same secret-bearing files', async (tpl) => {
    const text = await readFile(join(ROOT_DIRS[tpl], '_gitignore'), 'utf8');
    for (const entry of REQUIRED_GITIGNORE_ENTRIES) {
      expect(text, `${tpl} _gitignore missing ${entry}`).toContain(entry);
    }
  });
});

// ===== Deprecated JWT template pattern =====

describe('cross-template JWT anti-regression', () => {
  it.each(TEMPLATES)(
    '%s template does NOT use the deprecated getToken({ template: "supabase" }) pattern',
    async (tpl) => {
      // Walk the whole template dir and assert no file contains the
      // deprecated pattern. Belt-and-suspenders alongside per-template checks.
      const { readdir } = await import('node:fs/promises');
      const root = ROOT_DIRS[tpl];
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
      await walk(root);

      const offenders: string[] = [];
      const patterns = [/template:\s*['"]supabase['"]/, /getToken\s*\(\s*\{\s*template:/];
      for (const file of filesToCheck) {
        const text = await readFile(file, 'utf8');
        for (const pattern of patterns) {
          if (pattern.test(text)) {
            offenders.push(`${file}: ${pattern}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    },
  );
});

describe('cross-template env doctor', () => {
  const DOCTOR_PATHS = [
    join(WEB_DIR, 'scripts', 'check-env.mjs'),
    join(MOBILE_DIR, 'scripts', 'check-env.mjs'),
    join(MONOLITH_WEB_DIR, 'scripts', 'check-env.mjs'),
    join(MONOLITH_MOBILE_DIR, 'scripts', 'check-env.mjs'),
  ];

  it('check-env.mjs is byte-identical across all four app locations', async () => {
    const [web, ...rest] = await Promise.all(DOCTOR_PATHS.map((p) => readFile(p, 'utf8')));
    for (const text of rest) expect(text).toBe(web);
  });

  it('solo web + monolith web wire predev → check-env', async () => {
    for (const dir of [WEB_DIR, MONOLITH_WEB_DIR]) {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      expect(pkg.scripts['check-env']).toBe('node scripts/check-env.mjs');
      expect(pkg.scripts['predev']).toBe('node scripts/check-env.mjs');
    }
  });

  it('solo mobile + monolith mobile wire prestart → check-env', async () => {
    for (const dir of [MOBILE_DIR, MONOLITH_MOBILE_DIR]) {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      expect(pkg.scripts['check-env']).toBe('node scripts/check-env.mjs');
      expect(pkg.scripts['prestart']).toBe('node scripts/check-env.mjs');
    }
  });
});

describe('resolveDevCommand matches real template scripts', () => {
  it('web/monolith dev script + mobile start script exist where the map points', async () => {
    const web = JSON.parse(await readFile(join(WEB_DIR, 'package.json'), 'utf8'));
    expect(web.scripts['dev']).toBeDefined();
    const mobile = JSON.parse(await readFile(join(MOBILE_DIR, 'package.json'), 'utf8'));
    expect(mobile.scripts['start']).toBeDefined();
    const mono = JSON.parse(await readFile(join(MONOLITH_DIR, 'package.json'), 'utf8'));
    expect(mono.scripts['dev:web']).toBeDefined();
    expect(resolveDevCommand('mobile', 'npm')).toBe('npm start');
  });
});
