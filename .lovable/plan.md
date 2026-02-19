
# Orphaned Multipart Upload Cleanup

## What the problem actually is

When a user starts a large video upload and closes the browser (or the upload fails after the `abort` call itself fails), the incomplete parts remain in R2. They accumulate storage charges and clutter, and there is currently no mechanism to clean them up.

There are two surfaces to this problem:

1. **In-session failures**: The `abort` action in the edge function handles these — if chunks fail after 3 retries, the client calls `abort`, which issues `AbortMultipartUpload` to R2. This path is already implemented and works when the browser is still open.

2. **Browser-closed / crash scenarios**: If the tab closes after `start` but before `complete` or `abort`, no cleanup call ever fires. The partial upload sits in R2 indefinitely.

---

## Decision: R2 Lifecycle Policy via S3 API (not a database tracking table)

The alternative approach would be to build a database table (`upload_sessions`) to track in-progress `uploadId` values, then run a Supabase cron job that periodically calls `abort` on stale sessions. That approach has serious problems:

- It requires a new table, a migration, RLS policies, and a scheduled edge function.
- The cron must call R2 for every stale entry, one by one.
- The database can get out of sync with R2 state.
- You are re-implementing something R2 already does natively.

The correct approach is the **S3 `PutBucketLifecycleConfiguration` API applied to the R2 bucket**. This is a single XML document sent once to R2 that instructs it to automatically abort any incomplete multipart upload after N days. R2's own documentation confirms it supports this API and notes that buckets have a default 7-day rule already, but the default is not guaranteed to be active on all buckets — explicitly setting it is definitive.

This is the right decision because:

- Zero runtime code. R2 enforces the rule internally at the storage layer.
- No database schema changes.
- No cron job to maintain.
- Idempotent: applying it again changes nothing.
- It is the industry-standard solution (AWS, GCS, and R2 all recommend this pattern).

---

## What the Cloudflare docs confirm

From R2's own lifecycle documentation:

> "Buckets have a default lifecycle rule to expire multipart uploads seven days after initiation."

And the S3 API example for R2:

```
{ ID: "Abort Incomplete Multipart Uploads",
  Status: "Enabled",
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } }
```

The default may already protect the bucket, but relying on an implicit default is not a defined contract. Explicitly setting it via the API makes the rule visible, auditable, and under your control.

---

## What gets built

### 1. New edge function: `supabase/functions/r2-set-lifecycle/index.ts`

This is a **one-shot admin utility** function, not a user-facing endpoint. It calls the S3 `PutBucketLifecycleConfiguration` API against the R2 bucket using the existing R2 credentials and sets two rules:

**Rule 1 — Abort incomplete multipart uploads after 7 days**
Covers all keys (`Filter: {}`). Any `CreateMultipartUpload` that never receives a `CompleteMultipartUpload` within 7 days is automatically aborted and all parts deleted.

**Rule 2 — Abort incomplete multipart uploads under `content/` after 3 days**
A more aggressive rule scoped to `content/` prefix, since that is where all video uploads land. 3 days is more than enough — a failed upload that is never retried within 3 days will never be retried. This prevents the global 7-day rule from being the only safeguard.

The function verifies the `Authorization` header matches an admin token before executing, so it cannot be triggered accidentally.

The XML payload for `PutBucketLifecycleConfiguration` sent to R2:

```xml
<LifecycleConfiguration>
  <Rule>
    <ID>abort-incomplete-global</ID>
    <Filter></Filter>
    <Status>Enabled</Status>
    <AbortIncompleteMultipartUpload>
      <DaysAfterInitiation>7</DaysAfterInitiation>
    </AbortIncompleteMultipartUpload>
  </Rule>
  <Rule>
    <ID>abort-incomplete-content-prefix</ID>
    <Filter>
      <Prefix>content/</Prefix>
    </Filter>
    <Status>Enabled</Status>
    <AbortIncompleteMultipartUpload>
      <DaysAfterInitiation>3</DaysAfterInitiation>
    </AbortIncompleteMultipartUpload>
  </Rule>
</LifecycleConfiguration>
```

This is deployed once and invoked once via `curl` or the browser — it configures the bucket and never needs to run again unless the rules need changing.

### 2. No client-side changes

The existing abort-on-failure path in `uploadVideo.ts` is already correct and covers in-session failures. The lifecycle policy covers the browser-closed / crash scenario. Together they are complete. No changes to the upload logic.

### 3. No database changes

No migration, no table, no cron. The lifecycle rule lives in R2 itself.

---

## Files to create/edit

| File | Action |
|------|--------|
| `supabase/functions/r2-set-lifecycle/index.ts` | Create one-shot admin utility edge function |
| `supabase/config.toml` | Add `r2-set-lifecycle` entry with `verify_jwt = false` |

After deploying, you invoke it once:

```
curl -X POST https://<project>.supabase.co/functions/v1/r2-set-lifecycle \
  -H "Authorization: Bearer <admin-token>"
```

The function runs, applies the lifecycle configuration to the R2 bucket, logs confirmation, and that is all that is needed.

---

## Why not a UI for this

This is infrastructure configuration, not a user workflow. It runs once at deployment time, not repeatedly. Building a UI for it adds surface area for no benefit. A curl command invoked once is the correct interface.

---

## Complete risk coverage after this change

| Scenario | Coverage |
|----------|----------|
| Upload fails mid-chunk, browser open | `abort` called by client immediately |
| Browser closed after `start`, before `complete` | R2 lifecycle rule cleans up within 3 days |
| `abort` call itself fails (network error) | R2 lifecycle rule cleans up within 3 days |
| Normal successful upload | `complete` called, object assembled, no orphan |

The system is now fully covered at every failure point.
