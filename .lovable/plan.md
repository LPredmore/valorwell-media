

## Diagnosis

Your `info@bestselfs.com` row in the database is **already** `subscribed = true, tier = monthly, ends 2026-05-22`. The Stripe portal is right.

The bug isn't the data — it's that `check-subscription` is **erasing** that data every time the production site calls it, and then bouncing you to `/onboarding/subscribe`.

### Why

Your production build has **no** `VITE_PAYMENTS_CLIENT_TOKEN` set (only `.env.development` has the sandbox `pk_test_…` token). So in production:

1. `getStripeEnvironment()` sees `undefined` → falls through to **`"live"`**
2. The frontend asks `check-subscription` for **live** Stripe data
3. Live Stripe has no customer for `info@bestselfs.com` (the subscription was made in sandbox/test)
4. The edge function does `customers.data.length === 0` → **upserts `subscribed: false`** into your `subscribers` row
5. `useRegistrationStatus` sees `subscribed: false` → guard sends you to `/onboarding/subscribe`

Meanwhile the preview environment (which DOES have the sandbox token) writes `subscribed: true` back. So the row is flipping every time either environment polls.

This is a real production correctness bug — not just a one-user issue. Anyone subscribing via the live site once you go live will have their status wiped if any sandbox/preview call ever runs against their email.

### The fix (4 small changes)

**1. `src/lib/stripe.ts` — fail loudly instead of silently defaulting to "live"**
If `VITE_PAYMENTS_CLIENT_TOKEN` is missing, `getStripeEnvironment()` should throw, and `useSubscription` should treat that as "no payments configured" instead of guessing "live". Removes the silent wrong-environment guess.

**2. `supabase/functions/check-subscription/index.ts` — never demote on a 0-customer result**
Today, when Stripe returns no customer, the function writes `subscribed: false`. That's destructive when called from the wrong environment. New behavior:
- If we find a customer + active sub → upsert `true` (as today)
- If we find a customer with NO active sub → upsert `false` (cancel detection)
- If we find **no customer at all** → **return the existing DB row unchanged**, do not upsert

This makes the function idempotent and safe to call from the wrong env. The `subscribers` table becomes the source of truth for "have we ever confirmed this user is subscribed", and only a real cancellation in the matching environment can flip it back to false.

**3. `src/hooks/useRegistrationStatus.ts` — read straight from the DB row, don't depend on `check-subscription` succeeding**
Replace the `useSubscription` hook's edge-function call with a direct `supabase.from("subscribers").select(...)` query for the current user. The Stripe sync still runs (via the billing portal flow, the success page, and an optional background refresh) but routing decisions are made off the DB row, not a live Stripe call. RLS already restricts users to their own row.

**4. One-time DB correction for `info@bestselfs.com`**
Run a single update via migration to set the row back to `subscribed: true, tier: monthly, end: 2026-05-22` so you stop bouncing immediately. (Without #1–#3, the next `check-subscription` would just wipe it again — so this update is the *last* step, after the other three ship.)

### What this does NOT change
- Onboarding flow, subscription gating logic, billing tab, Stripe products, edge function `verify_jwt` settings — all unchanged.
- No new tables, no new env vars required, no new Stripe configuration.

### Files touched
- `src/lib/stripe.ts` — strict env detection
- `src/hooks/useSubscription.ts` — query DB row directly instead of invoking edge function
- `supabase/functions/check-subscription/index.ts` — non-destructive when customer not found
- One migration: `UPDATE subscribers SET subscribed = true, ... WHERE email = 'info@bestselfs.com'`

### Note on going fully live later
Once you finish Stripe go-live and have a `pk_live_…` token, you'll want to add `VITE_PAYMENTS_CLIENT_TOKEN` to `.env.production` so the live site actually talks to live Stripe. Until then, the changes above keep both environments coexisting safely.

