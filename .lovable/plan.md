

# Plan: Update AI Model and Script Generation Logic

## Changes to `supabase/functions/generate-content/index.ts`

### 1. Change the AI model
- Line 10: Update `MODEL` from `"anthropic/claude-sonnet-4"` to `"deepseek/deepseek-chat-v3-0324"`

### 2. Script generation: only the relevant script per post length
Currently, "Long" posts generate both a long script AND a short script. "Short" posts generate a short script. The new behavior:

- **Long** → generate long script only (skip short script)
- **Short** → generate short script only (skip long script)

This means changing the Step 2 condition (lines 273-296) from `if (postLength === "Long" || postLength === "Short")` to just `if (postLength === "Short")`.

The social copy step (Step 3) already handles whichever scripts are available (passes `scriptLong` and `scriptShort` as context, both nullable), so no changes needed there.

### Summary of edits
| Line | Current | New |
|------|---------|-----|
| 10 | `"anthropic/claude-sonnet-4"` | `"deepseek/deepseek-chat-v3-0324"` |
| 274 | `if (postLength === "Long" \|\| postLength === "Short")` | `if (postLength === "Short")` |

Two line changes total. The edge function will be auto-deployed.

