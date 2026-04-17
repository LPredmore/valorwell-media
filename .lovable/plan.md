

## Plan: Per-Tenant Instructions with Defaults

### Goal
Each user gets their own copy of instructions, can edit them freely, and can restore any individual instruction back to the system default at any time.

### Current state
- `content_instructions` is a single global table (one row per `scope`).
- Only admins can edit; everyone reads the same rows.
- `generate-content` edge function fetches all active rows and applies them to every user's generation.

### Architecture decision: Per-user rows + immutable defaults table

Two tables:

1. **`content_instruction_defaults`** (read-only reference, admin-managed)
   - `scope` (PK), `instruction`, `updated_at`
   - Seeded from current `content_instructions` rows.
   - Admin-only writes via `Instructions` page (admins edit defaults here).
   - Acts as the "factory reset" source.

2. **`user_content_instructions`** (per-tenant overrides)
   - `user_id`, `scope`, `instruction`, `is_active`, `updated_at`
   - PK: `(user_id, scope)`
   - RLS: users CRUD their own rows; admins can read all.
   - Auto-populated on first signup via trigger (copies all defaults into user's rows).
   - Backfill: copy current `content_instructions` to every existing user.

3. **Drop `content_instructions`** after backfill (or keep as legacy, unused).

### Why this design (not alternatives)

- **Why not one table with `user_id` nullable + fallback?** Two-tier lookup logic in every query. Harder to reason about which instruction is "active." A user editing a global default would silently fork — confusing.
- **Why not store only diffs from defaults?** Edge function would need to merge per-scope at runtime. Restoring one field becomes "delete the override row," which works but obscures what the user is actually using. Explicit copies are clearer and self-documenting.
- **Why seed on signup?** Users see and can edit every instruction immediately. No "where did these come from?" confusion. Cost is ~12 rows per user — trivial.

### Edge function change

`generate-content/index.ts`:
- Replace `adminClient.from("content_instructions").select(...)` with `adminClient.from("user_content_instructions").select(...).eq("user_id", content.user_id).eq("is_active", true)`.
- One line of logic changes; everything else stays.

### UI change: `src/pages/Instructions.tsx`

- **Non-admins**: page now shows their own `user_content_instructions` rows. No "admin only" gate. Each card gets a **"Restore default"** button that copies the matching `content_instruction_defaults.instruction` into the textarea (and saves).
- **Admins**: a toggle at the top — "My instructions" / "System defaults" — switches the source table being edited. Editing defaults only affects future signups + anyone who clicks "restore" later (does NOT retroactively overwrite user rows).
- Make `Instructions` link visible to all in `AppLayout` (remove `isAdmin` gate on this nav item).

### Migration steps

```sql
-- 1. Create defaults table, seed from current global instructions
CREATE TABLE content_instruction_defaults (
  scope text PRIMARY KEY,
  instruction text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO content_instruction_defaults (scope, instruction)
SELECT scope, instruction FROM content_instructions;

-- 2. Create per-user table
CREATE TABLE user_content_instructions (
  user_id uuid NOT NULL,
  scope text NOT NULL,
  instruction text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);
ALTER TABLE user_content_instructions ENABLE ROW LEVEL SECURITY;

-- RLS: users own their rows, admins read all
CREATE POLICY "users manage own" ON user_content_instructions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read all" ON user_content_instructions
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Defaults table: admin write, all read
ALTER TABLE content_instruction_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all read defaults" ON content_instruction_defaults
  FOR SELECT USING (true);
CREATE POLICY "admins write defaults" ON content_instruction_defaults
  FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3. Backfill existing users
INSERT INTO user_content_instructions (user_id, scope, instruction)
SELECT u.id, d.scope, d.instruction
FROM auth.users u CROSS JOIN content_instruction_defaults d;

-- 4. Trigger: seed new users on signup
CREATE FUNCTION seed_user_instructions() RETURNS trigger ...
  -- inserts a row per default for NEW.id
CREATE TRIGGER on_auth_user_created_seed_instructions
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION seed_user_instructions();
```

### Files changing

| File | Change |
|---|---|
| Migration (new) | Tables, RLS, backfill, signup trigger |
| `supabase/functions/generate-content/index.ts` | Query `user_content_instructions` scoped to `content.user_id` |
| `src/pages/Instructions.tsx` | Per-user rows + "Restore default" button + admin defaults editor toggle |
| `src/components/AppLayout.tsx` | Remove `isAdmin` gate on Instructions nav link |
| `src/integrations/supabase/types.ts` | Auto-regenerated by Supabase |

### Risks & mitigations

- **Existing users with no rows**: Backfill SQL covers all `auth.users` at migration time. Trigger handles future signups. Low risk.
- **Admin edits a default — does it propagate?** No. Existing users keep their copy. They see the new default only when they click "Restore." This is the correct, predictable behavior.
- **Old `content_instructions` table**: I'll leave it in place but unused (safer than dropping during a live cutover). Can be dropped in a follow-up after verifying generation works.

### Open question

Phase 1a (signup, onboarding, content_ideas user_id) is still pending from the previous plan. **Should I:**
- **(A)** Do this instructions work first (standalone — works for existing users now)
- **(B)** Bundle it into Phase 1a (since onboarding flow + new signups both depend on the seed trigger working)

I recommend **(A)** — it's self-contained, ships value immediately, and the signup trigger added now will Just Work when Phase 1a lands.

