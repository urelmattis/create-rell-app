// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
// Typed query helpers for {{projectName}}.
//
// Every helper takes a `db` client as its first argument so callers can
// inject either the lazy singleton from `./client` or a request-scoped
// client. These helpers are Node-only — use the Supabase hook in
// `lib/supabase/client.ts` for React Native screens.

import { eq } from 'drizzle-orm';

import type { DbClient } from './client';
import { type NewUserRole, type Role, type UserRole, userRoles, webhookDeliveries } from './schema';

/**
 * Fetch a user_roles row by Clerk user ID. Returns `null` if the user has
 * not yet been assigned a role (e.g. immediately after sign-up but before
 * a webhook upserts the default tier).
 */
export async function getUserRoleByClerkId(
  db: DbClient,
  clerkUserId: string,
): Promise<UserRole | null> {
  const rows = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.clerkUserId, clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert a user's role. Used by the Clerk webhook handler when a user is
 * created (assign 'free') or after a billing event changes their tier.
 * Returns the resulting row so callers can confirm the mutation.
 */
export async function setUserRole(
  db: DbClient,
  clerkUserId: string,
  role: Role,
): Promise<UserRole> {
  const now = new Date();
  const values: NewUserRole = { clerkUserId, role, updatedAt: now };
  const rows = await db
    .insert(userRoles)
    .values(values)
    .onConflictDoUpdate({
      target: userRoles.clerkUserId,
      set: { role, updatedAt: now },
    })
    .returning();
  const result = rows[0];
  if (!result) {
    throw new Error(`setUserRole: upsert returned no rows for clerkUserId=${clerkUserId}`);
  }
  return result;
}

/**
 * Insert a 'free' user_roles row only if the user does not already have
 * one. Idempotent — used by the `user.created` webhook handler so that
 * a replay after the user has upgraded does not demote them back to free.
 */
export async function insertDefaultUserRole(db: DbClient, clerkUserId: string): Promise<void> {
  await db
    .insert(userRoles)
    .values({ clerkUserId, role: 'free' })
    .onConflictDoNothing({ target: userRoles.clerkUserId });
}

/**
 * Attempt to record a webhook delivery. Returns true if this is the
 * first time we've seen this svix-id, false if it's a replay that the
 * caller should ignore. Paired with ON CONFLICT DO NOTHING so concurrent
 * requests stay safe.
 */
export async function markWebhookSeen(
  db: DbClient,
  svixId: string,
  eventType: string,
): Promise<boolean> {
  const rows = await db
    .insert(webhookDeliveries)
    .values({ svixId, eventType })
    .onConflictDoNothing({ target: webhookDeliveries.svixId })
    .returning();
  return rows.length > 0;
}
