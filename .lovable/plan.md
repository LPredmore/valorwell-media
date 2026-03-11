

# Fix DST-Aware Timezone Handling in ScheduleDialog

## Problem

`cstHourToLocalTime` hardcodes `cstHour + 6` (UTC-6, i.e. CST). During CDT (mid-March through early November), Chicago is UTC-5. This causes all preferred times to be off by 1 hour — selecting "1 PM" actually schedules for 2 PM Chicago time.

## Decision: Use `Intl.DateTimeFormat` with `America/Chicago`

The browser's built-in `Intl` API resolves the correct UTC offset for any date in any IANA timezone, handling DST transitions automatically. No library needed.

## Changes — `src/components/schedule/ScheduleDialog.tsx`

**1. Replace `cstHourToLocalTime` with a proper timezone conversion:**

```typescript
/** Convert a Chicago-time hour to a UTC Date for the given date */
function chicagoHourToUTC(date: Date, chicagoHour: number): Date {
  // Build an ISO-ish string for the target Chicago time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(chicagoHour).padStart(2, "0");
  
  // Use a temporary Date to find Chicago's actual UTC offset on that date
  const probe = new Date(`${year}-${month}-${day}T${hour}:00:00`);
  const chicagoStr = probe.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  const offsetMs = probe.getTime() - chicagoDate.getTime();
  
  // The real UTC time = Chicago time + offset
  const utcMs = new Date(
    year, date.getMonth(), date.getDate(), chicagoHour, 0, 0
  ).getTime() + offsetMs;
  
  return new Date(utcMs);
}
```

**2. Update `handleConfirm`:**

When "Pref Times" is active, use `chicagoHourToUTC(date, selectedPrefHour)` to produce the correct UTC `Date` directly, rather than converting to a local time string and then back.

When manual time input is used, interpret the `<input type="time">` value as the user's local browser time (current behavior, which is correct since the manual input already works in local time).

**3. Rename constants for clarity:**

Rename `SHORT_TIMES_CST` → `SHORT_TIMES_CHICAGO`, `LONG_TIMES_CST` → `LONG_TIMES_CHICAGO`, and `cstHour` → `chicagoHour` to reflect that these are Chicago times, not fixed-offset CST.

**4. Update comment/label:**

Change the comment from "Preferred times in CST (UTC-6)" to "Preferred times in America/Chicago".

No other files need changes. The `onConfirm` callback already receives a `Date` object and calls `.toISOString()` in the mutation, so the rest of the pipeline is unaffected.

