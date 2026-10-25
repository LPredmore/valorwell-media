# Multi-guest BTY thumbnail identities

## Implementation and deployment

The image dispatcher previously treated the guest-pair image as Image A and described
Scott and Karolyn by position. It now obtains one approved image per guest from
`ai_operations_video_project_guests`, labels each image by name, and enforces the
identity rules in both art direction and the final image-model request.

Apply `supabase/migrations/20261025100208_multi_guest_thumbnail_identity.sql` to
**Billing Hub (`ahqauomkgflopxgnlndd`)**, then deploy both changed Edge Functions
from this GitHub commit:

```bash
supabase functions deploy video-multicam-worker-api --project-ref ahqauomkgflopxgnlndd --no-verify-jwt
supabase functions deploy video-thumbnail-generation-dispatcher --project-ref ahqauomkgflopxgnlndd --no-verify-jwt
```

Do not use an unqualified `supabase db push`: this repository's legacy config.toml
names a different project. Apply the reviewed migration through the Supabase
migration tool to the explicit Billing Hub project. The migration fails if the
expected queue CHECK or claim-function anchor is absent; investigate contract drift
instead of skipping those checks.

Merge the GitHub workflow only after the migration and API deployment. The new
`video-guest-references.yml` workflow uses the existing repository OIDC trust
boundary, a restricted action allowlist, and a separate concurrency group. It
claims one extraction job every 15 minutes or on manual dispatch. The migration
backfills guest *names*, never approves a legacy combined portrait. Single-guest
reference selection is unchanged.

## Identity and review contract

Names come from `metadata.thumbnail_required_guests`, otherwise the existing
`guest_name` group split on `and` / `&`. Existing guest rows, `guest_count`, and
`thumbnail_subject_mode=guest_pair` also identify multi-guest projects. Ambiguous
rosters fail closed. Store aliases in each guest's `speaker_aliases` JSON array.
Use explicit full names for groups with ambiguous separators.

The extractor samples 24 frames per registered source, uses dlib HOG detections
and 128-dimensional face embeddings, and clusters with a conservative 0.45
complete-link threshold. A portrait needs at least three corroborating frames,
quality >= 0.65, a logistic detector-margin score >= 0.8, and a crop excluding other
detected faces. Scores are **heuristics, not calibrated probabilities**. Thresholds
need evaluation on real episode footage before treating automatic approvals as a
likeness-quality guarantee. Tests exercise clustering/assignment logic, not an
accuracy benchmark of the detector.

A name can be assigned automatically only when an exact guest name/alias matches
the source's speaker label and that source has one unambiguous cluster. A shared
camera needs an **operator-verified** anchor per guest. Never infer names from
cluster order, left/right position, clothes, or a combined photograph alone.

```sql
-- After inspecting the ACTUAL source frame, record normalized x,y,width,height.
-- Use parameters; do not paste illustrative coordinates as verified evidence.
update public.ai_operations_video_project_guests
set reference_evidence = reference_evidence || jsonb_build_object(
  'identity_anchor', jsonb_build_object(
    'source_file_id', :verified_source_file_id,
    'time_seconds', :verified_timestamp_seconds,
    'bbox', :verified_normalized_face_box::jsonb
  )
)
where id = :verified_guest_id;
```

A failed assignment or low-quality extraction creates an idempotent CRM task
assigned to the existing active info@valorwell.org tenant member. Task creation
must succeed before the extraction job records a manual-review result. The task
asks for independently verified portraits or anchors. Creating or completing the
task does **not** unblock thumbnails: all guest records must be approved.

Manual reference approval (service/operator SQL only): set each guest's own
`reference_image_file_id`, `reference_image_url`, `reference_source_type='manual'`,
`reference_evidence` containing verification evidence, and
`reference_status='approved'`. Never use the same asset for two people. The table
and worker RPCs deny `anon` / `authenticated` access; there is no new public upload
or approval surface. API completion verifies the uploaded JPEG's name, destination,
size and registered source, and approves the full roster in one transaction.

Reference edits invalidate full covers, Parts, Shorts and unapproved publication
thumbnail pointers, cancel old image jobs, and increment generation revisions.
The queue snapshots the current manifest, strips stale uploaded-image checkpoints,
and skips incomplete projects before selecting a claim. The dispatcher checks again
before spending on image generation. Multi-guest results apply atomically against
the current manifest, lease and asset revision, preventing stale workers from
replacing corrected thumbnails. Old Drive assets are retained for recovery.

## Horsemanship for Heroes remediation

Verified project: `fc80db51-ef89-47ab-9715-1d17ca9bd41a`.
Verified source episode folder: `1CnO3-E9wNoEnznDM_t6JvUhY1RhhVmhh`.
The project already declares Scott Hooper and Karolyn Hooper, both required on
full/Part/Short artwork. Its registered source IDs are
`12owYsjkqGMhBNASYZrn33FnqEWbeqIss` and `1euFNZMTQxZBSFkOWiMP6-WPTNbz8jXXb`.
The guest camera is shared; do not assume its filename maps each face individually.

After deployment, run the checked-in remediation SQL through Supabase with the
explicit Billing Hub project. It saves the old asset pointers, queues extraction,
and cancels old pending thumbnail jobs. It does not delete Drive files or publish
anything. Then dispatch extraction:

```bash
gh workflow run video-guest-references.yml --repo LPredmore/valorwell-media --ref main
```

If assignment is ambiguous, inspect the source footage, record verified anchors
(or provide verified individual portraits), and retry only that extraction job:

```sql
update public.ai_operations_video_jobs
set status='queued', attempts=0, available_at=now(), claimed_by=null, claimed_at=null,
    lease_expires_at=null, completed_at=null, updated_at=now()
where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a'
  and job_type='extract_guest_reference_images'
  and status in ('complete','error');
```

Once both guests are approved, the established workflow reconciler/image dispatcher
regenerates the full cover, Parts and Shorts. The SQL includes readiness/asset queries.
Check every resulting image visually against Scott's and Karolyn's references,
including every vertical Short, before approving publication. This change updates
project/clip artifacts and draft/ready/approved publication pointers. It does not
silently upload replacement artwork to already-published YouTube videos. Those
need the existing account's publication process and, for Shorts, its existing
platform capability gate.

## Dependency audit and side effects

The inspected live database has no guest table. It has the generic workflow-job
enqueue function, a separate direct clip-thumbnail enqueue function, the shared
claim RPC, project/clip thumbnail invalidation triggers, CRM task constraints and
profile-based task ownership. The migration preserves the existing job-type list
and claim behavior, adding a gate before claim selection and a trigger covering
all image-job insertion paths. The captured claim fixture is from the inspected
pre-change database; the isolated test is a scoped contract test, not a full replay
of the shared production schema.

| Consumer | Dependency / change | Risk and verification |
| --- | --- | --- |
| `video-thumbnail-generation-dispatcher/index.ts` + `guest-identity.ts` | Reads service-only guest manifest; downloads individual images; applies with atomic RPC | High: paid generation and asset replacement. Prompt, queue, stale-apply and type checks. |
| `video-multicam-worker-api/index.ts` + `guest-reference-jobs.ts` | Restricted OIDC extraction actions; registered Drive sources; verified JPEG completion | High: privileged worker boundary. Exact repository/workflow/ref checks retained; client RPC denial tested. |
| `workers/video-multicam/guest_references.py` + `guest_reference_worker.py` | Real source-frame clustering, per-guest mapping/upload, durable CRM fallback | High: wrong identity risk. No name guessing; partial/missing/ambiguous clusters block; manual review. |
| `.github/workflows/video-guest-references.yml` | Scheduled extraction on existing GitHub runner/OIDC infrastructure | Medium: runtime/download/CPU cost; one leased job and bounded concurrency. |
| Shared SQL claim/enqueue RPCs | Image-job readiness and per-reference fingerprint; single-guest hashes preserved | High: shared queue starvation. Isolated PostgreSQL claim and single-guest tests. |
| Existing project/clip triggers and reconciler | New reference edits clear images/increment revisions; existing enqueue/reconcile rebuilds them | Medium: temporary missing artwork during correction. Old assets retained; scoped regeneration. |
| CRM `crm_tasks`, `profiles`, `tenant_memberships` | One open identity-review task per project; existing owner and enum values | Medium: task persistence/permission failure. Fails visibly; idempotency test. |
| `video-bty-text-dispatcher/index.ts` / `speaker-identity.ts` | Writes group speaker creative metadata; unchanged. Image-level multi-guest rule overrides singular poses. | Low: creative text may remain singular; final hard prompt explicitly overrides it. Existing speaker tests. |
| `video-cloudflare-render-dispatcher`, `video-render-worker-api`, existing multicam render worker | Read project/source IDs; unchanged. Extraction does not alter source video or render plans. | Low: new worker uses its own job type/concurrency. Existing FFmpeg tests. |
| CRM `social-media-manager/handlers/{library,thumbnails,thumbnail-edit,series,publications}.ts` and YouTube publisher | Existing artifact/publication consumers; no schema/type change for current columns | Medium: old publication pointers cleared only for draft/ready/approved. No automatic publication/release. |

Inspected both `LPredmore/valorwell-media` and `LPredmore/valorwell-crm`, including
AGENTS.md in CRM. Neither repository exposes this new table through generated
client types; worker code uses the existing untyped service Supabase client, so
client-type regeneration is unnecessary. No changes to auth, payments, source
video, transcripts, or the Shorts upload capability gate. RLS is enabled with
service-only grants on the new table and service-only public worker RPCs.

Deploy additively: database gate first, API and image worker second, scheduled
extractor third. A rollback should retain the blocking database gate and per-guest
records; disable the new extraction workflow to stop extra work. Do not restore
the old combined-image dispatcher for a multi-guest episode. Old asset pointers
are retained in the remediation metadata for explicit operator recovery.

## Verification commands

```bash
python -m unittest discover -s workers/video-multicam -p 'test_*.py' -v
npm test
npm run build
npx deno@2.9.6 check --node-modules-dir=auto \
  supabase/functions/video-thumbnail-generation-dispatcher/index.ts \
  supabase/functions/video-multicam-worker-api/index.ts
```

For an isolated PostgreSQL migration/queue test without touching a live database:

```bash
validation_dir=$(mktemp -d)
npm install --prefix "$validation_dir" --save-exact @electric-sql/pglite@0.5.11
PGLITE_MODULE="$validation_dir/node_modules/@electric-sql/pglite/dist/index.js" \
  node scripts/test-multi-guest-queue.mjs
```

The existing `npm ci` fails because package.json and package-lock.json are out of
sync on the base branch. For local verification use
`npm install --package-lock=false --ignore-scripts --no-audit --no-fund`; this PR
does not replace the application's dependency lockfile.
