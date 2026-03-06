

# Fix `newStatus` ReferenceError in generate-content

## Problem
Line ~293 in `supabase/functions/generate-content/index.ts` references a variable `newStatus` that does not exist, crashing Step 2 after the social copy has already been saved.

## Fix
Replace the broken `console.log` on that line:

**Before:**
```
console.log("[generate-content] Step 2 complete: social copy saved, status:", newStatus);
```

**After:**
```
console.log("[generate-content] Step 2 complete: social copy saved");
```

One line change. No other files affected. After deploying, content generation will complete successfully.

