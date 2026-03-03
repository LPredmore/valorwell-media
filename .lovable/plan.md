

# Long/Short Tabbed Views + Image-Only-For-Long Changes

## Overview

Three related changes:

1. **`/content` page**: Add "Long" / "Short" tabs to filter content by `post_length`
2. **`/schedule` page**: Add "Long" / "Short" tabs that wrap the existing Incomplete/Unscheduled/Scheduled/Past sub-tabs
3. **Image requirement**: Only require cover image for Long videos. Remove image upload option from the create form when Short is selected. Adjust completeness logic everywhere.

## Detailed Changes

### 1. `/content` page — Add Long/Short tabs

**`src/pages/ContentList.tsx`**
- Add a `lengthFilter` state (`"Long"` | `"Short"`)
- Render a `<Tabs>` component with two tabs: "Long" and "Short"
- Pass `lengthFilter` to `useContents`

**`src/hooks/useContents.ts`**
- Add `lengthFilter` parameter to `useContents`
- Add `.eq("post_length", lengthFilter)` filter to the query

### 2. `/schedule` page — Add Long/Short tabs

**`src/pages/Schedule.tsx`**
- Wrap the existing layout with an outer `<Tabs>` for Long/Short
- Pass the selected length down to each schedule sub-tab as a prop

**`src/hooks/useSchedule.ts`**
- Add `postLength` parameter to `useIncompleteContent`, `useUnscheduledContent`, `useScheduledContent`
- Filter queries with `.eq("post_length", postLength)`

**`src/components/schedule/IncompleteTab.tsx`**, **`UnscheduledTab.tsx`**, **`ScheduledTab.tsx`**, **`PastTab.tsx`**
- Accept `postLength` prop and pass it to their respective hooks

### 3. Image not required for Shorts

**`src/pages/CreateContent.tsx`**
- Hide the "Cover Image" upload section when `postLength === "Short"`
- Clear `imageFile`/`imagePreview` if user switches from Long to Short

**`src/components/schedule/IncompleteTab.tsx`**
- In the completeness check (line 57), only require `image` when `post_length === "Long"`
- In the upload media dialog, hide the image upload option for Short content

**`src/components/schedule/UnscheduledTab.tsx`**
- In `validateForScheduling`, only check for Cover Image when `item.post_length === "Long"`

**`supabase/functions/generate-content/index.ts`**
- In Step 3 where `newStatus` is determined: for Shorts, only require `video_storage_path` (not `image`) to promote to "unscheduled"

**`supabase/functions/post-scheduled-content/index.ts`** (if applicable)
- No change needed — the DB trigger `enforce_youtube_schedule_requirements` already checks image, but we may need to relax that for Shorts

**Database trigger `enforce_youtube_schedule_requirements`**
- Update to only enforce `image` requirement when `post_length = 'Long'`

### Summary of files to edit

| File | Change |
|------|--------|
| `src/pages/ContentList.tsx` | Add Long/Short tabs, pass filter |
| `src/hooks/useContents.ts` | Add `lengthFilter` param |
| `src/pages/Schedule.tsx` | Add outer Long/Short tabs |
| `src/hooks/useSchedule.ts` | Add `postLength` param to hooks |
| `src/components/schedule/IncompleteTab.tsx` | Accept prop, conditional image logic |
| `src/components/schedule/UnscheduledTab.tsx` | Accept prop, relax image validation |
| `src/components/schedule/ScheduledTab.tsx` | Accept prop |
| `src/components/schedule/PastTab.tsx` | Accept prop |
| `src/pages/CreateContent.tsx` | Hide image upload for Short |
| `supabase/functions/generate-content/index.ts` | Conditional image check for status |
| DB migration | Update `enforce_youtube_schedule_requirements` trigger |

