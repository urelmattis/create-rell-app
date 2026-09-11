// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
// Drizzle schema for {{projectName}}.
//
// This file is the single source of truth for the {{projectName}} database.
// Server code imports from `@/db/schema` (or the barrel at `@/db/queries`).
// Keep it free of framework-specific imports so Drizzle Kit can read it
// at generate/migrate time without spinning up Next.js.
//
// Naming conventions (enforced by architecture.md):
//   - Tables: snake_case plural (user_roles)
//   - Columns: snake_case (clerk_user_id, created_at)
//   - Indexes: idx_<table>_<column>
//
// Role-based access control uses the three tiers super_admin / paid / free
// defined here. Row-level security policies in db/migrations/0000_initial.sql
// reference `auth.jwt()->>'sub'` (Clerk user ID) to enforce per-user access.

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * RBAC tiers. Adding a new role requires a schema migration and updates to
 * the RLS policies in `db/migrations/`.
 */
export const ROLES = ['super_admin', 'paid', 'free'] as const;
export type Role = (typeof ROLES)[number];

/**
 * `user_roles` maps each Clerk user to their current RBAC tier. The
 * `clerk_user_id` column matches the `sub` claim in the Clerk JWT, which
 * is what Supabase RLS policies compare against via `auth.jwt()->>'sub'`.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    role: text('role', { enum: ROLES }).notNull().default('free'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clerkUserIdx: index('idx_user_roles_clerk_user_id').on(table.clerkUserId),
  }),
);

/**
 * Row shape for an existing user_roles record. Derived from the table so
 * schema changes propagate automatically.
 */
export type UserRole = typeof userRoles.$inferSelect;

/**
 * Row shape for inserting a new user_roles record. Drizzle derives the
 * required vs optional fields from the column defaults and NOT NULL
 * constraints.
 */
export type NewUserRole = typeof userRoles.$inferInsert;

/**
 * `webhook_deliveries` records every Clerk/svix webhook we've successfully
 * processed so retries within svix's replay window don't re-execute the
 * handler. The primary key is the `svix-id` header — svix guarantees it's
 * unique per delivery attempt, so an `INSERT ... ON CONFLICT DO NOTHING`
 * against it is a safe idempotency check.
 */
export const webhookDeliveries = pgTable('webhook_deliveries', {
  svixId: text('svix_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
