/* global process */
// Environment doctor — dependency-free pre-flight check for this project.
//
// Reads `.env.example` to learn which keys this app needs (uncommented `KEY=`
// → required, commented `# KEY=` → optional) and `.env.local` + process.env to
// see which are set, then prints a friendly checklist with links to where each
// missing value comes from. Exits non-zero ONLY when a required key is missing,
// so the `predev`/`prestart` hook blocks before the framework throws a cryptic
// error. NEVER prints any env VALUES — only key names, status, and static links.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Where to get each known key. Unknown keys still render with a generic note.
const LINKS = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    'Clerk → API keys: https://dashboard.clerk.com/last-active?path=api-keys',
  CLERK_SECRET_KEY: 'Clerk → API keys: https://dashboard.clerk.com/last-active?path=api-keys',
  CLERK_BILLING_WEBHOOK_SIGNING_SECRET:
    'Clerk → Webhooks: https://dashboard.clerk.com/last-active?path=webhooks',
  NEXT_PUBLIC_SUPABASE_URL:
    'Supabase → Settings › API: https://supabase.com/dashboard/project/_/settings/api',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'Supabase → Settings › API: https://supabase.com/dashboard/project/_/settings/api',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
    'Clerk → API keys: https://dashboard.clerk.com/last-active?path=api-keys',
  EXPO_PUBLIC_SUPABASE_URL:
    'Supabase → Settings › API: https://supabase.com/dashboard/project/_/settings/api',
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    'Supabase → Settings › API: https://supabase.com/dashboard/project/_/settings/api',
  DATABASE_URL:
    'Supabase → Settings › Database (connection string): https://supabase.com/dashboard/project/_/settings/database',
};

/** Classify keys from an .env.example: uncommented `KEY=` → required, `# KEY=` → optional. */
export function parseEnvExample(text) {
  const required = [];
  const optional = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const commented = line.startsWith('#');
    const body = commented ? line.replace(/^#+\s*/, '') : line;
    const m = body.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!m) continue;
    const key = m[1];
    if (commented) {
      if (!optional.includes(key) && !required.includes(key)) optional.push(key);
    } else if (!required.includes(key)) {
      required.push(key);
    }
  }
  return { required, optional };
}

/** Minimal KEY=VALUE parser. No escapes, no expansion, no eval. */
export function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** A key is "set" if present and non-empty in `env`. Optional keys never block. */
export function evaluate(spec, env) {
  const isSet = (k) => typeof env[k] === 'string' && env[k].length > 0;
  return {
    isSet,
    missingRequired: spec.required.filter((k) => !isSet(k)),
    missingOptional: spec.optional.filter((k) => !isSet(k)),
  };
}

function readSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const root = process.cwd();
  const exampleText = readSafe(resolve(root, '.env.example'));
  if (exampleText === '') process.exit(0); // nothing to validate

  const spec = parseEnvExample(exampleText);
  const merged = { ...parseDotenv(readSafe(resolve(root, '.env.local'))), ...process.env };
  const { isSet, missingRequired, missingOptional } = evaluate(spec, merged);

  const ESC = '\x1b';
  const tty = process.stdout.isTTY;
  const C = (code, s) => (tty ? `${ESC}[${code}m${s}${ESC}[0m` : s);
  const out = (s) => process.stdout.write(s);

  out('\n  Checking environment (.env.local)\n\n');
  for (const key of [...spec.required, ...spec.optional]) {
    const ok = isSet(key);
    const isOptional = spec.optional.includes(key);
    const mark = ok ? C('32', '✓') : isOptional ? C('33', '○') : C('31', '✗');
    out(`  ${mark} ${key}${ok ? '' : isOptional ? '  (optional)' : ''}\n`);
    if (!ok && LINKS[key]) out(C('2', `      ${LINKS[key]}\n`));
  }
  out('\n');

  if (missingRequired.length > 0) {
    const have = spec.required.length - missingRequired.length;
    out(C('31', `  ${have} of ${spec.required.length} required keys set. `));
    out('Fill the rest in .env.local, then re-run.\n\n');
    process.exit(1);
  }
  if (missingOptional.length > 0) {
    out(
      C(
        '2',
        `  All required keys set. ${missingOptional.length} optional key(s) still empty (e.g. DATABASE_URL for db:migrate).\n\n`,
      ),
    );
  } else {
    out(C('32', '  All environment keys set.\n\n'));
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
