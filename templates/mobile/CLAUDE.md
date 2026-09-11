# {{projectName}}

An Expo (Expo Router) app on Clerk and Supabase, scaffolded by create-rell-app. Auth is Clerk with Supabase native third-party auth; data is Drizzle on Supabase Postgres; billing is Clerk Billing; access control is three tiers (`super_admin` / `paid` / `free`) enforced in client hooks and RLS.

## Run

- `{{pmInstallCmd}}` — Node 22
- `{{pmRunCmd}} check-env` — which keys `.env.local` still needs, and where each lives
- `{{pmRunCmd}} start` — Expo dev server (`ios` / `android` / `web` for a platform)
- `{{pmRunCmd}} typecheck` · `{{pmRunCmd}} lint` · `{{pmRunCmd}} test` — `tsc --noEmit`, ESLint, vitest
- `{{pmRunCmd}} db:generate` — write a migration from `db/schema.ts`; `{{pmRunCmd}} db:migrate` applies it (a person runs this)

## Layout

- `app/` — Expo Router screens and layouts
- `components/` — NativeWind components and `auth/RoleGate.tsx`
- `db/` — Drizzle `schema.ts`, `client.ts`, `queries.ts`, `migrations/*.sql`
- `lib/` — env parsing, Supabase client, auth helpers, validation
- `stores/` — Zustand, persisted to MMKV
- `docs/` — `adr/` decisions and `agents/` queue configuration

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`: every index read is `T | undefined`; guard it.
- Dependencies are pinned exact; the Expo SDK pins the native modules, so those move only by patch (see `.github/dependabot.yml`).
- Schema changes: edit `db/schema.ts`, run `db:generate`, commit the schema and the migration together; a person applies it.
- Client state is Zustand persisted to MMKV. Every form is React Hook Form with a Zod schema.
- Styling is NativeWind; a value under `EXPO_PUBLIC_*` ships in the bundle and is public by design.

## Workflow

- Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`. Skills in `.claude/skills/` (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/triage`, `/implement`, `/tdd`, `/code-review`, …); their tracker and label configuration is `docs/agents/`.
- Every issue is explored by the agent queue on open; `docs/agents/triage-labels.md` says what happens after that.
- One conventional commit per ticket, referencing its issue.
