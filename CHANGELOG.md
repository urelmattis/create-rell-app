# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Windows checkouts no longer fail `format:check`.** A `.gitattributes`
  (`* text=auto eol=lf`) at the repository root keeps the templates LF on a
  Windows checkout, where Git would otherwise convert them to CRLF and every
  generated file would fail Prettier's `endOfLine: lf`; each template ships
  the same file so generated projects are safe from the same conversion.
- Template sources are now Prettier-clean under the templates' own config,
  and the smoke test runs `format:check` and `test` after lint and typecheck,
  the same gates the generated `ci.yml` requires.

### Added

- **The AFK agent queue.** Every scaffold now carries the Claude Code
  software factory: `agent-explore`, `agent-implement`, `agent-review`,
  `agent-address` (review and merge-main briefs), `queue-housekeeping`,
  `scheduled-review` and `dependabot-auto-merge` workflows with their prompts,
  the vendored `mattpocock/skills` set with `docs/agents/` configured for
  GitHub issues, a local `.claude/settings.json`, `CLAUDE.md`, `CONTEXT.md`,
  `docs/adr/`, a `.sandcastle/` runner for the same pass in a local Docker
  sandbox, and `scripts/queue-install.sh` for the one-time GitHub setup
  (labels, merge settings, branch protection). The bundle lives in
  `templates/_queue` and is layered on every template; `--no-queue` skips it.
- **CI and Dependabot per template.** `.github/workflows/ci.yml` runs `check`
  (lint, format, typecheck, test) and a Semgrep `security-scan`; these are the
  checks branch protection requires. There is no audit gate in `check`: the
  templates' pinned Clerk, Next and Expo versions carry open advisories, so it
  would be red on the first commit; the Monday sweep audits and files issues. `.github/dependabot.yml` opens one pull
  request per dependency (grouped updates drop the root `overrides` block) and
  holds Expo-pinned native modules to patch bumps on mobile and monolith.
- **Package-manager tokens for CI.** `{{pmCiInstallCmd}}`,
  `{{pmLockfileOnlyCmd}}`, `{{pmLockfile}}`, `{{pmNodeCache}}`,
  `{{pmSetupSteps}}`, `{{pmAuditCmd}}`, `{{pmWhyCmd}}`, `{{pmAddDevCmd}}` and
  `{{pmExecLocalCmd}}` render the frozen install, the lockfile-only install,
  the lockfile name, the `setup-node` cache key, the toolchain setup steps
  (`pnpm/action-setup` for pnpm, corepack with Yarn 4 for Yarn), the audit and
  dependency-path commands, adding a dev dependency, and running a locally
  installed bin, for npm, pnpm and Yarn.
- **A `test` script in every template** (`vitest run --passWithNoTests`, on
  vitest 4.0.18: the 4.1 line's peer set crashes npm 10.9's resolver), so the
  queue's test gate and CI have something to run from the first commit.
- **`format` runs after install.** Template files are formatted for a typical
  project name; a very short or very long one moves Prettier's wrap points on
  the lines that carry it, and the CI `check` job runs `format:check` over the
  whole tree. The CLI now runs the project's own `format` script once the
  install has put Prettier in place, so the first commit is clean for any
  name. `--no-install` skips it along with the install.
- `_github`, `_claude`, `_sandcastle` and `_prettierignore` join the special
  filename table; `tmp/` is ignored in every template as the agents' scratch
  space.

## [0.3.0] - 2026-06-03

A UX-focused release that closes the gap between "scaffold succeeded" and
"app actually runs," and fixes a next-steps banner that printed invalid
commands for two of the three templates.

### Added

- **Guided env onboarding.** Every scaffold now drops a ready-to-edit
  `.env.local` (copied from `.env.example`) and ships a dependency-free env
  **doctor** at `scripts/check-env.mjs`, wired into `predev` (web) / `prestart`
  (mobile). It reads `.env.example` to learn which keys are required vs optional,
  reports exactly which are still missing with a dashboard link for each, and
  blocks `dev`/`start` only when a required key is unset — replacing the previous
  cryptic runtime crash. It never prints env values.
- **`--yes` / `-y` flag** — skip all prompts, defaulting any unspecified value to
  `web` + `npm`. Works in TTY and non-TTY (CI) contexts.
- **`keywords`** in `package.json` and a top-level **`LICENSE`** file (MIT).
- **`refresh-templates` workflow** (`.github/workflows/`) — a weekly job that
  bumps the pinned template dependencies and opens a PR only when the full smoke
  matrix passes, so generated projects don't silently rot now that Dependabot is
  off for the template workspaces.

### Fixed

- **Next-steps banner was wrong for 2 of 3 templates.** It hardcoded
  `<pm> run dev` / `<pm> run build`, but the mobile template has no `dev` script
  (uses `start`) and the monolith root has no `dev` (uses `dev:web`). Mobile now
  prints `<pm> start` and the monolith prints `<pm> run dev:web`. The banner is
  also reordered to walk through env → `db:migrate` → dev.
- **Monolith loaded env from the wrong place.** `dev:web` runs `next dev` in
  `apps/web`, which loads `apps/web/.env.local` — but the template shipped a
  single *root* `_env.example` telling users to put env at the monolith root,
  which Next never reads. Env is now per-app (`apps/web/.env.example`,
  `apps/mobile/.env.example`), each auto-materialized into the app's own
  `.env.local`. The shared db client's `DATABASE_URL` hint was updated to match.
- **Solo mobile `.env.example`** now documents the optional `DATABASE_URL` (the
  mobile template ships `db:migrate` + a `migrations/` dir) and points at the
  auto-created `.env.local` instead of `.env`.
- **Monolith now works under npm, pnpm, and yarn** (previously npm-only). Three
  npm-specific assumptions were fixed: (1) the nine `npm run --prefix <dir>`
  workspace scripts are now `cd <dir> && {{pmRunCmd}}` (PM-agnostic); (2) a
  `pnpm-workspace.yaml` is shipped so `pnpm install` discovers the workspaces
  (npm/yarn use the package.json `workspaces` field); (3) `@<project>/shared`
  resolves via a TypeScript `paths` alias instead of relying on npm hoisting the
  workspace package into `node_modules` by name, and `@types/node` is now
  declared in `packages/shared`. `install`, `lint`, and `typecheck` pass under
  npm and pnpm (both verified) and yarn.
- **CI: Windows smoke no longer times out.** windows-latest needs ~11 minutes to
  npm-install the mobile/monolith dependency trees; the smoke runner's per-step
  timeout was raised from 10 to 20 minutes, turning the Windows smoke matrix
  green for the first time since 0.2.0.

### Changed

- Cleaner, branded CLI console output; removed stale internal story/epic
  comments and a separator-edge-case in the `cd` path of the success banner.

### Docs

- README documents the previously-undocumented `--no-git`, `--dry-run`, and new
  `--yes` flags, plus the env-first setup step.

### Known limitations

- Running the **Expo** app (`dev:mobile`) under pnpm or yarn-berry may need a
  Metro resolver alias for `@<project>/shared` — Metro doesn't read the
  TypeScript `paths` alias, and only npm/yarn-classic symlink the workspace
  package into `node_modules` by name. `install`, `lint`, and `typecheck` pass
  under all three package managers; this only affects bundling the mobile app at
  runtime under non-npm managers.

## [0.2.0] - 2026-04-11

Substantial template hardening and CLI ergonomics release. No breaking API
changes — existing `create-rell-app <name>` invocations keep working
unchanged. Upgrades are recommended for anyone scaffolding production SaaS
starters: this release closes a real privilege-downgrade bug in the Clerk
billing webhook handler and tightens default security posture across all
three templates.

### Added

- **`--dry-run` flag** — walks the chosen template and prints the files that
  would be scaffolded without touching the filesystem. Skips install and
  git init. Useful for CI previews and quick template inspection.
- **`--no-git` flag** — skip the automatic git repository init and initial
  commit step.
- **Automatic `git init` after scaffold** — every new project lands with a
  clean git history (`chore: initial scaffold`). Husky hooks are suppressed
  on the initial commit via `HUSKY=0`. Silently skipped if git is not in
  `PATH` or the `.git` directory already exists.
- **"Success!" next-steps banner** — after a successful scaffold + install,
  the CLI prints a `create-next-app`-style banner with the exact `cd` and
  `<pm> run dev` commands for the chosen package manager.
- **Structured logger stub** (`lib/logger.ts`) in the web and monolith
  templates. Dependency-free console JSON writer with a Pino-compatible
  `log.info(ctx, msg)` surface — swap for Pino, Winston, or a Sentry
  transport as a one-file change.
- **Rate-limit stub** (`lib/rate-limit.ts`) with an in-memory sliding-window
  implementation and an Upstash-compatible `{ success, remaining, resetAt }`
  return shape. Used by `/api/me/role` to cap per-user request rates.
- **Feature-flag abstraction** (`lib/flags.ts`) — reads `NEXT_PUBLIC_FLAG_<NAME>`
  or `FLAG_<NAME>` env vars. Stable call-site API for a future swap to
  `@vercel/flags` or another provider.
- **Webhook replay dedupe** via a new `webhook_deliveries` table (migration
  `0002_webhook_deliveries.sql`) and `markWebhookSeen(db, svixId, eventType)`
  helper. The Clerk billing route forwards `svix-id` into
  `handleBillingEvent`, which short-circuits on replays before hitting the
  role write path.
- **Baseline security headers** on the scaffolded `next.config.ts`: HSTS
  (two-year max-age + preload), `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` denying camera /
  microphone / geolocation, and `X-DNS-Prefetch-Control: on`. CSP is
  deliberately left off with a pointer to `clerk.com/docs/security/clerk-csp`
  — a functional CSP that doesn't break Clerk modals needs per-deployment
  tuning.
- **Cache headers on `/api/me/role`** (`Cache-Control: private, max-age=30,
  stale-while-revalidate=60`) to cut DB round-trips from repeated
  `useRole()` mounts.
- **Dependabot config** (`.github/dependabot.yml`) — weekly grouped minor
  /patch updates for the CLI root and every template workspace, plus
  monthly GitHub Actions updates.
- **CI matrix expansion** — `check` job now runs on Node 22 **and** 24;
  `smoke` job now runs on ubuntu-latest **and** macos-latest **and**
  windows-latest. Vitest v8 coverage is wired into the `check` job output.
- **`CHANGELOG.md`**, **`SECURITY.md`**, **`CONTRIBUTING.md`** at the repo
  root. GitHub `ISSUE_TEMPLATE/` (bug report + feature request) and
  `PULL_REQUEST_TEMPLATE.md`.
- **`db/README.md`** migration workflow guide inside each template that
  ships a Drizzle schema (`web`, `mobile`, `monolith/packages/shared`).
- **React `cache()` deduplication** for server RBAC helpers
  (`getCurrentUserWithRole`, `hasRole`, `currentUserHasRole`, `isAdmin`,
  `isPaid`) so duplicate calls within a single server render pass coalesce
  into one DB query.
- **Module-level in-flight memo on `useRole()`** — concurrent `<RoleGate>`
  mounts on the same page now share a single `/api/me/role` fetch instead
  of each firing their own.
- **Zod-based env validation** — all templates now load a single
  `z.object({...}).safeParse(process.env)` per env module and report every
  missing/invalid key in one error, replacing the previous per-key
  fail-on-first style.

### Fixed

- **P0 — duplicate `zod` key in monolith `apps/web/package.json`.** npm
  parsers silently kept the last occurrence; linters and `npm publish`
  warned. Now single entry, regression test added.
- **P0 — `user.created` webhook was demoting paid users on replay.** The
  handler called `setUserRole(db, id, 'free')` which used
  `onConflictDoUpdate` and would overwrite an existing `paid` or
  `super_admin` role. A new `insertDefaultUserRole` helper uses
  `INSERT ... ON CONFLICT DO NOTHING` so replays within svix's retry
  window are safe. Combined with the svix-id dedupe table above, this
  closes a real privilege-downgrade vector.
- **P0 — monolith `apps/web/package.json` was relying on implicit npm
  workspaces hoisting** for `drizzle-orm`, `drizzle-kit`, `postgres`, the
  full eslint/prettier/husky/lint-staged tool chain, and `@tailwindcss/postcss`.
  All direct dependencies are now declared explicitly, bringing the file
  to version-exact parity with the solo `templates/web/package.json`.
- **Production error boundary (`app/error.tsx`)** no longer leaks
  `error.message` to end users — replaced with a generic message in
  production, preserved in development for debugging.
- **`plan-to-role` unknown-plan warning** now sanitizes the attacker-
  controllable `planKey` against ANSI/newline log injection before
  `console.warn`.
- **`ProfileForm` example no longer ships a `console.log` in the submit
  handler** — replaced with a dev-only `console.warn` gated on
  `NODE_ENV !== 'production'` (web/monolith) or `__DEV__` (mobile/expo),
  plus a clear TODO marker.
- **Eslint parser "multiple candidate TSConfigRootDirs" error** in the
  CLI's own workspace resolved by pinning `parserOptions.tsconfigRootDir`
  to `__dirname` and ignoring `.worktrees/` and `full-app/` scaffold test
  outputs.

### Changed

- **Dropped `fs-extra` dependency** in favor of `node:fs/promises`. Saves
  one direct dependency (and `@types/fs-extra`). All scaffold engine,
  install, and validation modules now use native Node APIs.
- **Template `tsconfig.json` files** now ship under `_tsconfig.json`
  (restored to `tsconfig.json` at scaffold time via the existing
  `SPECIAL_FILENAME_RENAMES` table). Prevents the IDE's TypeScript server
  from auto-discovering a template as a standalone project where
  `node_modules` isn't installed.
- **Template `eslint.config.mjs` files** now ship under `_eslint.config.mjs`
  for the same reason — prevents the IDE's eslint LSP from walking up to
  a template's own eslint config and choking on multiple `tsconfig`
  candidate roots.
- **Template `.ts` / `.tsx` / `.mts` files** now start with a
  `// @ts-nocheck -- template-only` marker that the scaffold engine strips
  before writing. Contributors opening template files in the IDE see a
  clean file with no phantom type errors; scaffolded users get normal
  TypeScript checking against their own installed deps.

### Docs

- Full commit history available via `git log v0.1.3..v0.2.0`.

## [0.1.3] - 2026-04-11

- Earlier releases — see git history.
