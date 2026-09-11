# {{projectName}}

Solo Web app scaffolded by [`create-rell-app`](https://github.com/waynewonder3/create-rell-app). Next.js 16 App Router, Clerk + Supabase native third-party auth, Drizzle ORM, Clerk Billing, shadcn/ui primitives, and full DX tooling (ESLint, Prettier, Husky, lint-staged).

## Layout

```
{{projectName}}/
├── app/                     # Next.js 16 App Router
│   ├── (auth)/              # Sign-in / sign-up routes (Clerk)
│   ├── dashboard/           # Protected routes — layout, billing, settings, etc.
│   ├── api/                 # Route handlers (billing webhook, role endpoint)
│   └── layout.tsx           # Root layout with <ClerkProvider>
├── components/
│   ├── ui/                  # shadcn/ui base primitives (Button, Card, Skeleton)
│   ├── shared/              # Skeleton loaders, demo consumers
│   ├── auth/                # RoleGate, PaywallPrompt
│   └── forms/               # React Hook Form + Zod example
├── lib/
│   ├── supabase/            # Browser + server Supabase clients
│   ├── auth/                # RBAC helpers, current-user, useRole hook
│   ├── billing/             # Plan-to-role + webhook event handler
│   ├── validation/          # Shared Zod schemas
│   ├── env.ts               # Browser-safe env vars
│   ├── env-server.ts        # Server-only secrets
│   └── cn.ts                # Tailwind class merge helper
├── db/
│   ├── schema.ts            # Drizzle schema
│   ├── queries.ts           # Typed query helpers
│   ├── client.ts            # Lazy Drizzle client
│   └── migrations/          # SQL migrations with RLS policies
├── stores/
│   └── app-store.ts         # Zustand with localStorage persistence
├── middleware.ts            # Clerk middleware for protected routes
├── .env.example
├── package.json
├── next.config.ts
├── postcss.config.mjs
├── components.json          # shadcn/ui config
├── eslint.config.mjs
├── drizzle.config.ts
└── tsconfig.json
```

## Getting started

1. Install dependencies:

   ```sh
   {{pmInstallCmd}}
   ```

2. Configure environment variables (a ready-to-edit `.env.local` was created for you):

   ```sh
   {{pmRunCmd}} check-env
   ```

   This lists every Clerk + Supabase key still missing, with a link to where each
   one lives. `{{pmRunCmd}} dev` runs it automatically and stops until the required
   keys are set.

3. Run the initial database migration:

   ```sh
   {{pmRunCmd}} db:migrate
   ```

4. Start the dev server:

   ```sh
   {{pmRunCmd}} dev
   ```

## Stack

- **Auth:** Clerk + Supabase native third-party auth
- **Database:** Supabase Postgres + Drizzle ORM (with RLS policies)
- **Web:** Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui
- **Billing:** Clerk Billing with webhook handling
- **RBAC:** Three-tier (super_admin / paid / free) enforced at server + client + database layers
- **State:** Zustand with localStorage persistence
- **Forms:** React Hook Form + Zod
- **DX:** ESLint, Prettier, Husky, lint-staged

## Useful commands

Run each with `{{pmRunCmd}} <script>`.

| Script        | Description                                          |
| ------------- | ---------------------------------------------------- |
| `dev`         | Run the Next.js dev server                           |
| `build`       | Build the Next.js production bundle                  |
| `typecheck`   | Typecheck the project                                |
| `lint`        | Run ESLint                                           |
| `format`      | Run Prettier (write)                                 |
| `db:generate` | Generate a new Drizzle migration from schema changes |
| `db:migrate`  | Apply pending migrations                             |
| `db:studio`   | Open Drizzle Studio                                  |
| `test`        | Run the vitest suite (passes with no tests yet)      |

## Notes

- Auth integration uses Clerk's **native** Supabase third-party auth. Do **not** use the deprecated JWT-template pattern (passing a template name to Clerk's `getToken` call) — that integration path was phased out in April 2025.
- Dependencies are pinned to exact versions — update them in groups rather than running floating-range updates.
- `middleware.ts` protects `/dashboard(.*)` with no bypass paths. Add new protected routes to the matcher rather than skipping auth for specific files.
