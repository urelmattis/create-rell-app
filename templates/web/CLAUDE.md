# {{projectName}}

A Next.js (App Router) app on Clerk and Supabase, scaffolded by create-rell-app. Auth is Clerk with Supabase native third-party auth; data is Drizzle on Supabase Postgres; billing is Clerk Billing; access control is three tiers (`super_admin` / `paid` / `free`) enforced in the server helpers (`lib/auth/roles.ts`), the client hooks (`useRole`, `RoleGate`) and RLS; `middleware.ts` only gates signed-in routes.

## Run

- `{{pmInstallCmd}}` — Node 22
- `{{pmRunCmd}} check-env` — which keys `.env.local` still needs, and where each lives
- `{{pmRunCmd}} dev` — Next.js dev server
- `{{pmRunCmd}} typecheck` · `{{pmRunCmd}} lint` · `{{pmRunCmd}} test` — `tsc --noEmit`, ESLint, vitest
- `{{pmRunCmd}} db:generate` — write a migration from `db/schema.ts`; `{{pmRunCmd}} db:migrate` applies it (a person runs this)

## Layout

- `app/` — routes, layouts, `api/` route handlers, `middleware.ts` guards them
- `components/` — shadcn/ui pieces and `auth/RoleGate.tsx`
- `db/` — Drizzle `schema.ts`, `client.ts`, `queries.ts`, `migrations/*.sql`
- `lib/` — env parsing, Supabase clients, auth helpers, billing, validation, rate limiting
- `stores/` — Zustand, persisted to localStorage
- `docs/` — `adr/` decisions and `agents/` queue configuration

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`: every index read is `T | undefined`; guard it.
- Dependencies are pinned exact. A transitive advisory gets an override in the root `package.json`, never a floating range.
- Schema changes: edit `db/schema.ts`, run `db:generate`, commit the schema and the migration together; a person applies it.
- Server state stays on the server; client state is Zustand. Every form is React Hook Form with a Zod schema.
- A route handler checks the session and the tier before it reads anything; a value under `NEXT_PUBLIC_*` is public by design.

## Workflow

- Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`. Skills in `.claude/skills/` (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/triage`, `/implement`, `/tdd`, `/code-review`, …); their tracker and label configuration is `docs/agents/`.
- Every issue is explored by the agent queue on open; `docs/agents/triage-labels.md` says what happens after that.
- One conventional commit per ticket, referencing its issue.
