

# Plan: Add "Both" Length Option and Delete Ideas After Generation

## What's happening now

1. **Length selection**: The `content_ideas.length` column uses a database enum `video_length` with only two values: `Short` and `Long`. The UI mirrors this with a dropdown defaulting to `Long`.

2. **Idea-to-content conversion**: When you select ideas and click "Generate Content", each idea creates one `social_content` row with the idea's `length` as `post_length`. The idea remains in the `content_ideas` table afterward — it is never deleted.

## What needs to change

### 1. "Both" option for length

"Both" should not be a database enum value — it is a UI-level concept meaning "create two content items from this idea: one Long, one Short." Here is the approach:

- **Do NOT modify the `video_length` enum.** The `social_content.post_length` column should remain `Short` or `Long` since each content item is definitively one or the other.
- **Add "Both" as a UI-only option** in the Ideas page. When an idea has length "Both":
  - Store it in the database as `null` (since the enum doesn't support "Both"), OR add `'Both'` to the enum so it persists. Adding to the enum is cleaner since it lets the value survive page reloads and CSV imports.
  - During generation, if an idea's length is `Both`, insert **two** `social_content` rows (one with `post_length = 'Long'`, one with `post_length = 'Short'`) and call `generate-content` for each.

**Recommended**: Add `'Both'` to the `video_length` database enum. This is a simple `ALTER TYPE` and keeps the stored value explicit.

### 2. Default to "Both"

- Change the form's initial `length` state from `"Long"` to `"Both"`.
- Update the CSV parser to treat unrecognized or empty length values as `"Both"` instead of `"Long"`.

### 3. Delete ideas after successful generation

- After each idea is successfully converted (both `social_content` insert and `generate-content` call succeed), delete that idea from `content_ideas`.
- Alternatively, delete all successfully generated ideas in bulk after the generation loop completes (simpler, avoids partial state issues).

## Technical steps

### Database migration
```sql
ALTER TYPE public.video_length ADD VALUE IF NOT EXISTS 'Both';
```

### Frontend changes (src/pages/Ideas.tsx)

1. **Length state default**: Change `useState<"Short" | "Long">("Long")` to `useState<"Short" | "Long" | "Both">("Both")`.

2. **Add "Both" to the Select dropdown**: Add `<SelectItem value="Both">Both</SelectItem>`.

3. **Update `handleGenerate`**:
   - For each selected idea, check its `length`:
     - If `"Both"`: create two `social_content` rows (Long + Short), call `generate-content` for each. Count as 2 toward progress.
     - If `"Short"` or `"Long"`: create one row as before.
   - Track successfully generated idea IDs.
   - After the loop, call `deleteIdeas.mutateAsync(successfulIds)` to remove them from the ideas table.
   - Update the progress bar total to account for "Both" ideas counting as 2.

4. **CSV parser**: Map `"Both"` (or empty/unrecognized) to `"Both"` instead of defaulting to `"Long"`.

5. **Display**: The table already shows `idea.length` — `"Both"` will display naturally.

### No edge function changes needed
The `generate-content` function receives a `contentId` and reads `post_length` from `social_content`. Since each row will be either `Short` or `Long`, the generation logic works as-is.

