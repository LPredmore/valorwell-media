# Beyond The Yellow — controlled Shorts expression release (2026-10-17)

## Operational status

Activated in Billing Hub Supabase (project `ahqauomkgflopxgnlndd`) for **future Shorts thumbnail visual-metadata generation**. The current Veterans Future Foundation multicamera master remains in `intake`, without generated Shorts. Do not automatically start or publish its full workflow during this feature rollout.

The existing full-episode and long-form Part creative styles are unchanged. Existing published thumbnail files are unchanged. New or regenerated Shorts must use a valid active preset; no uncontrolled facial-expression fallback is permitted.

## Architecture

1. `video-bty-text-dispatcher` asks the text model only for Short `primary_speaker`, `core_visual`, and `hook_text_placement`. Part metadata generation is unchanged.
2. Server-side `assign_bty_short_expression` assigns an active nonnegative preset, writes a usage ledger row, and atomically stores its immutable expression, positioning, gesture, framing, and pose on `ai_operations_video_clips`.
3. Selection is serialized per tenant with an advisory transaction lock. Preference ranking excludes the same exact preset in the previous 8 clips when possible, avoids families with 2 selections in the last 6 when possible, and deprioritizes the same speaker/preset over 14 days. Fallback gradually relaxes repetition constraints rather than using a negative preset.
4. `video-thumbnail-generation-dispatcher` validates that the selected ID belongs to the tenant and that its metadata matches the curated database row. It merges preset details into the creative brief and appends a non-overridable instruction requiring neutral-to-positive affect. The existing red/cyan, dark distressed, high-stakes collage **and immutable on-image hook** remain.
5. The existing thumbnail enqueue trigger observes updated generation revision/metadata and creates a new image job. The result uses the existing Drive and publication lifecycle.

## Data

- `ai_operations_thumbnail_expression_presets`: 24 active, reusable presets. Distribution: surprise 6, excitement 5, urgent-neutral 4, disbelief 4, confident 3, hopeful 2. Zero negative presets are eligible.
- `ai_operations_thumbnail_expression_usage`: append-only selection history scoped by tenant, project and clip. Captures speaker, family, generation revision, reason and time.
- `ai_operations_video_clips`: preset ID, family, selection reason/version, timestamp and `thumbnail_expression_locked`. Existing visual fields remain denormalized for compatibility with prompts and fingerprinting.
- The previous thumbnail metadata values are not backfilled onto historical published clips. Only the new metadata jobs use the new library.

## Manual override / regenerate (privileged operator)

The service-role-only RPC:
```sql
SELECT public.override_bty_short_expression(
  '<clip-id>'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'bty-short-03',
  true
);
```
chooses that approved preset, locks it (optional boolean), increments the thumbnail-generation revision, invalidates pending thumbnail references, and relies on the existing thumbnail enqueue trigger to regenerate the asset. The operator function rejects already uploaded or scheduled content; it never rewrites published YouTube posts. The selected preset remains locked if thumbnail visual metadata is regenerated. **The dedicated CRM UI for choosing presets is not yet present; operator RPC and SQL are usable now, and a UI can be added separately.**

## Acceptance evidence

Run `supabase/tests/bty_short_expression_preset_regression.sql` through privileged SQL; it uses BEGIN/ROLLBACK and leaves no synthetic rows. It verified 18 unique selections across all 6 families, zero negative selections, no reuse inside 8 Shorts, immutable hook text, preset override, and locked selection on regeneration.

Read-only checks should show:

```sql
SELECT emotion_family,valence,count(*) FROM public.ai_operations_thumbnail_expression_presets
 WHERE active GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) FROM public.ai_operations_thumbnail_expression_usage;
SELECT clip_type,count(*) FROM public.ai_operations_video_clips
 WHERE project_id='<current-episode-uuid>'::uuid GROUP BY 1;
```

Before opening full production: verify the next Short metadata job stores a nonnull preset reference and a matching usage row; verify the first 2–3 newly generated 9:16 thumbnails retain the hook and red/cyan high-tension collage while using distinct neutral-to-positive faces. Do not mark visual acceptance until actual image artifacts have been inspected.

## Failure policy

If no active nonnegative preset exists, the assignment fails closed with `short_expression_selection_failed`. If rendered metadata diverges from its preset, rendering fails with `short_expression_drift`. Previously published videos stay intact. No automatic negative or freeform fallback. Database and function changes are versioned in the media repository, with automatic source/image job retries retained.

If a run must be halted, disable BTY job intake through the existing workflow-enabled operational setting rather than deleting presets or disabling the security checks; make that decision deliberately because it affects the full pipeline.
