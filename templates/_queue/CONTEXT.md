# {{projectName}}

One paragraph on what this product is and who it is for. The agents read this file before every issue, so a sentence here saves a paragraph in every ticket.

## Glossary

The words this project uses, one line each. Add a term the first time two people (or a person and an agent) mean different things by it; `/grill-with-docs` and `/domain-modeling` keep this list sharp.

- **Tier**: what a signed-in user is allowed to do. One of `super_admin`, `paid`, `free`, stored in `user_roles` and enforced in three places at once: the server helpers (`lib/auth/roles.ts`), the client side (`useRole`, `RoleGate`), and Supabase row-level security. The auth middleware only gates signed-in routes.
- **Clerk user**: the identity Clerk holds; the app's `user_roles` rows are keyed by `clerk_user_id`, the JWT `sub` that Supabase's native third-party auth passes through.
- **Migration**: a SQL file under the Drizzle `db/migrations/` directory (`packages/shared/db/` in a monorepo) generated from the schema; the schema is the source, the file is the record, and a person applies it with `db:migrate`.
- **Plan**: a Clerk Billing subscription; the webhook maps a plan to a tier.

## Decisions

Architecture decisions live in `docs/adr/`, one file each, written when a decision is actually made.
