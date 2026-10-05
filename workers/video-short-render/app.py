import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
GITHUB_OIDC_TOKEN = os.environ.get("GITHUB_OIDC_TOKEN", "")
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/tmp/valorwell-short-render"))
API_URL = f"{SUPABASE_URL}/functions/v1/video-render-worker-api" if SUPABASE_URL else ""
CHUNK_SIZE = 8 * 1024 * 1024


class RenderError(RuntimeError):
    pass


def worker_id() -> str:
    return f"github-short-{socket.gethostname()}-{os.getpid()}"


def api_call(action: str, wid: str, **payload: Any) -> dict[str, Any]:
    if not API_URL:
        raise RenderError("SUPABASE_URL is required.")
    if not GITHUB_OIDC_TOKEN:
        raise RenderError("GITHUB_OIDC_TOKEN is required.")

    response = requests.post(
        API_URL,
        headers={
            "authorization": f"Bearer {GITHUB_OIDC_TOKEN}",
            "content-type": "application/json",
        },
        json={"action": action, "worker_id": wid, **payload},
        timeout=90,
    )
    try:
        data = response.json()
    except ValueError:
        data = {"error": response.text[:800]}
    if not response.ok:
        raise RenderError(
            f"Worker API {action} failed ({response.status_code}): "
            f"{data.get('error', data)}"
        )
    return data


def refresh_drive_token(wid: str) -> str:
    data = api_call("drive_token", wid)
    token = str(data.get("google_access_token") or "")
    if not token:
        raise RenderError("Worker API returned no Google Drive access token.")
    return token


def heartbeat(wid: str, jobs: list[dict[str, Any]]) -> None:
    ids = [int(j["job_id"]) for j in jobs if j.get("job_id")]
    if not ids:
        return
    try:
        api_call("heartbeat", wid, job_ids=ids)
    except Exception as exc:
        print(f"Heartbeat warning: {exc}", file=sys.stderr)


def download_drive_file(
    wid: str,
    file_id: str,
    destination: Path,
    token: str,
    expected_size: int | None,
) -> str:
    url = f"https://www.googleapis.com/drive/v3/files/{requests.utils.quote(file_id, safe='')}?alt=media"
    destination.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(1, 5):
        existing = destination.stat().st_size if destination.exists() else 0
        headers = {"authorization": f"Bearer {token}"}
        if existing:
            headers["Range"] = f"bytes={existing}-"
        try:
            with requests.get(url, headers=headers, stream=True, timeout=(30, 300)) as response:
                if response.status_code == 401:
                    token = refresh_drive_token(wid)
                    continue
                if response.status_code not in (200, 206):
                    raise RenderError(
                        f"Drive source download failed ({response.status_code}): "
                        f"{response.text[:500]}"
                    )
                mode = "ab" if response.status_code == 206 and existing else "wb"
                with destination.open(mode) as handle:
                    for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                        if chunk:
                            handle.write(chunk)

            actual = destination.stat().st_size
            if expected_size and actual != expected_size:
                if attempt < 4:
                    time.sleep(attempt * 2)
                    continue
                raise RenderError(
                    f"Source size mismatch: expected {expected_size}, got {actual}."
                )
            return token
        except requests.RequestException as exc:
            if attempt == 4:
                raise RenderError(f"Drive source download failed: {exc}") from exc
            time.sleep(attempt * 2)

    raise RenderError("Drive source download failed after retries.")


def ffprobe(path: Path) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration:stream=codec_type,width,height",
            "-of", "json", str(path)
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RenderError(f"ffprobe failed: {proc.stderr[-1200:]}")
    return json.loads(proc.stdout)


def render_short(source: Path, output: Path, start: float, end: float) -> None:
    duration = end - start
    if start < 0 or duration <= 0 or duration >= 180:
        raise RenderError(
            f"Invalid Short boundaries: start={start}, end={end}, duration={duration}."
        )

    vf = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920"
    )
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostdin",
            "-y",
            "-ss", f"{start:.3f}",
            "-i", str(source),
            "-t", f"{duration:.3f}",
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "160k",
            "-movflags", "+faststart",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RenderError(f"FFmpeg render failed: {proc.stderr[-2500:]}")

    info = ffprobe(output)
    video = next(
        (s for s in info.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    if not video:
        raise RenderError("Rendered file contains no video stream.")
    if int(video.get("width") or 0) != 1080 or int(video.get("height") or 0) != 1920:
        raise RenderError(
            "Rendered file failed vertical validation: "
            f"{video.get('width')}x{video.get('height')}."
        )

    actual_duration = float((info.get("format") or {}).get("duration") or 0)
    if actual_duration <= 0 or abs(actual_duration - duration) > 1.0:
        raise RenderError(
            "Rendered duration failed validation: "
            f"expected {duration:.3f}s, got {actual_duration:.3f}s."
        )


def safe_name(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*]+', "_", value)
    value = re.sub(r"\s+", " ", value).strip().rstrip(". ")
    return (value[:150] or "video")


def output_name(source_name: str, clip_id: str, start: float, end: float) -> str:
    base = safe_name(re.sub(r"\.[^.]+$", "", source_name))
    return (
        f"{base}__short_9x16__{round(start * 1000)}-"
        f"{round(end * 1000)}__{clip_id[:8]}.mp4"
    )


def search_drive(folder_id: str, name: str, token: str) -> dict[str, Any] | None:
    q = (
        f"'{folder_id.replace(chr(39), chr(92)+chr(39))}' in parents and "
        f"name = '{name.replace(chr(39), chr(92)+chr(39))}' and trashed = false"
    )
    response = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        params={
            "q": q,
            "pageSize": "10",
            "fields": "files(id,name,size,mimeType,webViewLink)",
        },
        headers={"authorization": f"Bearer {token}"},
        timeout=60,
    )
    if response.status_code == 401:
        return {"_unauthorized": True}
    if not response.ok:
        raise RenderError(
            f"Drive search failed ({response.status_code}): {response.text[:500]}"
        )
    files = (response.json() or {}).get("files") or []
    return files[0] if files else None


def upload_drive(
    wid: str,
    path: Path,
    folder_id: str,
    name: str,
    token: str,
) -> tuple[str, dict[str, Any]]:
    existing = search_drive(folder_id, name, token)
    if existing and existing.get("_unauthorized"):
        token = refresh_drive_token(wid)
        existing = search_drive(folder_id, name, token)

    if existing:
        return token, existing

    size = path.stat().st_size
    init = requests.post(
        (
            "https://www.googleapis.com/upload/drive/v3/files"
            "?uploadType=resumable&fields=id,name,size,mimeType,webViewLink"
        ),
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": "video/mp4",
            "x-upload-content-length": str(size),
        },
        json={"name": name, "parents": [folder_id]},
        timeout=60,
    )
    if init.status_code == 401:
        token = refresh_drive_token(wid)
        return upload_drive(wid, path, folder_id, name, token)
    if not init.ok:
        raise RenderError(
            f"Drive upload initialization failed ({init.status_code}): {init.text[:500]}"
        )
    location = init.headers.get("Location")
    if not location:
        raise RenderError("Drive resumable upload returned no session URL.")

    with path.open("rb") as handle:
        uploaded = requests.put(
            location,
            headers={
                "content-type": "video/mp4",
                "content-length": str(size),
            },
            data=handle,
            timeout=(30, 600),
        )
    if uploaded.status_code == 401:
        token = refresh_drive_token(wid)
        return upload_drive(wid, path, folder_id, name, token)
    if not uploaded.ok:
        raise RenderError(
            f"Drive upload failed ({uploaded.status_code}): {uploaded.text[:500]}"
        )
    return token, uploaded.json()


def fail_job(wid: str, job: dict[str, Any], error: str) -> None:
    try:
        api_call(
            "fail",
            wid,
            job_id=int(job["job_id"]),
            clip_id=str(job["clip_id"]),
            error=error[:4000],
        )
    except Exception as exc:
        print(
            f"Could not report failure for job {job.get('job_id')}: {exc}",
            file=sys.stderr,
        )


def main() -> int:
    wid = worker_id()
    claim = api_call("claim", wid)
    jobs = list(claim.get("jobs") or [])
    if not jobs:
        print(json.dumps({"ok": True, "action": "idle"}))
        return 0

    project = dict(claim.get("project") or {})
    source_file_id = str(project.get("parent_file_id") or "")
    source_name = str(project.get("source_file_name") or "video.mp4")
    source_size = int(project.get("source_size_bytes") or 0) or None
    folder_id = str(claim.get("output_folder_id") or "")
    token = str(claim.get("google_access_token") or "")

    if not source_file_id or not folder_id or not token:
        error = "Claim response is missing source, destination, or Drive token."
        for job in jobs:
            fail_job(wid, job, error)
        raise RenderError(error)

    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="short-render-", dir=WORKSPACE_ROOT) as tmp:
        workspace = Path(tmp)
        source = workspace / "source.mp4"

        try:
            print(f"Downloading source {source_name} ({source_size or 'unknown'} bytes)...")
            token = download_drive_file(
                wid, source_file_id, source, token, source_size
            )
            heartbeat(wid, jobs)
        except Exception as exc:
            for job in jobs:
                fail_job(wid, job, str(exc))
            raise

        results: list[dict[str, Any]] = []
        failures: list[dict[str, Any]] = []

        for index, job in enumerate(jobs, start=1):
            clip_id = str(job["clip_id"])
            job_id = int(job["job_id"])
            start = float(job["start_seconds"])
            end = float(job["end_seconds"])
            name = output_name(source_name, clip_id, start, end)
            output = workspace / name

            print(
                f"[{index}/{len(jobs)}] Rendering job {job_id}, clip {clip_id}, "
                f"{start:.3f}-{end:.3f}..."
            )

            try:
                render_short(source, output, start, end)
                token, drive = upload_drive(wid, output, folder_id, name, token)

                drive_id = str(drive.get("id") or "")
                drive_url = str(
                    drive.get("webViewLink")
                    or f"https://drive.google.com/file/d/{drive_id}/view"
                )
                if not drive_id:
                    raise RenderError("Drive upload returned no file ID.")

                api_call(
                    "complete",
                    wid,
                    job_id=job_id,
                    clip_id=clip_id,
                    drive_file_id=drive_id,
                    drive_file_url=drive_url,
                    output_size_bytes=output.stat().st_size,
                )
                results.append(
                    {
                        "job_id": job_id,
                        "clip_id": clip_id,
                        "drive_file_id": drive_id,
                        "width": 1080,
                        "height": 1920,
                    }
                )
            except Exception as exc:
                fail_job(wid, job, str(exc))
                failures.append(
                    {"job_id": job_id, "clip_id": clip_id, "error": str(exc)}
                )
            finally:
                if output.exists():
                    output.unlink()

            heartbeat(wid, jobs)

        summary = {
            "ok": not failures,
            "action": "complete" if not failures else "partial",
            "project_id": project.get("id"),
            "completed": len(results),
            "failed": len(failures),
            "results": results,
            "failures": failures,
        }
        print(json.dumps(summary, indent=2, sort_keys=True))
        return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
