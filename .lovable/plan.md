

# Content Ideas Page Implementation

## Overview

Build a new `/ideas` page for managing content ideas from the `content_ideas` table, with manual entry, CSV upload, and bulk content generation.

## Database

Add RLS policies to `content_ideas` (currently has zero policies, blocking all access):
- SELECT: all authenticated users
- INSERT/UPDATE/DELETE: admin only

Uses the same `has_role()` pattern as `content_instructions`.

## New Files

### `src/hooks/useIdeas.ts`
React Query hooks:
- `useIdeas()` -- fetch all ideas ordered by `planned_date` (nulls last), then `created_at`
- `useCreateIdea()` -- insert single idea
- `useBulkCreateIdeas()` -- insert array of ideas (CSV)
- `useDeleteIdeas()` -- delete by array of IDs

### `src/pages/Ideas.tsx`
Full page with four sections:

**Ideas Table** -- Checkbox column for selection, columns: Topic (truncated), Category, Avatar, Length, Planned Date. Select-all checkbox in header.

**Add Idea Dialog** -- Opens a dialog form with:
- Topic: Textarea (long form free text)
- Avatar: Select dropdown -- "Me", "Male Avatar", "Female Avatar"
- Category: Select dropdown -- "The VA System", "Science & Psychology", "Home Life", "ValorWell's Mission", "Other"
- Length: Select dropdown -- "Short", "Long" (defaults to "Long")
- Planned Date: Popover + Calendar date picker

**CSV Upload** -- File input accepting `.csv`. Client-side parsing. Validates header row has exact columns: `topic`, `category`, `avatar`, `length`, `planned_date`. No fuzzy matching -- shows error with expected column names if mismatch. Batch insert on success.

**Generate from Selected** -- Button disabled when nothing selected. Sequential processing:
1. For each selected idea: insert into `social_content` with `topic`, `post_length = idea.length`, `user_id`, `status = "incomplete"`
2. Call `generate-content` edge function, await completion
3. Move to next idea only after previous finishes
4. Progress indicator: "Generating 2 of 5..."
5. Toast with link to content list on completion

This replicates exactly what CreateContent does (insert + invoke generate-content), minus media upload. No edge function changes needed.

## Edited Files

### `src/App.tsx`
Add route: `/ideas` wrapped in AuthGuard, importing Ideas page.

### `src/components/AppLayout.tsx`
Add "Ideas" nav link between "Schedule" and "Instructions" using the Lightbulb icon from lucide-react.

## Technical Notes

- CSV parsing is a simple split-based approach (no library needed for 5 columns). Handles quoted fields containing commas.
- The `content_ideas` table types are already in the generated Supabase types file from the last migration.
- Sequential generation prevents API rate limiting and matches the requirement for 100% completion before next.
- The Length field uses a Select dropdown defaulting to "Long", not a radio group.
