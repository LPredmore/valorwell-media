---
name: Subscription billing & paywall
description: Stripe-powered Flurra subscription model, paywall, gating, and billing tab
type: feature
---

## Plans (Stripe products)
- `flurra_monthly` price `flurra_monthly_15` — $15.00/month
- `flurra_annual` price `flurra_annual_11988` — $119.88/year (presented as "$9.99/mo")

## Database
- `subscribers` table: `user_id PK`, `email`, `stripe_customer_id`, `subscribed`, `subscription_tier` ('monthly'|'annual'), `subscription_end`. RLS: users can only SELECT their own row; writes happen via service-role edge functions.

## Edge functions (all `verify_jwt = false` in supabase/config.toml)
- `create-checkout` — Stripe Embedded Checkout session. Resolves price via `lookup_keys`, mode `subscription`, `ui_mode: "embedded"`, attaches `userId` to metadata + subscription_data.metadata.
- `customer-portal` — Stripe Billing Portal session for managing/cancelling. Requires auth.
- `check-subscription` — Looks up Stripe customer by email, fetches active subscription, upserts `subscribers` row, returns `{ subscribed, subscription_tier, subscription_end }`. Requires auth.

All functions use `createStripeClient` from `supabase/functions/_shared/stripe.ts` (gateway proxy — never instantiate Stripe SDK directly; the env API keys are gateway connection identifiers, not real Stripe secrets).

## Frontend
- `src/lib/stripe.ts` — `getStripe()` and `getStripeEnvironment()` (derived from `pk_test_` vs `pk_live_` prefix on `VITE_PAYMENTS_CLIENT_TOKEN`).
- `src/hooks/useSubscription.ts` — wraps `check-subscription`, `staleTime: 30s`, refetch on focus.
- `src/components/SubscriptionGuard.tsx` — wraps protected routes; redirects to `/onboarding/subscribe` when `subscribed=false`.
- `src/pages/OnboardingSubscribe.tsx` — pricing page, opens Stripe Embedded Checkout in a Dialog.
- `src/pages/SubscriptionSuccess.tsx` — return URL `/subscription/success?session_id=...`, force-refreshes subscription status, then "Go to my schedule".
- `src/components/settings/BillingView.tsx` — Settings → Billing tab; opens customer portal in a new tab.

## Routing rules
- `/settings` is NOT subscription-gated — users always need access to the Billing tab to restart/manage.
- `/schedule`, `/ideas`, `/content/*`, `/instructions` are wrapped in `SubscriptionGuard`.
- Onboarding flow ends by routing to `/onboarding/subscribe`. After successful checkout, return URL → `/subscription/success` → `/schedule`.

## Embedded vs redirect
ALWAYS use Embedded Checkout (per Lovable Stripe knowledge). Never use redirect mode, never use `success_url`/`cancel_url` — only `return_url` with `{CHECKOUT_SESSION_ID}` placeholder (Stripe substitutes server-side).
