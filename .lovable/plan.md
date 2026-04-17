

## Plan: Generic system defaults + preserve current instructions for valorwell admin

### Goal
Replace the industry-specific (Valorwell / mental health) content instruction defaults in `content_instruction_defaults` with industry-agnostic versions that read well for any creator. Before doing that, snapshot every current default verbatim into the `info@valorwell.org` user's `user_content_instructions` so that account keeps the originals.

### Step 1 — Inspect current defaults

I need to read every row in `content_instruction_defaults` to understand exactly what's there before rewriting. I'll use the read query tool to pull `scope` + `instruction` for all 11 scopes (global, post_title, youtube_desc, facebook_desc, linkedin_desc, ig_tiktok_desc, hashtags, youtube_comment, script_long, script_short, shorts_extraction).

I'll also confirm `info@valorwell.org` exists in `profiles` and grab their `user_id`.

### Step 2 — Snapshot current defaults to valorwell admin

Single migration:

```sql
-- Overwrite valorwell admin's user_content_instructions with the CURRENT defaults
-- (so when defaults are rewritten in step 3, valorwell keeps the originals)
INSERT INTO user_content_instructions (user_id, scope, instruction, is_active)
SELECT
  (SELECT id FROM profiles WHERE email = 'info@valorwell.org'),
  d.scope,
  d.instruction,
  true
FROM content_instruction_defaults d
ON CONFLICT (user_id, scope)
DO UPDATE SET instruction = EXCLUDED.instruction, updated_at = now();
```

This guarantees the valorwell account holds the exact current text regardless of whether they had ever customized it.

### Step 3 — Rewrite each default to be industry-agnostic

Same length, same structure, same tone, same formatting rules — only strip references to mental health, therapy, Valorwell, veterans, clients, clinical language, etc. Replace with neutral creator-facing language ("your audience", "your topic", "viewers", "the subject you're covering").

For each of the 11 scopes I'll mirror the existing structure (headers, bullet style, word counts, do/don't lists) and only swap industry-specific phrasing. A second migration with `UPDATE content_instruction_defaults SET instruction = '...' WHERE scope = '...'` for each scope.

### Step 4 — Verify

After the migrations apply, the InstructionsView "System defaults" tab (admin-only) will show the new generic versions, and the valorwell account's "My instructions" tab will show the originals unchanged.

### Important nuance

Per the existing UI copy: editing defaults does NOT retroactively touch other existing users' personal copies. So:
- valorwell account → keeps originals (because we explicitly snapshot in step 2)
- Other existing users → keep whatever they already had (untouched)
- New signups → get the new generic defaults (via `seed_user_instructions` trigger)
- Existing users who click "Restore default" → get the new generic version

### Out of scope
- No code changes
- No UI changes
- No changes to `content_instructions` (the older single-row table used by edge functions) — only `content_instruction_defaults` per the InstructionsView component

