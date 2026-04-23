

## Plan: Seed full instruction defaults + backfill existing users

The infrastructure is already done — `content_instruction_defaults` table, `user_content_instructions` table, the `seed_user_instructions` trigger that copies defaults on signup, and the Settings → Instructions UI with Save / Restore default. The only gap: only `channel_brief` is currently seeded as a default. Your CSV has 12 more.

### What I'll do

**1. Insert the 12 default rows** from your CSV into `content_instruction_defaults` using the data tool (`INSERT … ON CONFLICT (scope) DO UPDATE`). Scopes:
`facebook_desc`, `global`, `hashtags`, `ig_tiktok_desc`, `linkedin_desc`, `post_title`, `script_long`, `script_short`, `shorts_extraction`, `youtube_comment`, `youtube_desc`, `youtube_title`

This makes them the single source of truth that:
- New signups receive automatically (existing trigger already does this)
- Admins can edit in Settings → Instructions → "System defaults" tab
- Users can restore via the existing "Restore default" button

**2. Backfill existing users** with the same insert pattern the trigger uses:
```sql
INSERT INTO user_content_instructions (user_id, scope, instruction)
SELECT p.id, d.scope, d.instruction
FROM profiles p
CROSS JOIN content_instruction_defaults d
ON CONFLICT (user_id, scope) DO NOTHING;
```
`ON CONFLICT DO NOTHING` is critical — it preserves any customizations users have already saved (only adds rows for scopes they're missing).

**3. Add `youtube_title` label** to `SCOPE_LABELS` in `src/components/settings/InstructionsView.tsx` so it renders with a friendly name. (Currently only `post_title` is labeled; the CSV ships both.)

### What's already working (no changes needed)

- ✅ DB tables, RLS, triggers
- ✅ Settings → Instructions UI with per-scope edit, Save, Restore default, customized indicator
- ✅ Admin "System defaults" tab to edit the master copy
- ✅ AI pipeline (`generate-content`) already reads `user_content_instructions` with no scope hardcoding — new defaults flow into prompts automatically

### Behavior after this runs

- A user opens Settings → Instructions: sees all 13 scopes (channel_brief + 12 new) prefilled with the defaults
- Edits one → it's saved as their personalized copy, "customized" badge appears
- Clicks "Restore default" on that row → back to the system default
- New signups: receive all 13 defaults automatically via the existing trigger
- Admin edits a system default: existing users' copies stay untouched (they only get the new value if they click "Restore default")

### Files touched

**Data ops (insert tool, no schema change):**
- INSERT 12 rows into `content_instruction_defaults`
- Backfill INSERT into `user_content_instructions` for existing users

**Code:**
- `src/components/settings/InstructionsView.tsx` — add `youtube_title: "YouTube Title"` to `SCOPE_LABELS`

### Out of scope

- LinkedIn / Reddit native connections — paused per your direction until OAuth apps are approved
- No schema changes (no migration needed)

