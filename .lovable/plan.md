

# Add Google Sign-In to Login Page and Fix YouTube Connection

## What this does
Adds a "Sign in with Google" button on the login page so users can log in with their Google account, and ensures the YouTube connection flow on Settings works correctly.

## Changes

### 1. Update Login Page (`src/pages/Login.tsx`)
- Add a "Sign in with Google" button below the existing email/password form
- Add a visual divider ("or") between the two login methods
- The Google sign-in button will call `supabase.auth.signInWithOAuth({ provider: "google" })` with `redirectTo` set to the app's origin (so after Google login, the user lands back in the app)
- Fix the existing redirect from `/jobs` to `/content` (line 18 and 30 currently navigate to `/jobs`)

### 2. Update Settings Page (`src/pages/Settings.tsx`)
- The "Connect YouTube Account" button already calls `signInWithOAuth` with YouTube scopes and `redirectTo` pointing to `/settings` -- this should now work with the corrected Supabase URL configuration
- No code changes needed here, but we will verify the redirect URL uses `window.location.origin` correctly

## Important Notes
- The **Supabase OAuth Server** you enabled is unrelated to Google sign-in. It's for making your Supabase project act as an identity provider for other apps. It won't cause issues, but it's not needed for this feature.
- Since your Site URL and Redirect URLs are now configured correctly, both Google login and the YouTube connection flow should work.

## Technical Details

### Login.tsx changes:
- Import Google icon (using a simple SVG inline or from lucide)
- Add `handleGoogleLogin` function that calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/content" } })`
- Add a separator and Google button to the JSX
- Fix navigation targets from `/jobs` to `/content`

### No database changes needed
Google OAuth users will automatically get entries in `auth.users` via Supabase Auth.

