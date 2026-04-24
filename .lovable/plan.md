
## Goal

Get the app fully usable for you right now with **zero payment friction**, while keeping all the existing Lovable Payments plumbing intact for one-flag reactivation later.

## Quick clarification first

"Lovable Payments" *is* Stripe under the hood — Lovable's built-in integration so you don't manage keys yourself. They're the same thing; I was just sliding between names. Nothing about the comp work broke this.

## Approach: a `PAYMENTS_ENABLED` feature flag

Add one boolean flag (`VITE_PAYMENTS_ENABLED`) read by the registration state machine. When `false` (the default for now):

- The `needs_subscription` state never triggers — every authenticated, onboarded user is treated as `active`
- `/onboarding/subscribe` and `/subscription/success` redirect to `/schedule`
- Settings → Billing shows a friendly "Payments aren't enabled yet" card instead of the portal button
- Signup → onboarding → app, with no payment step and no payments calls anywhere

When you flip it to `true` later, all the existing logic (paywall, Embedded Checkout, customer portal, comp tier, subscription sync) reactivates exactly as built. Nothing gets deleted.

## Changes

### 1. Add the flag

`.env.development` (and `.env.production` when you publish):
```
VITE_PAYMENTS_ENABLED=false
```

### 2. `src/lib/featureFlags.ts` (new)

```ts
export const PAYMENTS_ENABLED =
  import.meta.env.VITE_PAYMENTS_ENABLED === "true";
```

### 3. `src/hooks/useRegistrationStatus.ts`

When `PAYMENTS_ENABLED` is false, skip the subscription check entirely — go from `needs_onboarding` → `active`. Don't even call `useSubscription`.

### 4. `src/components/AuthGuard.tsx`

When `PAYMENTS_ENABLED` is false:
- Treat `/onboarding/subscribe` and `/subscription/success` as redirects → `/schedule`
- The `needs_subscription` branch becomes unreachable

### 5. `src/pages/Onboarding.tsx`

When `PAYMENTS_ENABLED` is false, the final onboarding step routes to `/schedule` instead of `/onboarding/subscribe`. Same for the "already onboarded" early-return.

### 6. `src/components/settings/BillingView.tsx`

When `PAYMENTS_ENABLED` is false, render a placeholder:
> "Payments aren't enabled yet. The app is currently free to use for invited accounts."

Hide the portal button and plan/renewal sections. Keep the comp branch untouched (harmless and ready for later).

### 7. Existing comp accounts: leave them as-is

The existing comp rows in `subscribers` don't hurt anything — when payments are off, the table is just ignored. When payments are turned back on, those accounts stay as comp (full access, no billing), which is what you want for your own accounts long-term.

## How to re-enable payments later (one-line change)

Set `VITE_PAYMENTS_ENABLED=true` and republish. Everything we already built activates:
- Paywall after onboarding
- Embedded Checkout at `/onboarding/subscribe`
- Billing tab with portal access
- Subscription syncing
- Your comp accounts keep full access automatically

Remaining work to actually take real money at that point:
1. Create the two products/prices (`flurra_monthly_15`, `flurra_annual_11988`) in Lovable Payments — one tool call
2. Complete go-live verification — done in the Lovable UI

Both can wait until you're ready to charge.

## Files touched

- `.env.development` — add `VITE_PAYMENTS_ENABLED=false`
- `src/lib/featureFlags.ts` — new
- `src/hooks/useRegistrationStatus.ts` — gate subscription check
- `src/components/AuthGuard.tsx` — skip subscribe routes when disabled
- `src/pages/Onboarding.tsx` — skip subscribe step when disabled
- `src/components/settings/BillingView.tsx` — placeholder card when disabled

No database changes. No edge function changes. No payment code deleted.

## What you'll see immediately after this ships

- Sign up a new account → onboarding → straight into `/schedule`. No paywall.
- Existing accounts: same — no paywall, app works fully.
- Settings → Billing: friendly "not enabled yet" card.
- Lovable Payments dashboard: untouched, no live charges possible.

## Out of scope (saved for when you flip the flag)

- Creating products & prices in Lovable Payments
- Go-live verification
- Live test of the checkout → success → billing portal loop
