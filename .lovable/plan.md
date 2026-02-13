

# Add Post Length Selector to Create Content Form

## What Changes

Add a required "Video Length" radio group to the `/content/new` form that lets the user choose between **Short** and **Long** before submitting. The selected value is saved directly to the `post_length` column on insert.

## UI Change

A new field between "Topic" and "Video" with two radio buttons:
- **Short** -- for short-form content (Reels, TikTok, Shorts)
- **Long** -- for long-form content (YouTube, Facebook)

The submit button stays disabled until a value is selected (in addition to the existing topic + video requirements).

## Technical Details

### File: `src/pages/CreateContent.tsx`

1. Add `postLength` state (`useState<"Short" | "Long" | null>(null)`)
2. Add a RadioGroup (from the existing `@radix-ui/react-radio-group` component at `src/components/ui/radio-group.tsx`) between the Topic and Video fields
3. Include `post_length: postLength` in the `.insert()` call when creating the content row
4. Add `!postLength` to the submit button's `disabled` condition

### File: `src/integrations/supabase/types.ts`

This file is auto-generated and cannot be edited manually. The `post_length` column already exists in the DB as a `USER-DEFINED` enum type (`video_length`) with values `Short` and `Long`. The insert call will use `as any` casting (same pattern already used elsewhere in this file) to accommodate the enum value.

### No database migration needed

The `post_length` column and `video_length` enum already exist in the database.
