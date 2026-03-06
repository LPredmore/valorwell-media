

## Fix Publer Auth and Resend Failed Posts

### Problem
The Publer API requires `Authorization: Bearer-API <key>` but the code sends `Authorization: Bearer <key>`, causing 401 errors on every TikTok post attempt.

### Changes

#### 1. Update the Publer API key secret
Use the secrets tool to let you replace the `PUBLER_API_KEY` value with a fresh/correct key.

#### 2. Fix the authorization header in `post-scheduled-content/index.ts`
Change line 42 from:
```
"Authorization": `Bearer ${apiKey}`,
```
to:
```
"Authorization": `Bearer-API ${apiKey}`,
```

Same fix on line 55 (the polling header).

#### 3. Resend the failed Shorts
Query `posted_content` for rows where `tiktok_status = 'failed'`, then invoke `post-scheduled-content` for each one (or manually trigger re-posting). Since the content is already in `posted_content` and `social_content` is marked as `posted`, we will need to either:
- Update the edge function to accept a `repost_tiktok` flag that re-runs just the Publer flow for an already-posted item, or
- Reset those rows in `social_content` back to `scheduled` and let the cron pick them up again.

The simpler approach: add a small code path in the edge function that, given a `source_content_id`, fetches from `posted_content`, grabs the video signed URL, and re-attempts the Publer publish, updating `tiktok_status`/`tiktok_error` on completion.

