

## Plan: Make the Upload-Post connect flow visible & debuggable

Right now when you click "Connect YouTube", we open `https://app.upload-post.com/...` in a brand-new tab. Once you're over there, the browser has no link back to us — we can't see the network calls, the console errors, or which step actually failed. That's why the YouTube failure is so opaque.

There are three viable ways to get better visibility, in order from "lightest" to "fullest":

### Option A — Embed in a Lovable iframe modal (recommended primary)

Replace the `window.open(...)` call with an in-app dialog that loads the Upload-Post `access_url` inside an `<iframe>`. We control the surrounding chrome, so we can:

- Show the URL bar (read-only) so you always see exactly which Upload-Post page you're on
- Render a side panel with **live log streaming** of every relevant event:
  - When the iframe navigates (we can read `iframe.contentWindow.location.href` only on same-origin, but we *can* always observe `load` events and the `referrer` of the next request)
  - When our backend gets a callback ping
  - When the post-flow `?synced=1` lands back on Flurra
- Provide an "Open in new tab" escape hatch in case the provider blocks framing

**Important caveat:** Upload-Post may send `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors`, which would prevent embedding entirely. We won't know until we try. The plan handles that:

1. First render the iframe.
2. Attach a 4-second timeout — if the iframe never fires `load`, or if it loads to `about:blank`, we detect the framing block and automatically fall back to Option B.

### Option B — Popup window with `window.open` + a status channel

If iframing is blocked (likely for an OAuth provider), open the connect URL in a **sized popup window** instead of a new tab, and:

- Keep a polling loop on our side that checks `popup.closed` so we know exactly when the user finishes or bails
- Immediately fire `upload-post-sync-profile` on close and surface the result inline ("YouTube: connected" / "YouTube: failed — last error: …")
- Show a live activity log next to the popup with timestamped events: link generated, popup opened, popup closed, sync started, sync result

This is what most OAuth integrations do (Stripe Connect, Google sign-in popups, etc.). It gives a focused window the user can't lose, and our app stays "live" next to it.

### Option C — Server-side debug endpoint (the diagnostic boost)

Independent of A/B, add a small **debug-mode** for the connect flow that captures more from our side:

1. **`upload-post-generate-link`** — log the full request payload + the full Upload-Post response (including any error body) to `console`, viewable in edge function logs
2. **New edge function `upload-post-debug-status`** — calls Upload-Post's user info endpoint for the current user's profile and returns the raw response. We render this in a "Diagnostics" expandable section under each platform card so you can see what Upload-Post thinks the state is, even when its UI silently 401s
3. **In the ConnectionsView**, after a connect attempt, automatically call the debug endpoint and show:
   - Profile status from Upload-Post
   - List of connected platforms per Upload-Post (vs. our cache)
   - Most recent error timestamps if they expose any

### What we'll actually build (combined)

1. **`ConnectFlowDialog.tsx`** — new component. Tries iframe first, auto-falls back to sized popup if framing is blocked. Shows a live event log on the right.
2. **Update `ConnectionsView.tsx`** — `handleConnect` opens the dialog instead of `window.open`.
3. **`upload-post-generate-link`** — add verbose logging of request/response.
4. **`upload-post-debug-status`** (new edge function) — fetches `/api/uploadposts/users?username=...` from Upload-Post and returns the raw JSON. Render in a "Diagnostics" panel.
5. **Auto-sync on dialog close** — already works via `?synced=1`; we'll also trigger sync from the dialog's `onClose` so popup-mode works too.

### What this gives you for the YouTube failure

- You'll see the actual Upload-Post page in-app (or at minimum in a bounded popup) instead of losing your tab context
- The event log will show exactly when the 401 from `api.upload-post.com/api/youtube/callback` happens
- The debug panel will show what Upload-Post's own API says about your profile's YouTube connection state — which will tell us whether it's a YouTube-app config issue on their side, a JWT expiration, or something else

### What this does NOT change

- The underlying Upload-Post integration, the database schema, the existing sync flow, or any other platform connections. Pure observability/UX layer.

### Files touched
- `src/components/connections/ConnectFlowDialog.tsx` — **new**
- `src/components/settings/ConnectionsView.tsx` — wire up the dialog + diagnostics panel
- `src/hooks/useUploadPostProfile.ts` — add `useUploadPostDebugStatus` hook
- `supabase/functions/upload-post-generate-link/index.ts` — verbose logging
- `supabase/functions/upload-post-debug-status/index.ts` — **new**
- `supabase/config.toml` — register new function with `verify_jwt = true`

