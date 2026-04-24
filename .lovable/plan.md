## What's wrong

The Schedule Post dialog only looks at the Upload-Post profile's `connected_platforms` map to decide which platforms exist. For `info+pendulo@bestselfs.com`, that map is empty (`{}`), so the dialog shows:

- "No social accounts connected yet" banner
- "No connected platforms." under Platforms

…even though that user has a working **native YouTube** connection (`youtube_connections` row for channel `Pendulo / @getpendulo`).

The native YouTube connection is a completely separate integration from Upload-Post and is fetched by `useYoutubeNativeConnection`, but `ScheduleDialog` never folds it into the connected-platform list. So users who only have native YouTube connected (or whose Upload-Post profile is empty) get blocked from scheduling.

## Fix

Treat native YouTube as a first-class connected platform in the schedule dialog, alongside Upload-Post platforms.

### Behavior after the fix

- If the user has **only native YouTube** connected:
  - Banner "No social accounts connected yet" disappears.
  - Platforms section shows YouTube as a checkbox (selected by default).
  - The "Post YouTube via Native (beta)" toggle appears, defaulted **on** (since that's the only available path).
  - Confirm becomes enabled once a date/time is picked.
- If the user has **Upload-Post platforms + native YouTube**:
  - YouTube appears once (deduped). The native toggle still controls which path is used.
- If the user has **only Upload-Post platforms**: behavior unchanged.
- If the user has **nothing connected**: behavior unchanged (banner + disabled confirm).

### Files to edit

- `src/components/schedule/ScheduleDialog.tsx`
  - Compute `connectedPlatforms` as the **union** of:
    - Upload-Post platforms from `isPlatformConnected(profile.connected_platforms, p)`, AND
    - `"youtube"` if `useYoutubeNativeConnection()` returns a row.
  - Recompute `noConnections` against that combined list.
  - When defaulting platform selection on open, include YouTube from native too.
  - When the user has YouTube selected and native is the only YouTube path available (no Upload-Post YouTube), default the native toggle to `on` and keep showing it.
- No backend or schema changes. No changes to the submit pipeline — `post-scheduled-content` already routes `youtube_via === "native"` to `youtube-native-submit` and the rest to `upload-post-submit`, so this just unblocks the UI.

## Out of scope

- Showing native YouTube on the Settings → Connections page (it already lives there via its own card).
- Any change to how posts are actually published.
- Any change to Upload-Post sync / provisioning.

## How to verify after shipping

1. Sign in as `info+pendulo@bestselfs.com`.
2. Open Schedule on any unscheduled item.
3. Expect: no red "no accounts" banner, YouTube visible and checked under Platforms, native toggle visible and on, Confirm enables once date/time is picked.
4. On an account with both Upload-Post YouTube and native YouTube: YouTube appears exactly once and the native toggle still flips between paths.
