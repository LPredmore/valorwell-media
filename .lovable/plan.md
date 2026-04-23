

## Plan: Comp all existing accounts + reusable "comp" mechanism

Make every existing account permanently paid (no Stripe charges, no expiration), and give you a clean way to do the same for any account in the future via the cloud database.

### Approach

I'll introduce a **"complimentary" tier** — a new value for `subscription_tier` (`'comp'`) that means "permanently paid, never expires, not tied to Stripe." The frontend treats it exactly like a paid subscriber (full access, no paywall), and the Billing tab shows a friendly "Complimentary access" card instead of a Stripe-managed plan.

This is cleaner than fake-Stripe rows because:
- No `subscription_end` to keep extending
- `check-subscription` won't accidentally downgrade comp users (it only writes when a real Stripe customer is found)
- Easy to filter / report on (`WHERE subscription_tier = 'comp'`)

### Part 1 — Backfill existing 5 accounts

One INSERT to upsert all current profiles into `subscribers` as comp:

```sql
INSERT INTO subscribers (user_id, email, subscribed, subscription_tier, subscription_end, stripe_customer_id)
SELECT p.id, p.email, true, 'comp', NULL, NULL
FROM profiles p
ON CONFLICT (user_id) DO UPDATE
SET subscribed = true,
    subscription_tier = 'comp',
    subscription_end = NULL,
    updated_at = now();
```

This grants permanent paid access to all 5 existing users (the 2 already on `monthly` get converted to `comp` so they stop being billed/expiring, and the 3 with no row get a fresh comp row).

### Part 2 — Reusable cloud DB workflow for future comps

Document and standardize the SQL you'll run from the cloud database whenever you want to comp someone:

**Comp a single user by email:**
```sql
INSERT INTO subscribers (user_id, email, subscribed, subscription_tier, subscription_end)
SELECT p.id, p.email, true, 'comp', NULL FROM profiles p WHERE p.email = 'someone@example.com'
ON CONFLICT (user_id) DO UPDATE
SET subscribed = true, subscription_tier = 'comp', subscription_end = NULL, updated_at = now();
```

**Revoke a comp:**
```sql
UPDATE subscribers SET subscribed = false, subscription_tier = NULL WHERE user_id = '...' AND subscription_tier = 'comp';
```

I'll save these as a memory file (`mem://operations/comp-accounts.md`) so they're always available when you ask.

### Part 3 — Code updates

**`src/hooks/useSubscription.ts`** — widen the type:
```ts
subscription_tier: "monthly" | "annual" | "comp" | null
```
No logic change — `subscribed: true` already drives `AuthGuard` and gating.

**`src/components/settings/BillingView.tsx`** — when `subscription_tier === 'comp'`:
- Show a green "Complimentary access" card with a Gift icon
- Copy: "You have complimentary access to Flurra. No payment method or subscription required."
- Hide the "Manage subscription" / Stripe portal button (no Stripe customer to manage)
- Hide the renewal date row

**`supabase/functions/check-subscription/index.ts`** — add a guard at the top: if the existing row's tier is `'comp'`, return it unchanged and skip Stripe entirely. Prevents any future accidental overwrite if this function ever gets called for a comp user.

### Files touched

**Data ops (insert tool, no schema change — `subscription_tier` is already `text`):**
- Backfill all profiles to `subscribers` with `subscription_tier = 'comp'`

**Code:**
- `src/hooks/useSubscription.ts` — extend tier type
- `src/components/settings/BillingView.tsx` — render comp state
- `supabase/functions/check-subscription/index.ts` — early-return for comp tier

**Memory:**
- `mem://operations/comp-accounts.md` — copy-paste SQL for future comps

### Behavior after this runs

- All 5 existing users: full app access, no paywall, no Stripe billing, no expiration
- Their Settings → Billing tab shows a friendly "Complimentary access" card
- New signups: still go through the normal Stripe paywall
- You comp a future user: run one INSERT in the cloud database (template above) → they're in immediately
- Stripe webhooks / `check-subscription` will never overwrite or downgrade a comp row

### Out of scope

- Admin UI for comping users (could be added later under Settings → Admin if you want a button instead of SQL)
- LinkedIn/Reddit native connections — still paused awaiting credentials

