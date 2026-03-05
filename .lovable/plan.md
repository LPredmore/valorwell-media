

## Fix: Promote Stuck Incomplete Rows

### Problem

5 rows in `social_content` are stuck with `status = 'incomplete'` despite meeting all promotion criteria. They were last updated before the `trg_auto_promote_incomplete` trigger was deployed, so the trigger never evaluated them. Since client-side promotion logic was removed, there is no mechanism to catch them.

### Solution

Run a single data-only UPDATE to "touch" all incomplete rows. The existing `BEFORE UPDATE` trigger will fire and promote any that qualify. Rows that genuinely lack required fields (like the one missing a video) will remain incomplete -- the trigger handles that correctly.

```sql
UPDATE social_content
SET updated_at = now()
WHERE status = 'incomplete';
```

This is the correct approach because:

- **It's a one-time data fix, not a schema change.** The trigger logic is already correct and tested. The only issue is that pre-existing rows were never evaluated by it.
- **It's safe.** The trigger only promotes rows that meet all criteria. Rows that are genuinely incomplete stay incomplete. The `set_updated_at` trigger already sets `updated_at = now()` on every update, so this is a no-op in terms of side effects.
- **No code changes needed.** The system is working correctly going forward. Any future INSERT or UPDATE on `social_content` will be evaluated by the trigger.

### What will happen

- The 2 qualifying Long rows (have video + post_title + image) will be promoted to `unscheduled`
- The 3 qualifying Short rows (have video + post_title) will be promoted to `unscheduled`
- The 1 genuinely incomplete Long row (missing video) will stay `incomplete`

### Execution

Use the Supabase data operation tool (not a migration) to run the UPDATE statement.

