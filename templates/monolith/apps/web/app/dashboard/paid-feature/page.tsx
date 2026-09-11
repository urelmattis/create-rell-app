// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import { RoleGate } from '@/components/auth/RoleGate';

// Demo protected-by-tier route for {{projectName}}.
//
// Wraps the "paid" content in a `<RoleGate requiredRole="paid">`. Free
// users see the default `<PaywallPrompt />`; paid and super_admin users
// see the actual feature content. Delete or rename this page once you
// start building real paid features.
//
// Remember: RoleGate is a client component, so this page needs at least
// the gate itself as a client boundary. The page shell is still a server
// component — RoleGate handles its own 'use client' directive.
export default function PaidFeaturePage() {
  return (
    <section>
      <h1>Paid feature demo</h1>
      <p>Everything below is gated on the paid tier:</p>
      <RoleGate requiredRole="paid">
        <div>
          <h2>Welcome, paid user</h2>
          <p>
            This is where your paid-tier content lives. Free users see the paywall; paid users see
            this section.
          </p>
        </div>
      </RoleGate>
    </section>
  );
}
