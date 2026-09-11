// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import type { Role } from '@{{projectNameKebab}}/shared';

// Map a Clerk Billing plan identifier to the corresponding RBAC role.
//
// Clerk plans are configured in the Clerk Dashboard; the `plan_key` (or
// `slug`) you set there shows up in the webhook event payloads. Edit the
// switch below when you add new plans — missing cases default to 'free'
// so a typo-in-dashboard never accidentally elevates a user's privileges.
//
// Known plans shipped by the create-rell-app monolith template:
//   - 'free_tier'   → 'free'   (default, no paid features)
//   - 'paid_tier'   → 'paid'   (single paid tier; extend for annual/monthly)
//   - 'admin_tier'  → 'super_admin'  (internal only, not exposed in the pricing table)

export function planToRole(planKey: string | null | undefined): Role {
  switch (planKey) {
    case 'paid_tier':
      return 'paid';
    case 'admin_tier':
      return 'super_admin';
    case 'free_tier':
    case null:
    case undefined:
      return 'free';
    default: {
      // Unknown plan → safest behavior is to downgrade to the free tier.
      // An unknown plan from Clerk dashboard is a config bug; log it and
      // keep the user at the lowest privilege level. Sanitize the key
      // before logging so a crafted webhook payload can't smuggle control
      // characters, ANSI escapes, or unbounded data into log pipelines.
      const safeKey = String(planKey)
        .replace(/[^\w.-]/g, '?')
        .slice(0, 40);
      console.warn('[plan-to-role] unknown plan key, defaulting to free:', safeKey);
      return 'free';
    }
  }
}
