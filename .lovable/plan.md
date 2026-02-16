
# Mobile-Friendly Schedule Page

## Overview
Make the `/schedule` page and the app header more usable on mobile devices, and truncate the Topic column to a single line across all schedule tabs.

## Changes

### 1. AppLayout Header (src/components/AppLayout.tsx)
- Make the navigation responsive for small screens:
  - Hide nav button labels on mobile, show only icons
  - Hide the user email on mobile (keep just the sign-out button)
  - Reduce header padding on small screens
  - Use `gap-4` instead of `gap-8` on mobile between logo and nav

### 2. Topic Column -- Single Line Truncation (all 4 tab components)
Add `truncate max-w-[150px] sm:max-w-[250px]` to every Topic `TableCell` so the text clips with an ellipsis after one line.

**Files affected:**
- `src/components/schedule/IncompleteTab.tsx` (line 92)
- `src/components/schedule/UnscheduledTab.tsx` (line 92)
- `src/components/schedule/ScheduledTab.tsx` (line 91)
- `src/components/schedule/PastTab.tsx` (line 25)
- `src/components/content/ContentTable.tsx` (line 69)

### 3. Schedule Tables -- Hide Less-Critical Columns on Mobile
Use `hidden sm:table-cell` on columns that are secondary on small screens:
- **IncompleteTab**: Hide "Image" and "Video" check columns on mobile (the Upload Media button is enough)
- **UnscheduledTab**: Hide "Image" thumbnail and "Created On" columns on mobile
- **ScheduledTab**: Hide "Image" thumbnail and "YouTube" status columns on mobile
- **PastTab**: Keep both columns (only 2 columns, both useful)

### 4. Schedule Page Tab Triggers (src/pages/Schedule.tsx)
- Make the `TabsList` scrollable on mobile so the 4 tab triggers don't overflow. Add `w-full` and allow horizontal scroll if needed.

## Technical Details

### Topic truncation CSS pattern (applied identically in all files):
```tsx
<TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">
  {item.topic}
</TableCell>
```

### Responsive column hiding pattern:
```tsx
// In TableHead
<TableHead className="w-14 hidden sm:table-cell">Image</TableHead>
// In TableCell
<TableCell className="hidden sm:table-cell">...</TableCell>
```

### AppLayout nav -- icon-only on mobile:
```tsx
<Button size="sm" className="gap-2">
  <FileText className="h-4 w-4" />
  <span className="hidden sm:inline">Content</span>
</Button>
```

### User email hidden on mobile:
```tsx
<span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
```
