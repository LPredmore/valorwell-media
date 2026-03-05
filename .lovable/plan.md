
Diagnosis only (no fixes proposed).

I did a full check of the live DB, edge function code, frontend code paths, migrations, and available logs.

What is actually true right now
1) Your DB claim is correct:
- `social_content` has `post_title` and `youtube_comment`.
- `social_content` does NOT have `youtube_title`.
- `posted_content` still has `youtube_title` (and also `post_title`).

2) The generation function still writes `youtube_title`:
- In `supabase/functions/generate-content/index.ts`, Step 2 builds one DB update containing:
  `post_title`, `youtube_title`, `facebook_desc`, `youtube_comment`, etc.
- Since `youtube_title` does not exist on `social_content`, that update fails.
- Because it is one single update, all those fields fail together (not just `youtube_title`).

3) Why your newest items have no title/copy:
- Live data in `social_content` shows 6 recent rows where:
  - `script` is present
  - `post_title`, `youtube_desc`, `facebook_desc`, `youtube_comment` are all null
- This matches the pipeline behavior:
  - Step 1 (script) succeeds
  - Step 2 (social fields) fails before save

4) Why you see non-2xx:
- Step 2 returns 500 `"Failed to save generated content"` when the DB update fails.
- Earlier logs show this exact failure pattern (`DB update error ... PGRST204`), with Step 1 completion immediately before Step 2 failure.

5) Why rows stay “incomplete” with no useful error text:
- The function tries to set `status: "generating"` and, on catch, `status: "error"`.
- But `post_status` enum currently is: `incomplete, unscheduled, scheduled, posted, scripted`.
- So `"generating"`/`"error"` are invalid enum values.
- Those status updates are attempted without checking returned DB errors, so rows remain `incomplete` and `error` often stays null.

6) There is broader schema/code mismatch beyond generation:
- Frontend still references `youtube_title` in multiple critical places:
  - search filter (`useContents`) uses `youtube_title.ilike...`
  - completeness/scheduling checks use `youtube_title`
  - detail page does `.select("..., youtube_title, ...")`
- DB scheduling trigger function `enforce_youtube_schedule_requirements()` also still checks `NEW.youtube_title`.
- So the system is currently split between two contracts:
  - DB `social_content` contract now title=`post_title`
  - app/backend logic still expects title=`youtube_title`

Simple summary
You changed the DB title field to `post_title`, but the generation pipeline + scheduling logic + UI still operate as if `youtube_title` exists. The Step 2 write fails atomically, so generated social fields never persist, which is why your recent content ends up with script-only records and no title/copy saved.
