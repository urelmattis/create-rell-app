// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import { ProfileForm } from '@/components/forms/ProfileForm';

// The shared workspace package; the name is fixed at scaffold time.
const SHARED_PACKAGE = '@{{projectNameKebab}}/shared';

// Demo settings route for Story 4.2. The page itself stays a Server Component
// so Clerk's `auth()` context and layout gating from Story 2.3 still apply;
// the form is a client component rendered as a child.
export default function SettingsPage() {
  return (
    <section>
      <h1>Profile settings</h1>
      <p>
        Example React Hook Form + Zod wiring. The schema lives in <code>{SHARED_PACKAGE}</code> so
        mobile can reuse it.
      </p>
      <ProfileForm />
    </section>
  );
}
