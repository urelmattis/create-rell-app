// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
// Shared Zod schema for the example Profile form (Story 4.2).
//
// Why this file lives in `shared/` and not in the web or mobile workspace:
//   - It's the single source of truth for field rules.
//   - Both web and mobile forms derive their TypeScript type from `z.infer`,
//     which guarantees the two UIs stay in lockstep when fields are added or
//     renamed.
//   - Server code (e.g. API routes, Drizzle inserts) can validate incoming
//     payloads against the exact same schema the client used. No drift.
//
// Callers:
//   - web/components/forms/ProfileForm.tsx
//   - mobile/components/forms/ProfileForm.tsx
//   - any API route or server action that accepts a profile payload

import { z } from 'zod';

export const profileFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { message: 'Display name must be at least 2 characters.' })
    .max(60, { message: 'Display name must be 60 characters or fewer.' }),
  bio: z.string().trim().max(280, { message: 'Bio must be 280 characters or fewer.' }),
  website: z
    .string()
    .trim()
    .url({ message: 'Website must be a valid URL.' })
    .optional()
    .or(z.literal('')),
});

// Derived TypeScript type — do NOT hand-write a parallel interface. Keeping
// this as the only place the shape is defined is what prevents drift between
// web, mobile, and server.
export type ProfileFormValues = z.infer<typeof profileFormSchema>;
