

# Fix: playlist_id Not Persisting to posted_content

## Root Cause

There are two code paths that move content from `social_content` to `posted_content`. Both have issues, but only one is the real culprit here.

### Path 1: "Post Now" (client-side) -- THE BUG
When a user picks a time that resolves to "now" in `UnscheduledTab`, the code calls `postNowMutation.mutate(selectedItem.id)`. Notice: **only the content ID is passed**. The `playlistId` selected in the dialog is silently discarded -- it never reaches the mutation. The mutation then fetches the row from `social_content` (where `playlist_id` is still `null` because it was never saved) and copies that null value into `posted_content`.

### Path 2: Cron-based posting (edge function) -- WORKS CORRECTLY
When content is scheduled for a future time, `useScheduleContent` correctly saves `playlist_id` to `social_content`. Later, the `post-scheduled-content` edge function copies all fields (including `playlist_id`) using `...rest` spread. This path is fine.

### Secondary Issue: RLS on posted_content
The `posted_content` table has **zero RLS policies**. The client-side insert in `usePostNow` uses the anon key, which means it silently fails or is blocked by default RLS enforcement. This is why the "Post Now" path is unreliable even beyond the missing `playlist_id`.

## Decision: Move All Posting Through the Edge Function

Rather than patching the client-side `usePostNow` hook and adding RLS policies to `posted_content`, the right decision is to **route all posting through the `post-scheduled-content` edge function**. Here's why:

1. **Single source of truth**: One code path for moving data between tables eliminates the class of bug where client and server logic diverge.
2. **No RLS needed on posted_content**: The edge function uses `SERVICE_ROLE_KEY`, bypassing RLS. The table stays locked down from direct client access, which is more secure.
3. **Consistency**: Whether a post happens via cron or via "Post Now", the exact same code runs.

## Implementation Steps

### Step 1: Update the edge function to support immediate posting

Modify `supabase/functions/post-scheduled-content/index.ts` to accept an optional `contentId` in the request body. When provided, it processes that single row immediately instead of scanning for overdue scheduled items.

```text
Request body: { "contentId": "uuid" }  (optional)

If contentId is present:
  - Fetch that specific row from social_content
  - Copy to posted_content (with all fields including playlist_id)
  - Update social_content status to "posted"

If contentId is absent:
  - Existing cron behavior (scan for overdue scheduled items)
```

### Step 2: Rewrite usePostNow to save playlist_id, then call the edge function

The updated `usePostNow` hook will:
1. Accept `{ contentId, playlistId }` instead of just `contentId`
2. First update `social_content` with the `playlist_id` and set status to `"scheduled"` with `scheduled_at` = now (so the edge function can pick it up)
3. Then invoke the `post-scheduled-content` edge function with `{ contentId }` to do the actual posting

This guarantees `playlist_id` is persisted on `social_content` before the copy happens.

### Step 3: Update UnscheduledTab to pass playlistId to the mutation

Change the `handleConfirm` callback in `UnscheduledTab.tsx` to pass `{ contentId: selectedItem.id, playlistId }` to `postNowMutation.mutate()` instead of just the ID string.

### Step 4: Add SELECT RLS policy to posted_content

Users currently read from `posted_content` in the Past tab via `usePostedContent`. This works only because RLS is not enforced (no policies = default deny, but it may be disabled on this table). To be correct and secure, add owner-based SELECT policy:

```sql
CREATE POLICY "Users can select own posted content"
  ON posted_content FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can select all posted content"
  ON posted_content FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
```

No INSERT/UPDATE/DELETE policies -- only the edge function (via service role) writes to this table.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/post-scheduled-content/index.ts` | Add optional `contentId` parameter for immediate single-row posting |
| `src/hooks/useSchedule.ts` | Rewrite `usePostNow` to accept `playlistId`, save to `social_content`, then invoke edge function |
| `src/components/schedule/UnscheduledTab.tsx` | Pass `playlistId` to `postNowMutation` |
| Database migration | Add SELECT RLS policies on `posted_content` |

