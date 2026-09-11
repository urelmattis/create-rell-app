// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import 'server-only';

// Server-side helper for {{projectName}} that resolves the current Clerk
// user and their RBAC role in one call. Reads the role from the Drizzle
// `user_roles` table — NOT from Clerk's billing subscription state
// directly — because the DB table is the canonical source of truth for
// RBAC. The billing webhook (Story 3.2) keeps the table in sync whenever
// Clerk emits a subscription lifecycle event.
//
// Why a helper instead of inlining the queries? Server components call
// this from multiple routes (billing, dashboard home, protected pages);
// centralizing the `auth() + getDb() + query` chain keeps the call sites
// one-liners and ensures every caller defaults to 'free' the same way.

import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { getDb, getUserRoleByClerkId } from '@{{projectNameKebab}}/shared';
import type { Role } from '@{{projectNameKebab}}/shared';

export interface CurrentUserWithRole {
  clerkUserId: string;
  role: Role;
}

/**
 * Resolve the current Clerk user and their RBAC role.
 *
 * Returns `null` if the caller is not signed in. For signed-in users with
 * no row in `user_roles`, returns `{ role: 'free' }` — the defensive
 * default handles new sign-ups before the billing webhook has populated
 * their row.
 *
 * Wrapped in React's cache() so duplicate calls within a single render dedupe.
 */
export const getCurrentUserWithRole = cache(async (): Promise<CurrentUserWithRole | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const row = await getUserRoleByClerkId(getDb(), userId);
  return {
    clerkUserId: userId,
    role: row?.role ?? 'free',
  };
});
