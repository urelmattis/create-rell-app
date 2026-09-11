# {{projectName}}

A monorepo scaffolded by create-rell-app: a Next.js app (`apps/web`) and an Expo app (`apps/mobile`) sharing one Drizzle schema and its types (`packages/shared`). Auth is Clerk with Supabase native third-party auth; billing is Clerk Billing; access control is three tiers (`super_admin` / `paid` / `free`) enforced in the server helpers (`lib/auth/roles.ts`), the client hooks (`useRole`, `RoleGate`) and RLS; `middleware.ts` only gates signed-in routes.

## Run

- `{{pmInstallCmd}}` — Node 22
- `{{pmRunCmd}} check-env` — which keys each app's `.env.local` still needs
- `{{pmRunCmd}} dev:web` / `{{pmRunCmd}} dev:mobile` — Next.js dev server / Expo dev server
- `{{pmRunCmd}} typecheck` · `{{pmRunCmd}} lint` · `{{pmRunCmd}} test` — `tsc -b` over every workspace, ESLint, vitest in each app
- `{{pmRunCmd}} db:generate` — write a migration from `packages/shared/db/schema.ts`; `{{pmRunCmd}} db:migrate` applies it (a person runs this)

## Layout

- `apps/web/` — Next.js App Router: `app/`, `components/`, `lib/`, `stores/`, `middleware.ts`
- `apps/mobile/` — Expo Router: `app/`, `components/`, `lib/`, `stores/`
- `packages/shared/` — Drizzle `db/schema.ts`, `db/migrations/*.sql`, shared `validation/` schemas and types
- `docs/` — `adr/` decisions and `agents/` queue configuration

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`: every index read is `T | undefined`; guard it.
- Dependencies are pinned exact; the Expo SDK pins the mobile app's native modules, so those move only by patch (see `.github/dependabot.yml`).
- Schema changes live in `packages/shared`: edit the schema, run `db:generate`, commit the schema and the migration together; a person applies it.
- Server state stays on the server; client state is Zustand (localStorage on web, MMKV on mobile). Every form is React Hook Form with a Zod schema from `packages/shared`.
- A route handler checks the session and the tier before it reads anything; `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are public by design.

## Workflow

- Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`. Skills in `.claude/skills/` (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/triage`, `/implement`, `/tdd`, `/code-review`, …); their tracker and label configuration is `docs/agents/`.
- Every issue is explored by the agent queue on open; `docs/agents/triage-labels.md` says what happens after that.
- One conventional commit per ticket, referencing its issue.
