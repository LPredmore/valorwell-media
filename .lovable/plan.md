

## Plan: Restructure Navigation and Add Planned Date to Content

### Changes Overview

1. **Make Schedule the default route, rename to "Content"**
2. **Remove the old Content tab entirely**
3. **Add delete functionality to Schedule tabs**
4. **Add `planned_date` column to `social_content` and display it in Incomplete/Unscheduled tabs**

---

### 1. Route and Navigation Changes

**`src/App.tsx`**:
- Change `<Route path="/" ...>` to redirect to `/schedule` instead of `/content`
- Remove the `/content` list route (keep `/content/new` and `/content/:id` for detail/create pages)
- Add redirect from `/content` → `/schedule`

**`src/components/AppLayout.tsx`**:
- Remove the "Content" nav link (FileText icon)
- Rename the "Schedule" nav link label to "Content"
- Keep the CalendarDays icon or switch to FileText — either works since it's now the primary content view

**`src/pages/Schedule.tsx`**:
- Change the page heading from "Schedule" to "Content"

### 2. Add Delete to Schedule Tabs

**`src/components/schedule/IncompleteTab.tsx`** and **`src/components/schedule/UnscheduledTab.tsx`** and **`src/components/schedule/ScheduledTab.tsx`**:
- Import `useDeleteContent` from `useContents`
- Add a Trash2 icon button in each row's action column, wrapped in an AlertDialog (same pattern as `ContentTable.tsx`)
- Invalidate schedule queries on delete success

### 3. Add `planned_date` to `social_content`

**Database migration**:
- `ALTER TABLE social_content ADD COLUMN planned_date timestamptz;`

**`src/pages/Ideas.tsx`** (line ~220):
- When inserting into `social_content` from an idea, include `planned_date: idea.planned_date`

**`src/hooks/useContents.ts`**:
- Add `planned_date: string | null` to the `SocialContent` type

### 4. Show Planned Date in Incomplete and Unscheduled Tabs

**`src/components/schedule/IncompleteTab.tsx`**:
- Add a "Planned Date" column header and cell showing `format(new Date(item.planned_date), "MMM d, yyyy")` or "—"

**`src/components/schedule/UnscheduledTab.tsx`**:
- Replace the existing "Created On" column with "Planned Date", falling back to created_at if no planned_date

### Files Changed
- `src/App.tsx`
- `src/components/AppLayout.tsx`
- `src/pages/Schedule.tsx`
- `src/components/schedule/IncompleteTab.tsx`
- `src/components/schedule/UnscheduledTab.tsx`
- `src/components/schedule/ScheduledTab.tsx`
- `src/hooks/useContents.ts`
- `src/pages/Ideas.tsx`
- New migration: add `planned_date` column to `social_content`

