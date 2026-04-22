

## Plan: Skip the iframe, go straight to popup

The CSP header from Upload-Post is `frame-ancestors 'self' https://*.upload-post.com https://upload-post.com`. That's an explicit allowlist — Lovable/getflurra origins are not on it and never will be unless Upload-Post adds us. No iframe trick (sandbox attrs, referrer policy, etc.) can bypass a server-sent CSP. The browser blocks the frame before any of our JS runs.

So the iframe attempt is dead weight. It just shows a `chrome-error://chromewebdata/` page for 4 seconds before our timeout fires the popup fallback. Let's remove the iframe path entirely and lean into the popup, which is what every OAuth provider expects anyway.

### Changes to `src/components/connections/ConnectFlowDialog.tsx`

1. **Remove iframe rendering and the 4-second timeout**. Drop `mode === "iframe"` entirely; the dialog always uses popup mode.
2. **Open the popup immediately when the dialog opens** with a valid URL (inside the same click-derived effect so popup blockers don't fire — we'll still surface a "Re-open popup" button if blocked).
3. **Replace the left panel** with a clear status card:
   - "Connection window opened — complete the flow there."
   - Live status: `opened` → `in progress` → `closed` → `syncing` → `result`
   - "Re-open popup" + "Open in new tab" + "Copy URL" controls
4. **Keep the event log on the right** unchanged — it's the most useful part.
5. **Detect popup-block** properly: if `window.open` returns null OR the popup closes within ~500ms of opening, mark as blocked and prompt the user to click "Re-open popup" (now a user-gesture click, which usually clears the blocker).
6. **On popup close**, fire `onClosed?.()` (which already triggers sync in `ConnectionsView`) and append the sync result to the log so the user sees `"YouTube: connected as <handle>"` or `"YouTube: not connected — see Diagnostics for raw provider state"` right in the dialog.

### Changes to `src/components/settings/ConnectionsView.tsx`

- After `handleDialogClosed` runs the sync, also auto-open the **Diagnostics** panel and refetch when the result is "still not connected" — so the user immediately sees what Upload-Post's API says about the failed YouTube callback.

### What this gives you for the YouTube 401

- No more 4-second iframe-error stall.
- The popup loads `app.upload-post.com/connect?token=…` directly — same flow they designed for.
- When you finish (or the 401 happens) and the popup closes, we sync, log the outcome, and surface the raw provider state in Diagnostics so we can see *why* YouTube is still missing from `connected_platforms`.

### Files touched
- `src/components/connections/ConnectFlowDialog.tsx` — remove iframe, popup-only with status panel
- `src/components/settings/ConnectionsView.tsx` — auto-expand Diagnostics on failed sync

No edge function or DB changes.

