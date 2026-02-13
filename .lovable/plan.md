

# Change YouTube Upload Privacy to Public

## What Changes

One line in the `publish-youtube` edge function: change `privacyStatus` from `"private"` to `"public"`.

## Important Note

If your Google Cloud project has **not** completed YouTube API verification, YouTube will override this and keep uploads as Private regardless of what we set. If uploads still appear as Private after this change, you'll need to submit your Google Cloud project for verification through the Google API Console.

## Technical Detail

**File:** `supabase/functions/publish-youtube/index.ts` (line 89)

Change:
```ts
privacyStatus: "private",
```
To:
```ts
privacyStatus: "public",
```

That's the only change needed. The edge function will be redeployed automatically.

