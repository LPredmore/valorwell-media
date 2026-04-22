

## Plan: Strip the connect flow down to the bare minimum

The whole `ConnectFlowDialog` was over-engineered for debugging. Now that we know the popup approach works and the Diagnostics panel exists separately for inspection, the dialog adds nothing — it just sits there showing "done / Sync complete" while the real action happens in the popup window.

### What it'll do instead

1. **Click "Connect YouTube"** → we generate the link (existing behavior).
2. **Open the popup directly** — no dialog, no modal. Toast: `"Opening YouTube connection…"`
3. **Poll for popup close** in the background (no UI).
4. **On close** → run sync silently → toast either:
   - `"YouTube connected as @valorwell"` (success), or
   - `"YouTube didn't connect"` with a "View diagnostics" action button that opens the Diagnostics panel.
5. **If popup is blocked** → toast: `"Popup blocked — allow popups and try again"` with a "Retry" action.

That's it. No giant modal, no event log overlay, no off-screen "Sync complete" card.

### Files changed

- **`src/components/connections/ConnectFlowDialog.tsx`** — delete the file entirely.
- **`src/components/settings/ConnectionsView.tsx`**:
  - Remove the `ConnectFlowDialog` import and JSX.
  - Replace `connectDialog` state with a single `pollingRef` for the active popup.
  - `handleConnect` opens `window.open` directly with sized popup geometry, starts a poll loop, and on close runs the sync + result toast.
  - Keep the existing Diagnostics panel as-is (it's already good).
  - Keep the existing `?synced=1` URL handler (covers the rare full-redirect case).

### What stays the same

- Diagnostics panel (collapsible, shows raw provider state)
- All edge functions, hooks, database, sync logic
- The popup window itself (still `app.upload-post.com/connect?token=…`)

### Result

Click connect → popup opens → user authorizes → popup closes → toast confirms outcome. No leftover dialog, no off-screen sync card, no event log clutter. If something fails, the toast offers a one-click jump to Diagnostics.

