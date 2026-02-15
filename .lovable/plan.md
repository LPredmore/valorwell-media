

# Fix: Allow Today's Date in Schedule Calendar

## Problem
The calendar's `disabled` function compares the raw date from react-day-picker against today at midnight, but `d` may carry a small time offset that causes today to appear disabled.

## Solution
Normalize both the candidate date `d` and today to midnight before comparing, ensuring a pure date-only comparison.

## Change

**File: `src/components/schedule/ScheduleDialog.tsx`** (line ~148)

Replace:
```tsx
disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
```

With:
```tsx
disabled={(d) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(d);
  check.setHours(0, 0, 0, 0);
  return check.getTime() < today.getTime();
}}
```

This ensures only dates strictly before today are disabled, and today is always selectable.
