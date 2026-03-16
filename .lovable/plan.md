

# Shorts Extraction from Long-Form Content — Implementation Plan

## Architecture Decision: Client-Side Sequential Loop (No New Edge Function)

The client already loops sequentially through ideas in `handleGenerate`. The new flow adds one AI call to extract short scripts, then reuses the existing `generate-content` function for each Short's social copy. This eliminates timeout risk entirely — each network call is independent and well within limits.

## How Every Risk Item Drops to Low

| Risk | Mitigation |
|------|-----------|
| **Edge function timeout (was HIGH)** | No new edge function. One extraction call + N independent `generate-content` calls, each under 15s. |
| **Partial failures (was HIGH)** | Idea deletion deferred until ALL items (Long + every Short) succeed. If any Short fails, the idea survives for retry. Already-created content rows remain usable. |
| **posted_content schema (was HIGH)** | `parent_content_id` added to both `social_content` AND `posted_content`. The `...rest` spread in `post-scheduled-content` will pass it through cleanly. |
| **Regenerate destroys context (was MED)** | No change needed now — `generate-content` already checks `post_length` and generates the right script type. Extracted Shorts are regular Short rows; regenerating one produces a standalone short script, which is acceptable behavior. |
| **CSV batch amplification (was MED)** | Sequential processing is already the pattern. Progress bar updated per-item so user sees real progress. |
| **Missing email notifications (was MED)** | Each extracted Short calls `generate-content`, which already sends emails. No gap. |
| **Dangling Bridge CTAs on delete (was MED)** | `ON DELETE SET NULL` is correct — Shorts remain functional content even without a parent. The Bridge CTA is baked into the script text; it references "the full video" generically, not a specific URL. |
| **Progress bar accuracy (was LOW)** | Progress shows "Step 1: Extracting shorts..." then updates total dynamically once extraction returns the count. |
| **No visual distinction (was LOW)** | Deferred — not a risk, just a future UX enhancement. |
| **Instruction seed idempotency (was LOW)** | Use `INSERT ... ON CONFLICT` or check existence. `content_instructions` gets a unique constraint on `scope`. |

## Implementation Steps

### 1. Database Migration

```sql
-- Add parent tracking to both tables
ALTER TABLE social_content
  ADD COLUMN parent_content_id uuid REFERENCES social_content(id) ON DELETE SET NULL;

ALTER TABLE posted_content
  ADD COLUMN parent_content_id uuid;

-- Prevent duplicate instruction scopes
ALTER TABLE content_instructions
  ADD CONSTRAINT content_instructions_scope_unique UNIQUE (scope);

-- Seed the extraction instruction
INSERT INTO content_instructions (scope, instruction, is_active)
VALUES ('shorts_extraction', '<the full Shorts Strategist prompt>', true)
ON CONFLICT (scope) DO NOTHING;
```

### 2. New Edge Function: `extract-shorts` (Lightweight, Single-Purpose)

**Input:** `{ longScript, topic }`
**Output:** `{ shorts: [{ title, script }, ...] }` (3-5 items)

This function does ONE thing: calls the AI with the `shorts_extraction` instruction and returns structured Short scripts. No DB writes, no social copy generation. ~10s max execution time.

```
supabase/functions/extract-shorts/index.ts
```

- Fetches `shorts_extraction` instruction from `content_instructions`
- Calls OpenRouter with tool calling, tool returns array of `{ title, script }`
- Returns JSON array to client

Register in `config.toml`:
```toml
[functions.extract-shorts]
verify_jwt = false
```

### 3. Update `Ideas.tsx` — `handleGenerate` for "Both" Flow

Current flow for "Both": creates Long row → generate-content, then Short row → generate-content, then deletes idea.

New flow for "Both":
1. Create Long row → call `generate-content` (existing)
2. Call `extract-shorts` with `{ longScript, topic }` → get 3-5 short scripts
3. For each extracted short, sequentially:
   - Insert `social_content` row with `post_length: "Short"`, `parent_content_id: longContentId`, `script: extractedScript`
   - Call `generate-content` with `{ contentId, skipScript: true }` — generates social copy only, skips script generation since script is pre-populated
4. Only delete idea if Long AND all Shorts succeeded

Progress tracking:
- Phase 1: "Generating long-form..." (1 step)
- Phase 2: "Extracting shorts..." (1 step)  
- Phase 3: "Generating short 1 of N..." (N steps)
- Total recalculated dynamically after Phase 2 returns

### 4. Update `generate-content` Edge Function — Add `skipScript` Flag

When called with `{ contentId, skipScript: true }`:
- Skip Step 1 (script generation) entirely
- Use the existing `script` column value for social copy generation in Step 2
- Everything else unchanged

This is a 5-line change: check for `skipScript` in the request body, and if true, read `content.script` instead of generating a new one.

### 5. Update `Instructions.tsx` — Add Scope Label

Add to `SCOPE_LABELS`:
```typescript
shorts_extraction: "Shorts Extraction Strategy",
```

### 6. Update `post-scheduled-content` — Strip `parent_content_id` from Spread

Add `parent_content_id` to the destructured-and-excluded fields, then explicitly set it on the insert. This ensures the column is handled explicitly rather than relying on spread:

```typescript
const { id: _id, ..., parent_content_id,  ...rest } = row;
// insert with: parent_content_id
```

Actually — since `posted_content` now has the column and we want to preserve the relationship, `...rest` will pass it through automatically. No code change needed in this file.

## Files Changed

| File | Change |
|------|--------|
| DB migration | Add `parent_content_id` to both tables, unique constraint on `content_instructions.scope`, seed `shorts_extraction` row |
| `supabase/functions/extract-shorts/index.ts` | **New** — lightweight AI extraction, returns short scripts |
| `supabase/functions/generate-content/index.ts` | Add `skipScript` flag support (~5 lines) |
| `supabase/config.toml` | Register `extract-shorts` |
| `src/pages/Ideas.tsx` | Refactor "Both" flow: Long → extract → sequential Short generation |
| `src/pages/Instructions.tsx` | Add `shorts_extraction` to `SCOPE_LABELS` |

## What Does NOT Change

- `ContentDetail.tsx` — Regenerate button works as-is (generates standalone script for any content type)
- `post-scheduled-content` — `...rest` spread passes `parent_content_id` through naturally
- `ContentList.tsx` / Schedule pages — Shorts appear normally in Short tab
- Standalone "Short" ideas — Still create one Short, call `generate-content` directly
- YouTube/TikTok/Publer posting — Completely unaffected

