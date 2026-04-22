

## Plan: Rebuild Onboarding + Add Subscription Paywall

### Part 1 — New onboarding flow (replace YouTube step with channel brief)

Rewrite `src/pages/Onboarding.tsx` from 3 steps to 3 better steps:

**Step 1 — Welcome & product tour** *(unchanged)*
Keep the existing "Hi, I'm Flurra" mascot intro with the four flow cards (ideas → scripts → calendar → publish).

**Step 2 — "Tell me about your channel"** *(replaces the YouTube connect step)*
A large multi-line textarea (10+ rows, no character limit) that prompts the user to dump everything about their brand:
- What the channel/business is about
- Target audience
- Tone of voice and style
- Topics they cover, things they avoid
- Any catchphrases, taglines, or recurring formats

Copy: *"The more I know about your channel, the better the ideas and scripts I'll write for you. Paste in anything that helps me get the vibe — your About page, brand guidelines, past video descriptions, whatever you've got."*

This text saves into the existing `user_content_instructions` table under a new scope `"channel_brief"` (so it's automatically picked up by the AI generation pipeline that already pulls user instructions). No DB schema change needed — `user_content_instructions` already has `(user_id, scope, instruction)` and supports arbitrary scope values; we just add `"channel_brief"` to the defaults seed and to `InstructionsView` so users can edit it later.

**Step 3 — First idea** *(unchanged)*
Keep the existing "What's on your mind?" idea capture. After saving, route to **`/onboarding/subscribe`** instead of `/connections`.

### Part 2 — Subscription paywall ($15/mo or $9.99/mo annual)

**Payment provider: Stripe (Lovable built-in)**
The Paddle eligibility check failed twice, so per Lovable's payments guidance for digital SaaS subscriptions with no physical products, **Stripe** is the right fit. It's fully built-in — no Stripe account needed to start, test mode works immediately, and you switch to live by claiming the account when you're ready to charge real customers.

**What you get with Stripe built-in:**
- A test environment immediately so you can click through the full checkout without real money
- Live charging requires claiming the account (one-click flow inside Lovable)
- Stripe Tax can be toggled on per-charge later if you want automatic VAT/sales tax handling
- Cost: ~2.9% + 30¢ per US card charge (see [Stripe pricing](https://stripe.com/pricing))

**Two products to create after enabling:**
1. **Flurra Monthly** — $15.00/month recurring
2. **Flurra Annual** — $119.88/year recurring (presented as "$9.99/mo, billed annually")

**New page: `/onboarding/subscribe`** (the conversion screen)
Built to be high-energy and value-focused, not transactional:

- **Headline:** "Unlimited posting. Every platform. One price."
- **Subhead:** "I'll handle scripts, captions, scheduling, and publishing across all 10 platforms — as much as you want, every day, forever."

- **Big value bar** showing all 10 platform icons (TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest, Reddit, Bluesky) under the label *"Post unlimited times to all of these"*.

- **Two pricing cards side by side:**

  | | Monthly | **Annual (Best value)** |
  |---|---|---|
  | Price | **$15** /month | **$9.99** /month |
  | Billed | Monthly | $119.88/year |
  | Savings | — | **Save $60/year (33% off)** |
  | CTA | Start monthly | Start annual |

  Annual card is visually emphasized: brand gradient border, "Most popular" badge, slightly larger.

- **"What you actually get" list** (checkmark items, all in first-person Flurra voice):
  - "Unlimited AI-generated scripts and captions"
  - "Unlimited posts to all 10 platforms — TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest, Reddit, Bluesky"
  - "Smart scheduling — drop a date, I queue it"
  - "Auto-publishing when the time hits"
  - "Bulk idea import from CSV"
  - "Long-form scripts auto-split into Shorts"

- **Reassurance row:** "Cancel anytime · No per-post fees · No platform limits"

- Clicking either CTA → Stripe Checkout (redirect) → success returns to `/schedule`, cancel returns to `/onboarding/subscribe`.

### Part 3 — Subscription gating & state

**New table: `subscribers`** (schema migration)
```
user_id uuid PK references auth.users
stripe_customer_id text
subscribed boolean default false
subscription_tier text  -- 'monthly' | 'annual' | null
subscription_end timestamptz
updated_at timestamptz default now()
```
RLS: users select own row; edge functions use service role to update.

**Three new edge functions:**
- `create-checkout` — creates Stripe Checkout session for the chosen price (monthly or annual), returns URL
- `customer-portal` — opens Stripe billing portal for cancel/update card
- `check-subscription` — verifies live status with Stripe, upserts `subscribers` row; called on app load and after Stripe redirect

**New hook: `useSubscription()`** — wraps `check-subscription` + caches result.

**Routing changes (`AuthGuard.tsx` + `App.tsx`):**
- After login, if `profile.onboarding_completed = false` → `/onboarding` (existing)
- After onboarding step 3 completes → `/onboarding/subscribe` (always, until subscribed)
- New `SubscriptionGuard` wraps protected routes (`/schedule`, `/ideas`, `/content/*`, `/instructions`, `/settings` except billing tab): if not subscribed → redirect to `/onboarding/subscribe`
- `onboarding_completed` is set to `true` after the user reaches the subscribe screen (so they don't get sent back to step 1 if they bounce mid-checkout)

**New Settings tab: "Billing"**
Adds a 4th tab to `Settings.tsx` showing current plan, renewal date, and a "Manage subscription" button that opens the Stripe customer portal.

### Part 4 — Cleanup

- Remove `Youtube` icon import and the entire YouTube-connect step from `Onboarding.tsx`
- Remove the legacy `handleConnectYouTube` handler (it does nothing useful now)
- Update `mem://` notes: add `channel_brief` scope, add subscription model to project memory

---

### Files touched (frontend)
- `src/pages/Onboarding.tsx` — rewrite step 2 to channel brief, route step 3 to `/onboarding/subscribe`
- `src/pages/OnboardingSubscribe.tsx` — **new** (the pricing page)
- `src/pages/SubscriptionSuccess.tsx` — **new** (post-checkout landing)
- `src/components/AuthGuard.tsx` — add subscription gate
- `src/components/SubscriptionGuard.tsx` — **new**
- `src/components/settings/BillingView.tsx` — **new**
- `src/pages/Settings.tsx` — add Billing tab
- `src/components/settings/InstructionsView.tsx` — surface the new `channel_brief` scope
- `src/hooks/useSubscription.ts` — **new**
- `src/App.tsx` — add `/onboarding/subscribe`, `/subscription/success` routes
- `src/integrations/supabase/client.ts` — *not touched* (auto-generated)

### Files touched (backend)
- New migration: `subscribers` table + RLS + add `channel_brief` row to `content_instruction_defaults`
- `supabase/functions/create-checkout/index.ts` — **new**
- `supabase/functions/customer-portal/index.ts` — **new**
- `supabase/functions/check-subscription/index.ts` — **new**

### Order of operations during build
1. Run the migration (subscribers table + channel_brief default)
2. Enable Stripe via `enable_stripe_payments`
3. Create the two Stripe products ($15/mo and $119.88/yr)
4. Build the three edge functions
5. Build the subscribe page + guards + billing tab
6. Rewrite onboarding step 2

### Two things I need from you before building
1. **Confirm Stripe** as the payment provider (built-in, no account setup needed to start in test mode).
2. **Confirm the annual price math:** $9.99 × 12 = $119.88/year billed upfront. Some folks prefer round numbers like $119/yr or $99/yr — say the word if you want a different annual total.

