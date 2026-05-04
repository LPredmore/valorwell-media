# Fix Upload-Post connect failures (TikTok and all platforms)

## Definitive decision

**Switch to lazy, just-in-time provisioning with self-healing on every Connect, and stop tracking "slots" client-side.**

I am explicitly rejecting the alternative of "monitor slot count and pre-provision." Here's why:

- Upload-Post's `/api/uploadposts/users` listing is the only source of truth for what exists upstream. Any cache we keep in our DB will drift the moment a profile is deleted, expires, or is pruned by Upload-Post — exactly what bit you today (DB said `ready`, upstream said `PROFILE_NOT_FOUND`).
- A "slot monitor" cron solves the wrong problem. It tells us *after the fact* that we're full. It doesn't help the user clicking Connect *right now*, and it adds a new failure surface (cron drift, stale counts, race conditions with concurrent signups).
- Lazy provisioning makes "available slots" a non-issue for 95% of users: a profile is only created when a user actually clicks Connect for the first time. Signups that never use the feature consume zero slots.
- Self-healing on every Connect click means the cached `ready` flag can never lie. If upstream doesn't have the profile, we recreate it inline. If recreation fails because the plan is genuinely full, the user (and you) get a precise, actionable error in the same request — no polling, no cron, no guessing.

This is the same pattern Stripe, Twilio, and every mature SaaS uses for upstream resources: don't cache existence, verify on use, recover on miss.

## What changes

### 1. Stop eager provisioning on signup

`handle_new_user` currently fires a `pg_net` POST to `upload-post-create-profile` for every new user. Remove that call. Keep the `INSERT INTO upload_post_profiles (... 'pending')` row so we have somewhere to attach status, but don't touch Upload-Post until the user asks for it.

Rationale: every abandoned signup currently burns a profile slot. With a 5-profile basic plan, 5 tire-kickers locks every real user out. This is the actual root cause of recurring failures, not a missing monitor.

### 2. Make `upload-post-generate-link` self-healing

This is the function the Connect button calls. Rewrite its flow:

```
1. Look up profile row from DB (must exist — created at signup).
2. GET https://api.upload-post.com/api/uploadposts/users/{username}
   - 200: profile exists upstream → continue.
   - 404: profile missing upstream → call create-profile inline, then continue.
   - other: bubble error.
3. POST /generate-jwt as today.
4. Return access_url.
```

Step 2 is the self-heal. It costs one extra GET per Connect click (cheap, rare action) and eliminates the entire class of "ready in our DB, gone upstream" bugs forever.

### 3. Tighten `upload-post-create-profile` error semantics

Today it lumps every failure into `provisioning_status = 'error'` with a freeform string. Change to:

- `ready` — created or already existed (201/409)
- `limit_reached` — Upload-Post returned 403 `PROFILE_LIMIT_REACHED`
- `error` — anything else, with `provisioning_error` text

The new `limit_reached` value is what the UI keys off to show the right message.

### 4. Slot-aware error UX (the part that addresses your "monitor" concern correctly)

Instead of a background monitor, we surface real upstream state at the exact moment it matters — when the user clicks Connect:

- If `create-profile` returns `limit_reached`, `generate-link` returns HTTP 409 with `{ error_code: "PROFILE_LIMIT_REACHED", message: "..." }`.
- `ConnectionsView.tsx` catches that and shows an inline alert: *"We can't add more social accounts right now — our publishing service has hit its profile limit. Please contact support."* (User-facing message; you as admin will see the real reason in logs.)
- We also log it loudly in the edge function so you see it in Supabase function logs immediately.

For *you* (admin) we add one more thing: an admin-only edge function `upload-post-admin-slot-status` that calls `GET /api/uploadposts/users` and returns `{ used: N, limit: 5, profiles: [...], orphans: [...] }` where `orphans` = upstream profiles whose username doesn't match any row in our `upload_post_profiles`. This is the *correct* form of "monitoring" — on-demand, authoritative, and actionable. No cron needed.

Surface it in `ConnectionsView` for admins only, with a "Refresh slot status" button. This gives you the visibility you asked for without building a polling system that will drift.

### 5. Optional cleanup helper (admin only)

Add `upload-post-admin-prune` (admin-gated) that deletes a specific upstream profile by username via Upload-Post's delete endpoint, and clears the corresponding DB row to `pending`. Lets you reclaim slots from the same UI when needed.

### 6. Repair existing broken account (yours)

Once Step 2 ships, your next click on Connect TikTok will auto-recreate `flurrafea759f7335545c8b1875e1dcd5ca038` upstream and proceed. No manual SQL needed.

## Files touched

- `supabase/migrations/<new>.sql` — update `handle_new_user` to drop the `pg_net` call; keep the row insert. Add `'limit_reached'` as an allowed status (it's a free text column today, so no enum change required, just documentation).
- `supabase/functions/upload-post-generate-link/index.ts` — add the GET-then-heal flow; map `PROFILE_LIMIT_REACHED` to a 409 with structured body.
- `supabase/functions/upload-post-create-profile/index.ts` — set `provisioning_status = 'limit_reached'` on 403, keep `error` for everything else.
- `supabase/functions/upload-post-admin-slot-status/index.ts` — new, admin-gated, returns slot usage + orphans.
- `supabase/functions/upload-post-admin-prune/index.ts` — new, admin-gated, deletes one upstream profile.
- `supabase/config.toml` — register the two new functions (default `verify_jwt = false`, but they validate admin role in code).
- `src/components/settings/ConnectionsView.tsx` — handle `PROFILE_LIMIT_REACHED` toast/banner; admin-only slot status panel + prune buttons.
- `src/hooks/useUploadPostProfile.ts` — add `useUploadPostSlotStatus()` and `usePruneUploadPostProfile()` hooks.

## What I am explicitly NOT doing and why

- **No cron-based slot monitor.** Drifts from reality, adds infra, fires alerts after the fact. The on-demand admin endpoint is strictly better.
- **No retry queue for failed signups.** Lazy provisioning makes this moot.
- **No automatic deletion of "old" profiles to make room.** Too easy to delete a profile a real user is about to use. Pruning stays manual and admin-driven.
- **No change to the `upload-post-sync-profile` cadence.** It's fine as-is; it only refreshes the connected_platforms cache for already-existing profiles.

## Verification after deploy

1. You click Connect TikTok → flow auto-heals your missing profile → TikTok OAuth opens → you connect → done.
2. Open admin slot panel → confirm `used: 1, limit: 5` (since you said you cleared the others).
3. Sign up a brand-new test user → confirm `upload_post_profiles` row is `pending` and **no** Upload-Post API call happened (check function logs).
4. As that test user, click Connect on any platform → confirm profile is created on demand and Connect succeeds.
