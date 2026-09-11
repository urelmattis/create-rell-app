// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import { PricingTable } from '@clerk/nextjs';

import { getCurrentUserWithRole } from '@/lib/auth/current-user';

// Billing page for {{projectName}}.
//
// Clerk's <PricingTable /> renders the subscription tiers configured in
// your Clerk Dashboard and handles the entire checkout flow — plan
// selection, Stripe redirect, and post-checkout confirmation — without
// any app-side integration. Configure plans at
// https://dashboard.clerk.com/last-active?path=billing
//
// The "current plan" label above the table reads from the Drizzle
// `user_roles` table rather than Clerk's subscription state directly.
// This keeps RBAC authoritative at the database layer; the billing
// webhook (Story 3.2) keeps `user_roles` in sync whenever Clerk emits a
// subscription.created / .updated / .cancelled event.
export default async function BillingPage() {
  const current = await getCurrentUserWithRole();

  return (
    <section aria-labelledby="billing-heading" className="flex flex-col gap-4">
      <h1 id="billing-heading" className="text-2xl font-semibold">
        Billing
      </h1>
      <p>
        Current plan: <strong>{current?.role ?? 'free'}</strong>
      </p>
      <p>
        Pick a plan below. Clicking a tier starts Clerk&apos;s managed checkout flow; when you
        complete it, a webhook updates your role in the database and your access elevates on the
        next page load.
      </p>
      <PricingTable />
      <p className="mt-6 text-sm opacity-70">
        To manage an existing subscription (change plan, update payment method, cancel), open the
        Clerk user menu in the header — subscription management lives alongside your account
        settings under Clerk&apos;s <code>&lt;UserButton /&gt;</code>.
      </p>
    </section>
  );
}
