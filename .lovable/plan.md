

## Plan: Centralize registration-state routing

### The state machine

Every authenticated user is in exactly **one** of three states, derived on the fly from `profiles.onboarding_completed` + `subscribers.subscribed`:

| State | Condition | Allowed routes |
|---|---|---|
| **`needs_onboarding`** | `onboarding_completed = false` | `/onboarding` only |
| **`needs_subscription`** | onboarded, not subscribed | `/onboarding/subscribe`, `/subscription/success`, `/settings?tab=billing` |
| **`active`** | onboarded + subscribed | All app routes |

Unauthenticated → `/login` (or `/signup`).

### Implementation

**1. New hook `src/hooks/useRegistrationStatus.ts`**
Single source of truth. Combines `useAuth` + `useProfile` + `useSubscription` and returns:
```ts
{ status: 'loading' | 'unauthenticated' | 'needs_onboarding' | 'needs_subscription' | 'active', user, profile, subscription }
```

**2. Rewrite `src/components/AuthGuard.tsx` as the single router-level gate**
Drop the separate `SubscriptionGuard`. AuthGuard now takes an optional `requires` prop: `'auth' | 'onboarded' | 'subscribed'` (default `'subscribed'`). It reads `useRegistrationStatus` and:
- `loading` → spinner
- `unauthenticated` → redirect `/login`
- `needs_onboarding` and current path ≠ `/onboarding` → redirect `/onboarding`
- `needs_subscription` and not on `/onboarding/subscribe`, `/subscription/success`, or `/settings` → redirect `/onboarding/subscribe`
- `active` and on `/onboarding` or `/onboarding/subscribe` → redirect `/schedule` (prevents re-entry)

**3. Update `src/App.tsx`**
- Remove all `<SubscriptionGuard>` wrappers — AuthGuard handles everything now.
- Wrap **every** authenticated route (including `/onboarding`, `/onboarding/subscribe`, `/subscription/success`, `/settings`) in `<AuthGuard>`.
- Delete `src/components/SubscriptionGuard.tsx`.

**4. Fix `Login.tsx` and `Signup.tsx` post-auth redirects**
- Login: navigate to `/` (root). The root route renders `<AuthGuard>` which routes the user to the correct state (`/onboarding`, `/onboarding/subscribe`, or `/schedule`). No more hardcoded `/schedule` that gets bounced through three guards.
- Signup `useEffect`: same — go to `/` and let the guard route.

**5. `Settings.tsx` — billing-only mode for unsubscribed users**
When status is `needs_subscription`:
- Force `activeTab = 'billing'`
- Hide the Profile / Instructions / Connections tab triggers
- Show a banner at the top: *"Your subscription is paused. Restart it below to get back to posting."*
This keeps the "users can manage billing without a sub" requirement while preventing them from poking around the rest of the app.

**6. `Onboarding.tsx` — finish-step routing**
`finishOnboarding()` already navigates to `/onboarding/subscribe`. Keep, but also let the AuthGuard be the safety net (so if someone manually hits `/onboarding` after completing it, they get sent forward correctly).

**7. `OnboardingSubscribe.tsx` — remove the manual `subscription?.subscribed → /schedule` redirect**
The guard handles it now. Removing the in-component navigate avoids race conditions during the post-checkout refresh.

### Why this fixes the reported issue

Today the redirect logic is split across `AuthGuard` (onboarding only), `SubscriptionGuard` (subscription only, applied to *some* routes), and three different `useEffect`s in Login/Signup/OnboardingSubscribe — they can disagree. After this change, **one hook + one guard** decide where any user can be at any moment, evaluated on every navigation.

### Files touched
- `src/hooks/useRegistrationStatus.ts` — **new**
- `src/components/AuthGuard.tsx` — rewrite
- `src/components/SubscriptionGuard.tsx` — **delete**
- `src/App.tsx` — simplify route guards
- `src/pages/Login.tsx` — redirect to `/`
- `src/pages/Signup.tsx` — redirect to `/`
- `src/pages/Settings.tsx` — billing-only mode when unsubscribed
- `src/pages/OnboardingSubscribe.tsx` — drop manual redirect

No DB changes, no edge function changes.

