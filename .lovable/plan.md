

# Scheduling System for Social Content

## Architecture Decision

**Extend `social_content` rather than creating a separate scheduling table.** Each row already represents a single content piece with its lifecycle tracked by `status`. Scheduling is the next phase of that lifecycle, not a separate entity. A separate table would create a 1:1 join that adds complexity for no normalization benefit -- the scheduling metadata belongs to the content row.

### New columns on `social_content`:
- `scheduled_at` (timestamptz, nullable) -- when the post is scheduled to go live
- `posted_at` (timestamptz, nullable) -- when the post was actually published
- `scheduled_platforms` (text[], nullable) -- which platforms this post targets (future-proofing for API integration)

### Status flow update:
```text
new -> uploading -> ready -> generating -> complete -> scheduled -> posted
                                                   -> error
```

Two new status values: `scheduled` and `posted`. A content item moves to `scheduled` when the user sets a `scheduled_at` date, and to `posted` when it has been published (manually or via API in the future).

## New Page: `/schedule`

A dedicated scheduling page at `/schedule` with three tabs. This is separate from `/content` because it serves a different workflow: content creation vs. content distribution. Mixing them into one page would overload the content list with scheduling concerns.

### Tab 1: Unscheduled

Shows all content with `status = 'complete'` (generated but not yet scheduled).

| Column | Source |
|--------|--------|
| Topic | `topic` |
| Created On | `created_at` |
| Thumbnail | `image` (small 48x48 via `r2-read-url`) |
| Action | "Schedule" button per row |

Clicking "Schedule" opens a dialog with:
- Date/time picker for `scheduled_at`
- Multi-select checkboxes for platforms (YouTube, Facebook, LinkedIn, Instagram/TikTok)
- Confirm button that sets `status = 'scheduled'`, `scheduled_at`, and `scheduled_platforms`

### Tab 2: Scheduled

Two view modes toggled by a button group: **Table** and **Calendar**.

**Table view:**

| Column | Source |
|--------|--------|
| Topic | `topic` |
| Scheduled Date | `scheduled_at` |
| Thumbnail | `image` |
| Action | Edit button (re-opens scheduling dialog to change date/platforms) |

**Calendar view:**
- Built with date-fns (already installed) and a custom grid component -- no new dependency
- Toggle between Weekly and Monthly views
- Each day cell shows scheduled content as small cards with topic + thumbnail
- Clicking a card navigates to the content detail page

### Tab 3: Past

Shows all content with `status = 'posted'`.

| Column | Source |
|--------|--------|
| Topic | `topic` |
| Date Posted | `posted_at` |

Simple read-only archive view.

## File Changes

### Database Migration
- Add `scheduled_at`, `posted_at`, `scheduled_platforms` columns to `social_content`
- Update `CONTENT_STATUSES` in `src/lib/platforms.ts` to include `"scheduled"` and `"posted"`

### New Files

1. **`src/pages/Schedule.tsx`** -- Main scheduling page with three tabs (Unscheduled, Scheduled, Past)
2. **`src/components/schedule/UnscheduledTab.tsx`** -- Table of complete/unscheduled content with schedule action
3. **`src/components/schedule/ScheduledTab.tsx`** -- Table + Calendar toggle for scheduled content
4. **`src/components/schedule/PastTab.tsx`** -- Table of posted content
5. **`src/components/schedule/ScheduleDialog.tsx`** -- Dialog with date/time picker and platform selector
6. **`src/components/schedule/CalendarView.tsx`** -- Monthly/weekly calendar grid
7. **`src/components/schedule/ScheduleThumbnail.tsx`** -- Reusable small thumbnail component that calls `r2-read-url`
8. **`src/hooks/useSchedule.ts`** -- React Query hooks for fetching unscheduled, scheduled, and posted content, plus mutation for scheduling

### Modified Files

1. **`src/App.tsx`** -- Add `/schedule` route
2. **`src/components/AppLayout.tsx`** -- Add "Schedule" nav link (with Calendar icon)
3. **`src/lib/platforms.ts`** -- Add `"scheduled"` and `"posted"` to `CONTENT_STATUSES`
4. **`src/hooks/useContents.ts`** -- Add `scheduled_at`, `posted_at`, `scheduled_platforms` to `SocialContent` type
5. **`src/components/content/StatusBadge.tsx`** -- Add color mappings for `scheduled` and `posted` statuses

### Calendar Implementation

The calendar is a custom component, not a third-party calendar library. Monthly view renders a 7-column CSS grid with day cells. Weekly view renders 7 day columns. Content cards are positioned in cells by matching `scheduled_at` to the cell's date. This keeps the bundle small and gives full styling control. The existing `date-fns` library handles all date math (startOfWeek, eachDayOfInterval, isSameDay, etc.).

