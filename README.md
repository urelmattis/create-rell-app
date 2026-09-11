# create-rell-app

Scaffold a fully wired **Clerk + Supabase + Drizzle** starter app in one command. Pick a template, choose your package manager, and get a production-ready project with authentication, billing, RBAC, and database — all pre-configured and ready to run.

## Quick start

```bash
npx create-rell-app my-project
```

Follow the interactive prompts to select a template and package manager. Or skip prompts entirely with flags:

```bash
npx create-rell-app my-project --template web --pm pnpm
```

> After scaffolding, the generated project drops a ready-to-edit `.env.local`.
> Run `npm run check-env` inside it to see exactly which Clerk + Supabase keys
> are still needed (with links to where each one lives) before `npm run dev`.

## Templates

| | Solo Web | Solo Mobile | Full-Stack Monolith |
|---|---|---|---|
| **Framework** | Next.js (App Router) | Expo (Expo Router) | Next.js + Expo monorepo |
| **Auth** | Clerk + Supabase 3P Auth | Clerk + Supabase 3P Auth | Clerk + Supabase 3P Auth |
| **Database** | Drizzle ORM + Supabase | Drizzle ORM + Supabase | Shared Drizzle schema |
| **Billing** | Clerk Billing | Clerk Billing | Clerk Billing |
| **RBAC** | Server + Client + RLS | Client + RLS | Server + Client + RLS |
| **State** | Zustand (localStorage) | Zustand (MMKV) | Both |
| **Forms** | React Hook Form + Zod | React Hook Form + Zod | Both |
| **UI** | shadcn/ui + Tailwind | NativeWind + Tailwind | Both |
| **DX** | ESLint + Prettier + Husky | ESLint + Prettier + Husky | ESLint + Prettier + Husky |

**Solo Web** — standalone Next.js app. Best for web-only SaaS products.

**Solo Mobile** — standalone Expo app. Best for mobile-only products.

**Full-Stack Monolith** — npm workspaces monorepo with `apps/web/`, `apps/mobile/`, and `packages/shared/` directories. The web and mobile portions mirror the solo templates. The shared package holds the Drizzle schema and TypeScript types used by both.

## What you get

Every generated project includes:

- **Authentication** — Clerk provider, sign-in/sign-up pages, protected route middleware, Supabase native Third-Party Auth (no deprecated JWT templates)
- **Database** — Drizzle ORM with typed schema, migration scripts, and example queries against Supabase PostgreSQL
- **Billing** — Clerk Billing with pricing page, checkout flow, webhook handler, and billing portal redirect
- **Access control** — Three-tier RBAC (super_admin / paid / free) enforced in server helpers, client hooks, and Supabase RLS policies
- **State management** — Zustand with platform-appropriate persistence
- **Forms** — React Hook Form + Zod validation with an example form
- **UI framework** — shadcn/ui (web) or NativeWind (mobile) with Tailwind CSS, skeleton loaders, and semantic HTML
- **Code quality** — ESLint, Prettier, Husky pre-commit hooks, TypeScript strict mode, zero lint errors on fresh scaffold
- **Environment config** — `.env.example` documenting every required key, `.gitignore` excluding secrets
- **CI** — a `check` job (lint, format, typecheck, test) and a Semgrep `security-scan` job on every pull request; Dependabot tuned to one PR per dependency, with Expo-pinned packages held to patch bumps on mobile
- **An AFK agent queue** — Claude Code runs on GitHub Actions against your subscription: every issue is explored, implemented, reviewed, revised and merged without a person in the loop (see below)

## Flags

| Flag | Description | Example |
|---|---|---|
| `--template`, `-t` | Template to use: `web`, `mobile`, or `monolith` | `--template web` |
| `--pm` | Package manager: `npm`, `pnpm`, or `yarn` | `--pm pnpm` |
| `--yes`, `-y` | Skip all prompts; default unspecified values to `web` + `npm` | `-y` |
| `--no-install` | Skip dependency installation after scaffolding | `--no-install` |
| `--no-git` | Skip git repository init + initial commit | `--no-git` |
| `--no-queue` | Skip the AFK agent queue: the agent workflows and prompts, `.claude/` (skills and settings), `docs/`, `CONTEXT.md`, `.sandcastle/`, `.prettierignore`, `scripts/queue-install.sh` | `--no-queue` |
| `--dry-run` | Show files that would be written without touching disk | `--dry-run` |
| `--version`, `-v` | Print the CLI version | `-v` |
| `--help`, `-h` | Show usage information | `--help` |

When all flags are provided, prompts are skipped entirely. Partial flags skip only their corresponding prompts.

## The AFK agent queue

Every scaffold ships the software factory that [Vybe](https://github.com/Novgn/vybe-app) runs on: `anthropics/claude-code-action` workflows that take an issue from open to merged. It uses your Claude subscription (an OAuth token from `claude setup-token`), never an API key.

```
issue opened ──▶ explore (verdict on the issue) ──▶ implement (branch + PR)
   ──▶ review (## Review comment) ──▶ up to two address-the-review rounds
   ──▶ one merge-main round if the branch conflicts ──▶ auto-merge when CI is green
```

What lands in the project:

- `.github/workflows/` — `agent-explore`, `agent-implement`, `agent-review`, `agent-address` (review and merge-main briefs), `queue-housekeeping` (daily), `scheduled-review` (Monday security sweep), `dependabot-auto-merge`, plus the template's own `ci.yml`
- `.github/prompts/` — the brief each session reads first; edit these to change how the agents work
- `.claude/skills/` — [mattpocock/skills](https://github.com/mattpocock/skills) vendored (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/triage`, `/implement`, `/tdd`, `/code-review`, …) with `docs/agents/` configured for GitHub issues and the queue's labels; `npx skills@latest add mattpocock/skills` updates them
- `.claude/settings.json` — a local allow list matching what the workflows permit
- `CONTEXT.md`, `docs/adr/` — the vocabulary and the decisions the agents read before every issue (`CLAUDE.md` is part of every template, queue or not)
- `.sandcastle/` — the same implement-and-review pass in a Docker sandbox on your machine ([sandcastle](https://github.com/mattpocock/sandcastle)), for work a hosted runner cannot do
- `scripts/queue-install.sh` — the one-time GitHub setup

Turning it on, after the first push:

```bash
bash scripts/queue-install.sh
```

The script creates the labels, turns on auto-merge and squash merges, protects `main` behind the `check` and `security-scan` jobs, and then names the two steps only you can do: install the [Claude GitHub App](https://github.com/apps/claude) on the repository and add `CLAUDE_CODE_OAUTH_TOKEN` as a repository (or organisation) secret. File an issue and the explore workflow answers within minutes; `docs/agents/triage-labels.md` says what each label means from there.

An agent PR merges on its own once the review says ready, CI is green, it changes fewer than 400 lines, and it touches none of the paths a person always merges: the workflows, the prompts, `.claude/`, `CLAUDE.md`, `CONTEXT.md`, `docs/agents/`, migrations, any `package.json`, the lockfile, auth middleware, and lint, TypeScript, test, build and app config. `docs/agents/triage-labels.md` in the generated project has the full list. Pass `--no-queue` to scaffold without any of it.

## Requirements

- **Node.js 22** or later

## License

MIT
