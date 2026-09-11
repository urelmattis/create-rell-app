// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
import { NextResponse, type NextRequest } from 'next/server';
import { Webhook } from 'svix';

import { handleBillingEvent, type ClerkBillingEvent } from '@/lib/billing/event-handler';
import { serverEnv } from '@/lib/env-server';

// Clerk Billing webhook endpoint for {{projectName}}.
//
// === SECURITY ===
// Signature validation must run BEFORE any JSON parsing or DB access.
// svix needs the RAW request body (a string) to compute the HMAC — if
// we parse and re-serialize, the bytes differ and verification fails.
//
// The signing secret is shared with the Clerk Dashboard at the time of
// webhook setup. Rotate it there and in `.env.local` whenever there's a
// suspected leak.
//
// === CONFIG ===
// Set the webhook URL to `https://<your-domain>/api/webhooks/clerk-billing`
// in your Clerk dashboard (Billing → Webhooks) and subscribe to the event
// types handled below: user.created, subscription.created / .updated /
// .cancelled / .deleted.
//
// === ERROR HANDLING ===
// - 400 on signature validation failure — Clerk will stop retrying a
//   genuinely bad signature (we don't want infinite retries on a
//   misconfigured secret either; fix the config and Clerk can replay).
// - 500 on DB write failure — Clerk will retry with exponential backoff.
// - 200 on success or unknown event type — svix retries are expensive
//   and unknown events are expected during SDK upgrades.

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read the raw body as text. Do NOT parse the body as JSON first —
  // svix needs the exact bytes Clerk signed, and parse + re-serialize
  // would produce a different byte sequence that fails HMAC verification.
  const rawBody = await req.text();

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  let verifiedEvent: ClerkBillingEvent;
  try {
    const wh = new Webhook(serverEnv.clerk.billingWebhookSigningSecret);
    verifiedEvent = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkBillingEvent;
  } catch (err) {
    console.error('[clerk-billing webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    // Pass svixId so handleBillingEvent can dedupe replays via the
    // webhook_deliveries table — see lib/billing/event-handler.ts.
    const result = await handleBillingEvent(verifiedEvent, svixId);
    // Unknown event types AND replays both fall through with
    // processed: false → 200 OK so svix doesn't retry.
    return NextResponse.json({ ok: true, processed: result.processed });
  } catch (err) {
    console.error('[clerk-billing webhook] handler error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
