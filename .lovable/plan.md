

# Update Image Instructions with ValorWell Styling Prompt

## What Changes

Update the two existing rows in the `image_instructions` table (IDs 1 and 2) with your detailed ValorWell thumbnail styling prompt.

## 16:9 (Landscape) - ID 2

The full prompt you provided, with one added composition note: "Landscape orientation: use the wide frame to create cinematic depth and horizontal storytelling."

## 9:16 (Vertical) - ID 1

The full prompt you provided, with these vertical-specific alterations in the Composition section:
- "Portrait orientation: use the tall frame for vertical storytelling, stacking subject above secondary elements."
- "Leave clean negative space for headline typography (upper third)."
- "Account for platform UI overlays (profile icons, like buttons, captions) in the lower 20% of the frame."

Everything else (lighting, color palette, typography, mood, brand mark, subjects, constraints, never-do rules) stays identical between both.

## Technical Details

Two SQL UPDATE statements against the `image_instructions` table, updating the `instruction` column and incrementing the `version` for rows with `aspect_ratio = '16:9'` and `aspect_ratio = '9:16'`.

