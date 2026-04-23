

## Plan: Native connections for LinkedIn + Reddit

Build the same Native pattern we shipped for YouTube, twice — for LinkedIn and Reddit. Each platform gets its own OAuth connection, encrypted token storage, submit edge function, ScheduleDialog toggle, and Connections UI card. Upload-Post stays as the fallback.

### Architecture (per platform)

```
DB:        <platform>_connections           encrypted refresh token + account metadata
           social_content.<platform>_via    'native' | null
           social_content.<platform>_native_status / _native_post_id / _native_error_detail
           posted_content mirror

Edge fns:  <platform>-native-oauth-start     build auth URL, signed state
           <platform>-native-oauth-callback  exchange code, encrypt + store
           <platform>-native-disconnect      delete row
           <platform>-native-submit          post via platform API

Frontend:  src/hooks/use<Platform>NativeConnection.ts
           Card in ConnectionsView "Native (beta)" section
           Toggle in ScheduleDialog when platform is selected + connected

Routing:   post-scheduled-content + usePostNow:
           - <platform>_via === 'native' → invoke <platform>-native-submit
           - else → include in upload-post-submit batch
```

### Per-platform specifics

**LinkedIn** — personal profile posts only (Pages need Marketing Developer Platform review)
- OAuth 2.0 auth code, scopes: `openid profile email w_member_social`
- Uses LinkedIn UGC Posts API: `POST /v2/ugcPosts`
- Video flow: register asset (`POST /v2/assets?action=registerUpload`) → stream from R2 to returned upload URL via Fly worker → create UGC post referencing the asset URN
- Image-only / text-only flows handled inline in the edge function (no Fly worker needed)
- Stores `member_urn` (LinkedIn person URN, e.g. `urn:li:person:abc123`) returned from `/v2/userinfo`

**Reddit** — OAuth 2.0 web app
- Scopes: `identity submit read`
- Endpoint: `POST /api/submit` with `kind=link` (we always have a video URL); for video posts use `kind=video` with `video_poster_url`
- Per-Reddit requirement: User-Agent header `flurra/1.0 (by /u/<handle>)`
- User picks default subreddit during connect; per-post override available in ScheduleDialog
- No Fly worker needed — Reddit pulls media from the URL we provide (signed R2 URL)

### Database migration (single migration)

```sql
create table public.linkedin_connections (
  user_id uuid primary key,
  refresh_token_encrypted text not null,
  access_token text,
  access_token_expires_at timestamptz,
  member_urn text,                  -- e.g. urn:li:person:...
  account_email text,
  account_name text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reddit_connections (
  user_id uuid primary key,
  refresh_token_encrypted text not null,
  access_token text,
  access_token_expires_at timestamptz,
  reddit_username text,
  default_subreddit text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: users select own / admins full access (same as youtube_connections)

alter table public.social_content
  add column linkedin_via text,
  add column linkedin_native_status text,
  add column linkedin_native_post_urn text,
  add column linkedin_native_error_detail text,
  add column reddit_via text,
  add column reddit_native_status text,
  add column reddit_native_post_id text,
  add column reddit_native_error_detail text,
  add column reddit_subreddit text;          -- per-post override

-- mirror onto posted_content
```

### Files to create / modify

**New (DB):**
- `supabase/migrations/<ts>_native_linkedin_reddit.sql`

**New (edge functions — 8 total):**
- `supabase/functions/linkedin-native-oauth-start/index.ts`
- `supabase/functions/linkedin-native-oauth-callback/index.ts`
- `supabase/functions/linkedin-native-disconnect/index.ts`
- `supabase/functions/linkedin-native-submit/index.ts`
- `supabase/functions/reddit-native-oauth-start/index.ts`
- `supabase/functions/reddit-native-oauth-callback/index.ts`
- `supabase/functions/reddit-native-disconnect/index.ts`
- `supabase/functions/reddit-native-submit/index.ts`

**New (frontend):**
- `src/hooks/useLinkedinNativeConnection.ts`
- `src/hooks/useRedditNativeConnection.ts`
- `src/components/connections/RedditSubredditPicker.tsx` (used in Connect dialog + ScheduleDialog)

**Modified:**
- `supabase/config.toml` — add 6 `verify_jwt = false` blocks (oauth-start/callback/disconnect for both); submit functions keep JWT-on
- `src/components/settings/ConnectionsView.tsx` — add LinkedIn + Reddit cards in Native section; add subtitle to Upload-Post LinkedIn card mentioning Native option
- `src/components/schedule/ScheduleDialog.tsx` — render `linkedin_via` toggle when LinkedIn selected + connected; render `reddit_via` toggle + subreddit picker when Reddit selected + connected
- `src/hooks/useSchedule.ts` — pass `linkedin_via`, `reddit_via`, `reddit_subreddit` through schedule mutation
- `supabase/functions/post-scheduled-content/index.ts` — extend router to handle linkedin/reddit native paths alongside YouTube
- `supabase/functions/upload-post-submit/index.ts` — already accepts platforms filter from prior YouTube refactor; add linkedin/reddit to the exclusion list when they're going native
- Fly worker (existing repo) — add `/upload-linkedin` endpoint for LinkedIn video asset streaming

### Secrets needed

I'll request these via the secret form once you approve:
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`

Reuses existing `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY` for token encryption.

### OAuth app setup (you do this in their developer portals)

**LinkedIn** — https://www.linkedin.com/developers/apps
- Create app, request **Sign In with LinkedIn using OpenID Connect** + **Share on LinkedIn** products
- Redirect URI: `https://fjyhehtzryybbpuxqqdo.supabase.co/functions/v1/linkedin-native-oauth-callback`

**Reddit** — https://www.reddit.com/prefs/apps
- Create "web app" type
- Redirect URI: `https://fjyhehtzryybbpuxqqdo.supabase.co/functions/v1/reddit-native-oauth-callback`

### Build order (one platform per batch — pause between for testing)

1. **Batch 1 — DB migration** (both tables + columns + RLS)
2. **Batch 2 — LinkedIn end-to-end** (4 edge fns + hook + ConnectionsView card + ScheduleDialog toggle + Fly worker `/upload-linkedin` endpoint + post-scheduled-content routing)
3. **Batch 3 — Reddit end-to-end** (4 edge fns + hook + subreddit picker + ConnectionsView card + ScheduleDialog toggle + post-scheduled-content routing)

### Stopping point

After all 3 batches: 3 native platforms total (YouTube + LinkedIn + Reddit), each individually toggleable per post, with Upload-Post as universal fallback.

