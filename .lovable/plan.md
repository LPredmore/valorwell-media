

# Plan: Notify Make.com on `posted_content` INSERT

## Context

The `post-scheduled-content` Edge Function already inserts rows into `posted_content` with signed R2 URLs (`video_url`, `image_url`) and all platform captions (`ig_tiktok_desc`, `facebook_desc`, etc.). Make.com has a webhook (`MAKE_WEBHOOK_URL` secret) already configured. The goal is to notify Make.com automatically when content lands in `posted_content` so it can post to Instagram (and potentially other platforms).

## Technical Decision: Edge Function called by DB trigger (not a direct `net.http_post` from the trigger)

The existing `notify_make_youtube_published` trigger already uses this exact pattern: a PL/pgSQL trigger calls `net.http_post` to invoke a Supabase Edge Function, which then does the real work. However, that pattern has a flaw for this use case: **the trigger fires inside the INSERT transaction, but `net.http_post` (via `pg_net`) is asynchronous and fires after commit** -- which is actually fine for delivery. The real issue is that calling Make.com's webhook directly from PL/pgSQL via `pg_net` means the database is directly coupled to an external third-party URL, and you lose the ability to add logic (e.g., filtering by platform, retry logic, logging).

The correct approach: **Add the Make.com webhook call directly into the `post-scheduled-content` Edge Function, immediately after the successful INSERT into `posted_content`.** Here is why:

1. **The Edge Function already has the data.** It just built the `posted_content` row with signed URLs, captions, and metadata. Sending it to Make.com from here requires zero additional queries -- the data is already in memory.

2. **No new infrastructure.** No new trigger, no new Edge Function, no new `pg_net` dependency. One HTTP call added to existing code.

3. **The signed URLs are fresh.** The `video_url` and `image_url` were just generated seconds ago. If you used a DB trigger instead, the trigger would need to read the row back from the table, and the URLs are already there -- but it's an unnecessary extra query when the Edge Function already has them.

4. **Error isolation.** If the Make.com webhook fails, the content is still safely in `posted_content`. The Edge Function can log the failure without rolling back the insert. A DB trigger calling `net.http_post` gives you no error feedback at all (it's fire-and-forget).

5. **Filtering.** Not all posted content needs to go to Make.com. YouTube Long-form is handled by Fly.io. The Edge Function already knows the `post_length` and `scheduled_platforms`, so it can conditionally skip the webhook call. A DB trigger would need to duplicate this logic in PL/pgSQL.

A DB trigger would be the right choice if content entered `posted_content` from multiple code paths. But it doesn't -- `post-scheduled-content` is the single gateway. One code path, one place to add the webhook call.

## Changes

### 1. Modify `post-scheduled-content/index.ts`

After the successful INSERT into `posted_content` (and before the status UPDATE on `social_content`), add a `fetch()` call to `MAKE_WEBHOOK_URL` with the row data:

```typescript
// After successful insert, notify Make.com
const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
if (makeWebhookUrl) {
  try {
    const webhookPayload = {
      source_content_id: row.id,
      topic: row.topic,
      post_title: row.post_title,
      post_length: row.post_length,
      video_url: videoUrl,
      image_url: imageUrl,
      ig_tiktok_desc: row.ig_tiktok_desc,
      facebook_desc: row.facebook_desc,
      linkedin_desc: row.linkedin_desc,
      youtube_desc: row.youtube_desc,
      youtube_video_id: row.youtube_video_id,
      scheduled_platforms: row.scheduled_platforms,
      posted_at: now,
    };

    const makeResp = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });

    if (!makeResp.ok) {
      console.error(`Make.com webhook failed for ${row.id}: ${makeResp.status}`);
    }
  } catch (makeErr) {
    console.error(`Make.com webhook error for ${row.id}:`, makeErr);
  }
}
```

Key details:
- The payload is a curated subset -- not the entire row. Make.com gets exactly what it needs: the signed URLs (valid for 1 hour), all platform-specific captions, and identifiers.
- The webhook call is wrapped in try/catch. A failure does **not** prevent the content from being marked as posted. This is intentional -- Make.com is a downstream consumer, not a gatekeeper.
- No filtering by `post_length` or `scheduled_platforms` yet. Make.com receives all posted content and can filter internally. If you want server-side filtering later (e.g., only send Shorts to Make.com), it's a one-line `if` guard around this block.

### 2. No database changes

No new triggers, functions, or columns needed.

### 3. No new Edge Functions

Everything stays in the existing `post-scheduled-content` function.

## What Make.com Receives

The webhook POST body will look like:

```json
{
  "source_content_id": "uuid",
  "topic": "Video Topic Name",
  "post_title": "The YouTube/Display Title",
  "post_length": "Short",
  "video_url": "https://r2-signed-url...(valid 1hr)",
  "image_url": "https://r2-signed-url...(valid 1hr)",
  "ig_tiktok_desc": "Caption for Instagram...",
  "facebook_desc": "Caption for Facebook...",
  "linkedin_desc": "Caption for LinkedIn...",
  "youtube_desc": "Description for YouTube...",
  "youtube_video_id": "dQw4w9WgXcQ",
  "scheduled_platforms": ["YouTube", "Instagram"],
  "posted_at": "2026-03-06T12:00:00.000Z"
}
```

Make.com can then route by `post_length` or `scheduled_platforms` to decide which modules to trigger (Instagram Reels, Facebook, etc.).

## Summary

| Location | Change |
|---|---|
| `post-scheduled-content/index.ts` | Add `fetch()` to `MAKE_WEBHOOK_URL` after successful `posted_content` INSERT |

One file, one block of code, zero new infrastructure.

