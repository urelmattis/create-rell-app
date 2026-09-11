// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import 'server-only';

// Server-side RBAC helpers for {{projectName}}.
//
// The three-tier RBAC architecture enforces access at every layer:
//
//   1. Server layer: these helpers read `user_roles` via Drizzle. Use
//      them inside server components, server actions, and route handlers
//      to gate access.
//
//   2. Client layer: `use-role.ts` exposes a hook that fetches the
//      current role from `/api/me/role`. Use it for UI gating only —
//      client-side checks are not security; they hide UI for UX.
//
//   3. Database layer: Row-Level Security policies (see the migrations
//      in `shared/db/migrations/`) use `auth.jwt()->>'sub'` and the
//      `public.is_super_admin()` SECURITY DEFINER function to enforce
//      access at the lowest level. Even a bug in application code can't
//      read rows it shouldn't because the database refuses.
//
// NEVER rely on a single layer. Middleware (Story 2.3) provides coarse
// auth gating; these helpers provide role gating; RLS provides the
// ultimate safety net.

import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { getDb, getUserRoleByClerkId } from '@{{projectNameKebab}}/shared';
import type { Role } from '@{{projectNameKebab}}/shared';

/**
 * Check whether a specific Clerk user currently has the given role.
 * Does NOT call `auth()` — the caller must supply the user ID. Useful
 * in API routes that have already resolved the caller.
 *
 * Users with no row in `user_roles` are treated as 'free'.
 *
 * Wrapped in React's cache() so duplicate calls within a single render dedupe.
 */
export const hasRole = cache(async (clerkUserId: string, role: Role): Promise<boolean> => {
  const row = await getUserRoleByClerkId(getDb(), clerkUserId);
  const effective = row?.role ?? 'free';
  return effective === role;
});

/**
 * Check whether the currently-signed-in user has the given role. Calls
 * `auth()` internally. Returns false if no user is signed in.
 *
 * Wrapped in React's cache() so duplicate calls within a single render dedupe.
 */
export const currentUserHasRole = cache(async (role: Role): Promise<boolean> => {
  const { userId } = await auth();
  if (!userId) return false;
  return hasRole(userId, role);
});

/**
 * Is the given user a super_admin? Helper for the common god-mode check.
 *
 * Wrapped in React's cache() so duplicate calls within a single render dedupe.
 */
export const isAdmin = cache(async (clerkUserId: string): Promise<boolean> => {
  return hasRole(clerkUserId, 'super_admin');
});

/**
 * Does the given user have paid access? Returns true for both the 'paid'
 * tier and 'super_admin' (admins implicitly have paid access — no need
 * to dual-assign). Use this for gating paid features; use `isAdmin` for
 * gating admin-only features.
 *
 * Wrapped in React's cache() so duplicate calls within a single render dedupe.
 */
export const isPaid = cache(async (clerkUserId: string): Promise<boolean> => {
  const row = await getUserRoleByClerkId(getDb(), clerkUserId);
  const effective = row?.role ?? 'free';
  return effective === 'paid' || effective === 'super_admin';
});
