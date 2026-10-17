# Beyond the Yellow: two-camera master rendering

The initial release takes exactly two original StreamYard participant webcam MP4s in a direct episode subfolder of the configured Billing Hub video-ingest Drive root. It maps filenames to participant names and join offsets, analyzes each microphone track with WebRTC VAD, creates a stable shot timeline, mixes aligned audio, renders 1920x1080 H.264/AAC with FFmpeg, and uploads a verified output to Drive.

## Safety boundaries

- Existing single-file ingestion and 9:16 Shorts rendering are unchanged.
- Originals are never deleted or edited.
- Preview mode (for example 180 seconds) saves inside the episode folder, not the auto-ingest root.
- Full mode (0 seconds) saves into the ingest root so the existing downstream workflow can discover the master.
- Mixed participant audio, missing audio, implausible duration, inadequate activity, single-camera timeline or invalid Drive permissions stop the run.
- Output name includes an input fingerprint (file IDs, sizes, modified timestamps). Duplicate runs skip existing output.
- OAuth access is issued only to GitHub OIDC on the approved main-branch workflow; no long-lived credentials are stored on GitHub.

## Usage

1. Deploy supabase/functions/video-multicam-worker-api to Billing Hub with verify_jwt=false; the function performs strict GitHub OIDC validation.
2. Run GitHub Actions > BTY Multi-Camera Render > Run workflow, supplying the episode folder ID and preview_seconds=180.
3. Or commit video-multicam-triggers/next.json to main with contents:
   {"folder_id":"<drive folder id>","preview_seconds":180}
4. Inspect the resulting preview MP4 in the episode folder, including cuts, audio continuity, overlaps and synchronization.
5. After preview quality passes, rerun the workflow with preview_seconds=0 to produce the complete master.

## Next phases

- New matching episode subfolders are discovered every four hours after the first real-world preview/full acceptance test. The scan processes one folder per run, skips already rendered source fingerprints, and ignores recordings imported before the initial activation cutoff. Manual triggering remains supported.
- Source microphones must be isolated. Mixed audio is rejected rather than assigning unreliable speakers.
- Shorts currently crop the edited master. Future revisions can render directly from the original cameras using a persisted speaker timeline.
- A future CRM edit UI should support manual speaker/camera overrides, per-shot previews and timeline regeneration.
- Until then, the speaker timeline is recomputed for every run.

## Components

- core.py: parse timestamps, derive voice activity, cut plan, render with FFmpeg, validate output.
- worker.py: GitHub OIDC, authenticated Drive transfers, prepare and complete.
- test_core.py: unit tests and a real two-color-camera FFmpeg integration test.
- .github/workflows/video-multicam-ci.yml: CI.
- .github/workflows/video-multicam-render.yml: controlled production workflow.

## Automatic folder discovery

GitHub Actions runs the render workflow every four hours on main, without manual credentials. The OIDC-authenticated API examines only direct episode subfolders of the configured Beyond The Yellow source root, requires exactly two named StreamYard local webcam recordings, and skips old recordings (before October 17, 2026 at 13:40 UTC) and already completed masters. Successful new masters return to the normal root and are consumed by the existing video pipeline. One episode is processed per scheduled run and duplicate filenames are not overwritten.

## Persisted speaker timeline

Every processed episode now writes a versioned JSON timeline alongside its preview/master MP4 in Drive. It records source IDs, participant names, join offsets, source fingerprint, and nonoverlapping speaker/camera shot intervals, allowing future 9:16 edits to reuse the same camera decisions. Repeating an existing successful render with no sidecar backfills only the timeline; it does not re-encode or overwrite the master video. This supports the first production episode, which was rendered before timeline persistence was introduced.

## Automatic guest-photo extraction (October 17, 2026)

Full-length multicamera jobs now select approximately 18 frames from the **guest's isolated webcam source** (never from the composite master), detect a single frontal face, reject blurred/dim/ambiguous frames, and crop the best unchanged frame to an 800×1000 JPEG. Frame timestamps and quality scores are recorded with the resulting CRM image reference. No generative face replacement or invented details are used.

- Saves once in the configured `ai_operations_video_settings.guest_image_folder_id` folder using a source fingerprint filename; does not overwrite any manual guest image.
- Attaches the Drive URL to `ai_operations_video_projects.guest_image_url` and fills `guest_name` only if absent, matching the project's *verified* edited-master Drive ID.
- When the image is saved before the Deepgram pipeline registers the project, an authenticated reconciliation pass on later scheduled renders attaches it.
- Includes full-master idempotent backfill: rerunning the same episode does not rerender the MP4 if the master and speaker timeline exist.
- Portrait extraction failures do **not** invalidate the finished video. Failed face-quality checks leave the image unset for manual review; the worker returns a `guest_portrait.manual_fallback` result.
- Three-minute previews do not auto-publish a guest image. Manually selected portraits are never overwritten.

Code: `guest_portrait.py` (frame quality/cropping), `worker.py` (selection and Drive upload), and `video-multicam-worker-api` (OAuth permissions, strict ID validation, metadata and CRM update). Synthetic unit tests run under `video-multicam-ci.yml`.
