

## Plan: Add Reddit + Bluesky to Connections (full Upload-Post platform list)

### What's missing
Upload-Post supports **10 platforms** total. Our app currently lists 8 — missing **Reddit** and **Bluesky**.

### Changes

**1. `src/hooks/useUploadPostProfile.ts`**
Extend `ALL_PLATFORMS` to include the two new keys:
```ts
export const ALL_PLATFORMS = [
  "tiktok", "instagram", "youtube", "linkedin",
  "facebook", "x", "threads", "pinterest",
  "reddit", "bluesky",
] as const;
```

**2. `src/components/settings/ConnectionsView.tsx`**
Add `reddit` and `bluesky` entries to `PLATFORM_META`:
- **Reddit** — icon: a Reddit-style mark. Since `lucide-react` doesn't ship a Reddit icon, use the `MessageCircle` icon (or import a small inline SVG) styled with Reddit orange (`text-[#FF4500]`). Description: "Share posts and videos to your Reddit communities."
- **Bluesky** — icon: `Cloud` from lucide (closest available metaphor for the Bluesky butterfly/sky brand) styled with Bluesky blue (`text-[#0085FF]`). Description: "Post short updates and media to your Bluesky account."

The existing render loop already iterates `ALL_PLATFORMS`, so both new platforms automatically get a Connect button, hosted-OAuth flow, connected handle, and Manage button — no view logic changes needed.

**3. `src/lib/platforms.ts`**
Append to `PLATFORM_LABELS` so any badge / label lookup elsewhere (Schedule dialog, status pills) shows the proper name:
```ts
reddit: "Reddit",
bluesky: "Bluesky",
```

**4. `src/components/schedule/ScheduleDialog.tsx`**
No code change needed — it already filters platform checkboxes off `connected_platforms` returned by Upload-Post, so Reddit and Bluesky will appear automatically once a user connects them.

### Backend
No DB migration, no edge function changes, no new secrets. Upload-Post's `generate-link` and `submit` endpoints already accept `reddit` and `bluesky` as valid `platform` values — we just expose them in the UI.

### Memory update
Update `mem://integrations/upload-post-architecture.md` to reflect 10 platforms (add reddit, bluesky to the list under "Connection UX").

### Files touched
- `src/hooks/useUploadPostProfile.ts` (1 line in array)
- `src/components/settings/ConnectionsView.tsx` (2 entries in `PLATFORM_META` + import 2 icons)
- `src/lib/platforms.ts` (2 lines in `PLATFORM_LABELS`)
- `.lovable/memory/integrations/upload-post-architecture.md` (platform count)

