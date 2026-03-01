

# Content Ideas Page

## Overview

Build a new `/ideas` page that displays ideas from the `content_ideas` table, allows adding new ideas manually or via CSV upload, and lets you generate content from selected ideas using the existing pipeline.

## Current State

- The `content_ideas` table exists with RLS enabled but **zero policies** -- meaning all client-side operations are currently blocked.
- Columns: `id` (bigint, auto-increment), `created_at`, `planned_date` (timestamptz), `topic` (text), `category` (text), `avatar` (text), `length` (video_length enum: "Short" | "Long").
- The table is **not** in the generated Supabase types file yet (needs a types regeneration, which happens automatically after a migration).
- The existing `CreateContent.tsx` flow: insert into `social_content` -> upload media -> call `generate-content` edge function. The Ideas-to-Content generation will replicate just the insert + generate steps (no media at this stage).

## What Gets Built

### 1. Database: RLS policies on `content_ideas`

Migration to add policies matching the pattern used on `content_instructions`:
- **SELECT**: All authenticated users can read
- **INSERT**: Admins only
- **UPDATE**: Admins only
- **DELETE**: Admins only

### 2. New page: `src/pages/Ideas.tsx`

A full-featured page with:

**Ideas Table** -- Displays all ideas sorted by `planned_date` (nulls last), then `created_at`. Columns shown: Topic (truncated), Category, Avatar, Length, Planned Date, and a checkbox column for selection.

**Add Idea Form** -- A collapsible or dialog form with:
- **Topic**: Textarea (free text, long form)
- **Avatar**: Select dropdown with options: "Me", "Male Avatar", "Female Avatar"
- **Category**: Select dropdown with options: "The VA System", "Science & Psychology", "Home Life", "ValorWell's Mission", "Other"
- **Length**: Radio group with "Short" and "Long" (maps to the `video_length` enum)
- **Planned Date**: Calendar date picker using the Shadcn Popover + Calendar pattern

**CSV Upload** -- A file input that accepts `.csv` files. Parses the CSV client-side. Column names must match exactly: `topic`, `category`, `avatar`, `length`, `planned_date`. No AI matching -- if columns don't match, it shows an error listing the expected column names. Inserts all valid rows in a single batch.

**Generate from Selected** -- A button (disabled when nothing selected) that takes the selected ideas and generates content from them sequentially:
1. For each selected idea, insert a row into `social_content` with `topic = idea.topic`, `post_length = idea.length`, `status = "incomplete"`, `user_id = current user`.
2. Call `generate-content` edge function with `{ contentId }`.
3. Wait for it to complete before starting the next one.
4. Show a progress indicator ("Generating 2 of 5...").
5. On completion, show a toast with a link to the content list.

This mirrors exactly what `CreateContent.tsx` does, minus the media upload step. The generated content will land in "incomplete" status (since no video/image), just like any other topic-only creation.

### 3. Navigation: Add "Ideas" to AppLayout and Router

- Add a nav link in `AppLayout.tsx` between "Schedule" and "Instructions" with a Lightbulb icon
- Add route `/ideas` in `App.tsx` wrapped in `AuthGuard`

### 4. Hook: `src/hooks/useIdeas.ts`

A new hook providing:
- `useIdeas()` -- fetches all ideas ordered by planned_date
- `useCreateIdea()` -- mutation to insert a single idea
- `useBulkCreateIdeas()` -- mutation to insert multiple ideas (for CSV)
- `useDeleteIdeas()` -- mutation to delete selected ideas

## Technical Details

### Files to create
| File | Purpose |
|------|---------|
| `src/pages/Ideas.tsx` | Main ideas page with table, form, CSV upload, and generate action |
| `src/hooks/useIdeas.ts` | React Query hooks for CRUD on content_ideas |

### Files to edit
| File | Change |
|------|--------|
| `src/App.tsx` | Add `/ideas` route |
| `src/components/AppLayout.tsx` | Add Ideas nav link |
| `src/integrations/supabase/types.ts` | Auto-regenerated after migration |

### Migration
Add RLS policies for `content_ideas`:
```sql
CREATE POLICY "Authenticated select" ON public.content_ideas FOR SELECT USING (true);
CREATE POLICY "Admin insert" ON public.content_ideas FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update" ON public.content_ideas FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete" ON public.content_ideas FOR DELETE USING (has_role(auth.uid(), 'admin'));
```

### Sequential generation logic

The generate-from-ideas function runs client-side in a loop:

```text
for each selected idea:
  1. Insert into social_content (topic, post_length, user_id, status: "incomplete")
  2. Call supabase.functions.invoke("generate-content", { body: { contentId } })
  3. Await completion
  4. Move to next idea
```

This reuses the existing pipeline exactly. No edge function changes needed. The sequential approach prevents overwhelming the AI API with parallel requests and matches the requirement that each must complete before the next starts.

### CSV parsing

Client-side parsing using a simple split-based parser (no library needed for a 5-column CSV). Expected columns: `topic`, `category`, `avatar`, `length`, `planned_date`. The parser:
- Reads the header row
- Validates all expected columns exist
- Maps each data row to an insert object
- Skips empty rows
- Shows error count and success count after import

