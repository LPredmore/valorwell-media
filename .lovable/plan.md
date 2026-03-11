

# Fix Table Overflow in Action Columns

## Problem

Three tabs (Incomplete, Unscheduled, and Scheduled) have action columns containing text-label buttons ("Upload Media", "Schedule") alongside icon buttons. These text buttons exceed the allocated column width (`w-36`), forcing the table wider than its container and causing horizontal overflow.

## Decision: Replace text buttons with a DropdownMenu

The right fix is to consolidate all row actions into a single **"three-dot" DropdownMenu** (using `MoreHorizontal` from lucide). This is the standard pattern for table row actions because:

1. **It scales** -- adding or removing actions later won't break layout.
2. **It's consistent** -- all three tabs get the same interaction pattern, matching what ScheduledTab already approximates with its icon-only buttons.
3. **It eliminates the root cause** -- a single icon button fits any column width, so no overflow is possible regardless of screen size.

Icon-only buttons (the alternative) would work for ScheduledTab's 3 actions but break down for IncompleteTab which has contextual actions ("Upload Media" is only relevant when media is missing). Dropdown menus handle conditional items cleanly.

## Changes

### `src/components/schedule/IncompleteTab.tsx`

Replace the `flex` row of buttons (lines 104-129) with a single `DropdownMenu`:
- **Edit** (Pencil icon) → `navigate(/content/${id})`
- **Upload Media** (Upload icon) → `setEditItem(item)` (only shown when image or video is missing)
- **Delete** (Trash2 icon, destructive styling) → opens the existing AlertDialog

Remove the `w-36` constraint on the Action `TableHead`; replace with `w-14` since it only holds one icon button now.

### `src/components/schedule/UnscheduledTab.tsx`

Replace the `flex` row of buttons (lines 103-128) with a DropdownMenu:
- **Edit** (Pencil icon) → `navigate(/content/${id})`
- **Schedule** (CalendarPlus icon) → `handleScheduleClick(item)`
- **Delete** (Trash2 icon, destructive) → existing AlertDialog

Change Action `TableHead` from `w-36` to `w-14`.

### `src/components/schedule/ScheduledTab.tsx`

Replace the `flex` row of buttons (lines 102-128) with a DropdownMenu:
- **Edit** (Pencil icon) → `navigate(/content/${id})`
- **Reschedule** (CalendarDays icon) → `setEditItem(item)`
- **Delete** (Trash2 icon, destructive) → existing AlertDialog

Change Action `TableHead` from `w-24` to `w-14`.

### Imports needed (all three files)

```
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
```

### AlertDialog handling

The delete AlertDialog currently lives inside the table cell. With the dropdown, it moves to be triggered from a state variable (like the existing `editItem` pattern): clicking "Delete" in the dropdown sets a `deleteTarget` state, which opens the AlertDialog as a standalone component outside the table. This avoids nesting dialogs inside dropdown menus (which causes z-index and focus-trap issues with Radix).

