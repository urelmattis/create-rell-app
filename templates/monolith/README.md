# {{projectName}}

Full-stack monolith scaffolded by [`create-rell-app`](https://github.com/waynewonder3/create-rell-app). Next.js web + Expo mobile sharing schema and types through a local `packages/shared` workspace.

## Layout

```
{{projectName}}/
├── apps/
│   ├── web/      # Next.js 16 App Router (auth, billing, dashboard)
│   └── mobile/   # Expo / React Native client
├── packages/
│   └── shared/   # Drizzle schema + shared TypeScript types
├── package.json  # workspace root
└── tsconfig.base.json
```

## Getting started

1. Install dependencies:

   ```sh
   {{pmInstallCmd}}
   ```

2. Configure environment variables (a ready-to-edit `.env.local` is created for each app):

   ```sh
   {{pmRunCmd}} check-env          # reports which keys are still missing, with links
   ```

   Fill in `apps/web/.env.local` (Clerk + Supabase) and `apps/mobile/.env.local`
   (Expo public keys) before running the apps.

3. Start the web dev server:

   ```sh
   {{pmRunCmd}} dev:web
   ```

4. Start the mobile dev server (separate terminal):

   ```sh
   {{pmRunCmd}} dev:mobile
   ```

## Stack

- **Auth:** Clerk + Supabase native third-party auth
- **Database:** Supabase Postgres + Drizzle ORM
- **Web:** Next.js 16 App Router, React 19, Tailwind CSS, shadcn/ui
- **Mobile:** Expo 55, Expo Router, React Native, NativeWind
- **State:** Zustand with persistence
- **Forms:** React Hook Form + Zod

## Useful commands

Run each with `{{pmRunCmd}} <script>`.

| Script        | Description                                          |
| ------------- | ---------------------------------------------------- |
| `dev:web`     | Run the Next.js dev server                           |
| `dev:mobile`  | Run the Expo dev server                              |
| `build:web`   | Build the Next.js production bundle                  |
| `typecheck`   | Typecheck all three workspaces                       |
| `db:generate` | Generate a new Drizzle migration from schema changes |
| `test`        | Run the vitest suite (passes with no tests yet)      |

## Notes

- Auth integration uses Clerk's **native** Supabase third-party auth. Do **not** use the deprecated JWT-template pattern (passing a template name to Clerk's `getToken` call) — that integration path was phased out in April 2025.
- Dependencies are pinned to exact versions — update them in groups (`apps/web/package.json`, `apps/mobile/package.json`, `packages/shared/package.json`) rather than running floating-range updates.
