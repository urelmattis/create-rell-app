# {{projectName}}

Solo Mobile app scaffolded by [`create-rell-app`](https://github.com/waynewonder3/create-rell-app). Expo Router + Clerk + Supabase native third-party auth, Drizzle ORM for migrations, Clerk Billing integration hooks, NativeWind styling, and full DX tooling (ESLint, Prettier, Husky, lint-staged).

## Layout

```
{{projectName}}/
├── app/                     # Expo Router file-based routing
│   ├── (auth)/              # Sign-in / sign-up screens (Clerk Expo)
│   ├── (tabs)/              # Protected tab navigation
│   └── _layout.tsx          # Root layout with <ClerkProvider>
├── components/
│   ├── shared/              # Skeleton loaders
│   ├── auth/                # RoleGate, PaywallPrompt
│   └── forms/               # React Hook Form + Zod example
├── lib/
│   ├── supabase/            # Supabase client with Clerk accessToken callback
│   ├── auth/                # Mobile useRole hook
│   ├── validation/          # Shared Zod schemas
│   ├── env.ts               # EXPO_PUBLIC_ env var validation
│   └── token-cache.ts       # Clerk token cache backed by expo-secure-store
├── db/                      # Drizzle schema + migrations (dev tooling)
│   ├── schema.ts
│   ├── queries.ts
│   ├── client.ts            # Node-only; used by migration scripts
│   └── migrations/          # SQL migrations with RLS policies
├── stores/
│   └── app-store.ts         # Zustand with MMKV persistence
├── tailwind.config.js       # NativeWind Tailwind config
├── metro.config.js          # Metro wrapped with withNativeWind
├── babel.config.js          # babel-preset-expo + nativewind/babel
├── global.css               # Tailwind directives
├── nativewind-env.d.ts      # className typing on RN primitives
├── app.json                 # Expo config
├── .env.example
├── package.json
├── drizzle.config.ts
├── eslint.config.mjs
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
   one lives. `{{pmRunCmd}} start` runs it automatically and stops until the required
   keys are set.

3. Start the Expo dev server:

   ```sh
   {{pmRunCmd}} start
   ```

   Then press `i` for iOS simulator, `a` for Android, or scan the QR with Expo Go.

## Stack

- **Auth:** Clerk Expo + Supabase native third-party auth
- **Database:** Supabase Postgres + Drizzle ORM (with RLS policies); Supabase HTTPS client at runtime
- **Mobile:** Expo SDK 55, Expo Router, React Native 0.85, NativeWind
- **RBAC:** Three-tier (super_admin / paid / free) — mobile queries Supabase directly via the Clerk-authenticated client
- **State:** Zustand with MMKV persistence (synchronous, fast, encryptable)
- **Forms:** React Hook Form + Zod (Controller pattern for RN inputs)
- **DX:** ESLint, Prettier, Husky, lint-staged

## Useful commands

Run each with `{{pmRunCmd}} <script>`.

| Script        | Description                                                         |
| ------------- | ------------------------------------------------------------------- |
| `start`       | Run the Expo dev server                                             |
| `ios`         | Run on an iOS simulator                                             |
| `android`     | Run on an Android emulator                                          |
| `typecheck`   | Typecheck the project                                               |
| `lint`        | Run ESLint                                                          |
| `format`      | Run Prettier (write)                                                |
| `db:generate` | Generate a Drizzle migration from schema changes (Node, not mobile) |
| `db:migrate`  | Apply pending migrations                                            |
| `test`        | Run the vitest suite (passes with no tests yet)                     |

## Notes

- Auth integration uses Clerk's **native** Supabase third-party auth. Do **not** use the deprecated JWT-template pattern (passing a template name to Clerk's `getToken` call) — that integration path was phased out in April 2025.
- Drizzle Kit is a **dev-time** tool — the migration scripts run in Node, not on device. Mobile screens talk to Supabase via the `useSupabaseClient` hook in `lib/supabase/client.ts`, which goes over HTTPS and respects RLS.
- Dependencies are pinned to exact versions — update them in groups rather than running floating-range updates.
