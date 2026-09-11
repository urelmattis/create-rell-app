// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import { ProfileForm } from '@/components/forms/ProfileForm';

// Demo settings route for Story 4.2. The page itself stays a Server Component
// so Clerk's `auth()` context and layout gating from Story 2.3 still apply;
// the form is a client component rendered as a child.
export default function SettingsPage() {
  return (
    <section>
      <h1>Profile settings</h1>
      <p>
        Example React Hook Form + Zod wiring. The schema lives in{' '}
        <code>lib/validation/profile-form.ts</code> — a single source of truth the form, any server
        action, and any API route can all validate against.
      </p>
      <ProfileForm />
    </section>
  );
}
