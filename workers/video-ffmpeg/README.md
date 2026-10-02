# ValorWell cloud FFmpeg worker

This worker processes `concat_video` jobs from the Billing Hub Supabase project and writes the finished MP4 directly back to Google Drive.

## Safety contract

- Default and currently supported policy is `concat_policy=preserve`.
- Inputs are probed with `ffprobe`.
- Incompatible video/audio streams fail with `STREAM_MISMATCH`; the worker never silently transcodes.
- FFmpeg uses `-c copy`.
- The output is probed again and duration/codecs are validated before upload.
- Google Drive uses resumable upload.
- Working files live only on Cloud Run ephemeral disk.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVER_KEY` — backend-only Supabase secret key or legacy service-role key
- `WAKE_TOKEN` — random secret required by `POST /wake`
- `WORKSPACE_ROOT=/workspace` (recommended)

Do not commit any values for these variables.

## Endpoints

- `GET /health`
- `POST /wake` with `x-wake-token: <WAKE_TOKEN>`

Each wake processes at most one queued concat job. Concurrency should remain 1 unless the queue-claim semantics are intentionally revisited.

## Recommended Cloud Run shape

- second-generation execution environment
- 1 vCPU
- 2 GiB memory
- concurrency 1
- min instances 0
- max instances 1 initially
- 10 GiB ephemeral disk mounted at `/workspace`
- request timeout 3600s

The source files and final file stay in Google Drive; Supabase stores only job metadata.
