

# YouTube Account Connection via Supabase Google Auth

## Overview
Leverage the existing Google sign-in flow to also capture YouTube permissions, eliminating the need for a separate OAuth flow. The user re-authenticates once with expanded scopes, we capture and store the refresh token, and the publish function uses it.

## How It Works

1. User clicks "Connect YouTube" on a new Settings page
2. App triggers a Google re-auth with additional YouTube scopes and forced consent
3. On return, the app captures the `provider_refresh_token` from the Supabase session
4. Token is stored in a `youtube_connections` table tied to the user
5. The `publish-youtube` edge function reads from this table instead of environment secrets

## Steps

### Step 1: Add YouTube scopes to Google provider
In the Supabase dashboard (Authentication > Providers > Google), add these scopes:
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/userinfo.email`

### Step 2: Database -- new `youtube_connections` table
Create a table to store per-user YouTube credentials:
- `id` (UUID, primary key)
- `user_id` (UUID, unique, not null)
- `google_email` (text)
- `channel_id` (text)
- `channel_title` (text)
- `refresh_token` (text, not null)
- `created_at`, `updated_at` (timestamps)
- RLS policies: users can only read/update/delete their own row

### Step 3: Build a Settings page (`/settings`)
- Add a "Settings" nav link in `AppLayout.tsx`
- New page with a "YouTube Connection" card:
  - **Not connected state**: "Connect YouTube Account" button
  - **Connected state**: Shows email, channel name, disconnect button
- The "Connect" button calls `supabase.auth.signInWithOAuth` with:
  - `provider: 'google'`
  - `options.scopes`: the YouTube scopes listed above
  - `options.queryParams: { access_type: 'offline', prompt: 'consent' }` (forces refresh token)
  - `options.redirectTo`: back to `/settings`

### Step 4: Capture the token on redirect
- On the Settings page mount, check the session for `provider_token` and `provider_refresh_token`
- If present, call a new edge function `youtube-save-connection` that:
  - Validates the user's auth
  - Uses the provider token to fetch Google email and YouTube channel info
  - Stores the refresh token and channel metadata in `youtube_connections`

### Step 5: New edge function -- `youtube-save-connection`
- Accepts `{ providerToken, providerRefreshToken }` in the body
- Uses `providerToken` to call Google userinfo and YouTube channels API
- Upserts into `youtube_connections` for the authenticated user
- Returns the channel info for display

### Step 6: Update `publish-youtube` edge function
- Instead of reading `GOOGLE_OAUTH_REFRESH_TOKEN` from env, query `youtube_connections` for the content owner's `refresh_token`
- Fall back to env secret if no per-user connection exists (backward compatibility)

### Step 7: Update routing
- Add `/settings` route in `App.tsx` wrapped in `AuthGuard`

## Technical Notes
- The `provider_refresh_token` is only available when `prompt=consent` is used, which forces Google to re-issue it
- The refresh token is stored server-side in the database, never exposed to the client after initial capture
- The existing global `GOOGLE_OAUTH_REFRESH_TOKEN` secret remains as a fallback
- The `google-account-info` diagnostic function can be removed or repurposed once this is live

