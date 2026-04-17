

# Phase 1b: Per-User YouTube Publishing — Definitive Plan

## The decision

**Build `youtube-get-access-token` as the single source of truth for YouTube access tokens. No global fallback. Reuse the existing `SERVICE_ROLE_KEY` for Fly.io→Lovable auth. Cut over Fly.io in the same window as the Lovable deploy.**

### Why this is right (not why you'll like it)

1. **No global fallback = no silent cross-tenant data leaks.** A fallback to `GOOGLE_OAUTH_REFRESH_TOKEN` means a misconfigured user's video uploads to *your* admin channel. That's a worse failure than a clear "not connected" error. Fail loud, fail safe.

2. **Reuse `SERVICE_ROLE_KEY`, don't mint a new one.** You said this token endpoint is the only Fly.io→Lovable call. A dedicated key adds rotation surface for zero benefit. Service role is already in Fly.io's env (it's how Fly currently reads `social_content`). One key, one rotation point.

3. **Same-window cutover, not staged.** A staged cutover means Fly.io keeps using the global token — meaning new tenants who connect their own account would *still* upload to your channel until step 2 lands. The "safety" of staging is illusory; it just extends the window of incorrect behavior. Cut over both sides together.

4. **Token resolver takes `contentId`, not `userId`.** Fly.io already has the `social_content` row in hand. Passing `contentId` lets the edge function do the user lookup server-side, which means Fly.io can never accidentally pass the wrong user_id (e.g., from a stale row). Single-trip, server-validated.

---

## Risk mitigations (mapped to the audit)

| Risk | Mitigation |
|---|---|
| Admin not connected → all queued uploads fail | **Pre-flight gate**: I'll provide the SQL check. Cutover blocked until it returns a row. |
| Token refresh fails mid-flight | Edge function returns typed errors (`no_connection`, `refresh_failed`, `invalid_grant`). Fly.io maps each to a specific `youtube_error_detail` so the user sees actionable text. |
| User schedules without connection | UI guard in `ScheduleDialog` (disable + banner) + page-level banner on `/schedule`. Server-side enforcement isn't needed because the upload will simply fail-and-mark, but UX should prevent the dead-end. |
| `google-account-info` still uses global token (Settings page) | Rewrite to per-user. Drop global branch. |
| Dead `publish-youtube` config entry | Remove from `config.toml`. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` lingering | Keep secret in Supabase for 1 week post-cutover as recovery hatch. Then delete. Document in plan. |
| Stuck-in-`uploading` rows from cutover | Existing `reset_stuck_youtube_uploads(30)` function handles this. No new work. |
| Fly.io `youtube-uploader-service` calls `kick_youtube_run_due` cron — needs new behavior | Cron stays the same. Only the per-row upload step inside Fly.io changes. |
| New users with no connection get queued items | Schedule trigger `enforce_youtube_schedule_requirements` doesn't check connection. Add a pre-insert check OR rely on UI guard + graceful Fly failure. **Decision: UI guard only.** Server-side check would require coupling `social_content` writes to `youtube_connections` reads, which complicates RLS and adds a query to every schedule. Failed uploads are already first-class state. |

---

## Implementation

### 1. New edge function: `youtube-get-access-token`

```text
POST /functions/v1/youtube-get-access-token
Auth: Bearer <SERVICE_ROLE_KEY>
Body: { contentId: string }

Returns 200: { accessToken, channelId, channelTitle, userId }
Returns 404: { error: "no_connection", userId }
Returns 401: { error: "refresh_failed", detail: string }
Returns 400: { error: "invalid_request" }
Returns 403: { error: "unauthorized" }  // wrong service key
```

Logic:
1. Validate `Authorization: Bearer <SERVICE_ROLE_KEY>` (constant-time compare against `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`)
2. Validate body with Zod (`contentId` UUID)
3. Service-role client: `social_content.select('user_id').eq('id', contentId).single()`
4. Service-role client: `youtube_connections.select('refresh_token, channel_id, channel_title').eq('user_id', userId).single()`
5. POST to `https://oauth2.googleapis.com/token` with `refresh_token` grant
6. Return access token + channel metadata
7. **No fallback to `GOOGLE_OAUTH_REFRESH_TOKEN`.** Period.

### 2. Rewrite `google-account-info`

Replace global-token flow with: validate caller JWT → look up `youtube_connections` for `auth.uid()` → return their `google_email`, `channel_title`, `channel_id`. Used by Settings page display.

### 3. UI changes

**New hook** `src/hooks/useYouTubeConnection.ts`:
- Returns `{ connection, isLoading, isConnected }` for current user
- Used by ScheduleDialog + Schedule banner + (eventually) elsewhere

**`src/components/schedule/ScheduleDialog.tsx`**:
- If `!isConnected`, show inline alert: "Connect your YouTube account to schedule posts" + button linking to `/connections`
- Disable confirm button

**`src/pages/Schedule.tsx`**:
- Top dismissible alert when `!isConnected`: "Connect your YouTube account to start posting → [Connect]"
- Use `sessionStorage` for dismissal (re-shows next session — this matters)

### 4. Cleanup

- Remove `[functions.publish-youtube]` block from `supabase/config.toml`
- Add `[functions.youtube-get-access-token]` with `verify_jwt = false` (we validate the service role key in code)

### 5. Fly.io diff (you apply manually)

I'll provide the precise diff after Lovable side ships. Summary of what it does:
- Remove `GOOGLE_OAUTH_REFRESH_TOKEN` env var usage
- Before each upload: `POST $LOVABLE_URL/functions/v1/youtube-get-access-token` with `Bearer $SUPABASE_SERVICE_ROLE_KEY` + `{ contentId: row.id }`
- Map response:
  - `200` → use `accessToken` for upload
  - `404 no_connection` → `youtube_status='failed'`, `youtube_error_detail='No YouTube account connected. Reconnect at /connections.'`
  - `401 refresh_failed` → `youtube_status='failed'`, `youtube_error_detail='YouTube authorization expired. Reconnect at /connections.'`
  - `5xx` → leave `queued`, retry on next cron tick (existing behavior)

---

## Cutover sequence (strict order)

1. **Pre-flight SQL** (you run): verify admin has `youtube_connections` row
   ```sql
   SELECT yc.user_id, yc.google_email, yc.channel_title, yc.created_at
   FROM youtube_connections yc
   WHERE yc.user_id IN (SELECT user_id FROM user_roles WHERE role='admin');
   ```
   Must return ≥1 row before proceeding. **If empty, connect at `/connections` first.**

2. **Deploy Lovable changes** (auto on save): edge functions + UI guards live. Fly.io still uses global token — uploads keep working.

3. **Smoke test**: call `youtube-get-access-token` via curl with a known contentId. Confirm 200 + valid token. Confirm `google-account-info` returns admin's channel.

4. **Update Fly.io service**: apply diff, deploy. Now per-user is live.

5. **Verify**: schedule a test post owned by admin. Watch it upload to admin's channel via the new path.

6. **+7 days**: delete `GOOGLE_OAUTH_REFRESH_TOKEN` Supabase secret.

---

## Files changing

| File | Change |
|---|---|
| `supabase/functions/youtube-get-access-token/index.ts` | **New** |
| `supabase/functions/google-account-info/index.ts` | Rewrite for per-user |
| `supabase/config.toml` | Add new function entry, remove dead `publish-youtube` |
| `src/hooks/useYouTubeConnection.ts` | **New** |
| `src/components/schedule/ScheduleDialog.tsx` | Connection guard |
| `src/pages/Schedule.tsx` | Connection banner |

No DB migration needed — schema already supports this.

## Out of scope (Phase 1c, separate)

- Login page "Sign up" link
- Drop legacy `content_instructions` table
- Per-user `platform_instructions`

