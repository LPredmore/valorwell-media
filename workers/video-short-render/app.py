import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
GITHUB_OIDC_TOKEN = os.environ.get("GITHUB_OIDC_TOKEN", "")
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/tmp/video-short-render"))
API_URL = f"{SUPABASE_URL}/functions/v1/video-render-worker-api"
CHUNK = 8 * 1024 * 1024
MAX_JOBS_PER_RUN = int(os.environ.get("MAX_JOBS_PER_RUN", "50"))
MAX_RUN_SECONDS = int(os.environ.get("MAX_RUN_SECONDS", "6000"))


def worker_id() -> str:
    return f"github-short-{socket.gethostname()}-{os.getpid()}"


def refresh_github_oidc_token() -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
    if not request_url or not request_token:
        raise RuntimeError("GitHub OIDC refresh environment is unavailable.")

    separator = "&" if "?" in request_url else "?"
    r = requests.get(
        f"{request_url}{separator}audience=valorwell-video-worker",
        headers={"authorization": f"bearer {request_token}"},
        timeout=30,
    )
    data = r.json() if r.content else {}
    if not r.ok or not data.get("value"):
        raise RuntimeError(f"GitHub OIDC refresh failed ({r.status_code}): {data}")
    return str(data["value"])


def api(action: str, wid: str, **payload: Any) -> dict[str, Any]:
    global GITHUB_OIDC_TOKEN

    if not GITHUB_OIDC_TOKEN:
        GITHUB_OIDC_TOKEN = refresh_github_oidc_token()

    for attempt in range(2):
        r = requests.post(
            API_URL,
            headers={
                "authorization": f"Bearer {GITHUB_OIDC_TOKEN}",
                "content-type": "application/json",
            },
            json={"action": action, "worker_id": wid, **payload},
            timeout=120,
        )
        data = r.json() if r.content else {}
        if r.status_code == 401 and attempt == 0:
            GITHUB_OIDC_TOKEN = refresh_github_oidc_token()
            continue
        if not r.ok:
            raise RuntimeError(f"API {action} failed ({r.status_code}): {data}")
        return data

    raise RuntimeError(f"API {action} failed after GitHub OIDC refresh.")


def drive_token(wid: str) -> str:
    data = api("drive_token", wid)
    token = str(data.get("google_access_token") or "")
    if not token:
        raise RuntimeError("No Google Drive token returned.")
    return token


def download_http(url: str, path: Path) -> None:
    if not url:
        raise RuntimeError("Short source URL is missing.")
    with requests.get(url, stream=True, timeout=(30, 600)) as r:
        r.raise_for_status()
        with path.open("wb") as f:
            for chunk in r.iter_content(CHUNK):
                if chunk:
                    f.write(chunk)
    if path.stat().st_size <= 0:
        raise RuntimeError("Downloaded Short source is empty.")


def ffprobe(path: Path) -> dict[str, Any]:
    p = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration:stream=codec_type,width,height",
            "-of", "json", str(path),
        ],
        capture_output=True, text=True, check=True,
    )
    return json.loads(p.stdout)


def render_short(
    source: Path,
    output: Path,
    expected_duration: float,
    cold_open_start: float | None = None,
    cold_open_end: float | None = None,
) -> tuple[bool, float]:
    source_info = ffprobe(source)
    has_audio = any(s.get("codec_type") == "audio" for s in source_info.get("streams", []))

    cold_start = float(cold_open_start) if cold_open_start is not None else None
    cold_end = float(cold_open_end) if cold_open_end is not None else None
    cold_duration = 0.0
    cold_enabled = False
    if cold_start is not None and cold_end is not None:
        candidate_duration = cold_end - cold_start
        cold_enabled = (
            cold_start >= -0.05
            and cold_end <= expected_duration + 0.05
            and 1.999 <= candidate_duration <= 6.001
            and expected_duration + candidate_duration < 180
        )
        if cold_enabled:
            cold_start = max(0.0, cold_start)
            cold_end = min(expected_duration, cold_end)
            cold_duration = max(0.0, cold_end - cold_start)

    base_filter = (
        "[0:v]split=2[bgsrc][fgsrc];"
        "[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,gblur=sigma=30[bg];"
        "[fgsrc]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[base]"
    )

    if cold_enabled:
        video_filter = (
            base_filter
            + f";[base]split=2[hookbase][mainbase]"
            + f";[hookbase]trim=start={cold_start:.6f}:end={cold_end:.6f},"
              "setpts=PTS-STARTPTS[hookv]"
            + ";[mainbase]setpts=PTS-STARTPTS[mainv]"
        )
        if has_audio:
            filter_complex = (
                video_filter
                + f";[0:a:0]asplit=2[hooka0][maina0]"
                + f";[hooka0]atrim=start={cold_start:.6f}:end={cold_end:.6f},"
                  "asetpts=PTS-STARTPTS[hooka]"
                + ";[maina0]asetpts=PTS-STARTPTS[maina]"
                + ";[hookv][hooka][mainv][maina]concat=n=2:v=1:a=1[v][a]"
            )
            maps = ["-map", "[v]", "-map", "[a]"]
        else:
            filter_complex = (
                video_filter
                + ";[hookv][mainv]concat=n=2:v=1:a=0[v]"
            )
            maps = ["-map", "[v]"]
    else:
        filter_complex = base_filter
        maps = ["-map", "[base]", "-map", "0:a:0?"]

    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-y",
        "-i", str(source),
        "-filter_complex", filter_complex,
        *maps,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(output),
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError("FFmpeg failed: " + p.stderr[-3000:])

    info = ffprobe(output)
    videos = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
    if not videos:
        raise RuntimeError("Rendered output has no video stream.")

    v = videos[0]
    if int(v.get("width") or 0) != 1080 or int(v.get("height") or 0) != 1920:
        raise RuntimeError(
            f"Rendered output is {v.get('width')}x{v.get('height')}, expected 1080x1920."
        )

    final_expected_duration = expected_duration + (cold_duration if cold_enabled else 0.0)
    actual = float((info.get("format") or {}).get("duration") or 0)
    if final_expected_duration > 0 and abs(actual - final_expected_duration) > max(
        1.5, final_expected_duration * 0.03
    ):
        raise RuntimeError(
            "Rendered duration mismatch: "
            f"expected {final_expected_duration:.3f}s, got {actual:.3f}s."
        )

    return cold_enabled, cold_duration


def safe_name(value: str) -> str:
    bad = '<>:"/\\|?*'
    for ch in bad:
        value = value.replace(ch, "_")
    return " ".join(value.split()).strip(" .")[:150] or "video"


def find_drive_file(folder_id: str, name: str, token: str) -> dict[str, Any] | None:
    escaped = name.replace("'", "\\'")
    q = f"'{folder_id}' in parents and name = '{escaped}' and trashed = false"
    r = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        headers={"authorization": f"Bearer {token}"},
        params={"q": q, "pageSize": "10", "fields": "files(id,name,size,webViewLink,mimeType)"},
        timeout=60,
    )
    if r.status_code == 401:
        return {"_unauthorized": True}
    r.raise_for_status()
    files = r.json().get("files") or []
    return files[0] if files else None


def upload_drive(path: Path, folder_id: str, name: str, token: str, wid: str) -> tuple[str, str, int, str]:
    existing = find_drive_file(folder_id, name, token)
    if existing and existing.get("_unauthorized"):
        token = drive_token(wid)
        existing = find_drive_file(folder_id, name, token)

    if existing:
        file_id = str(existing["id"])
        init_url = (
            f"https://www.googleapis.com/upload/drive/v3/files/{file_id}"
            "?uploadType=resumable&fields=id,name,size,webViewLink,mimeType"
        )
        method = requests.patch
        metadata = {"name": name}
    else:
        init_url = (
            "https://www.googleapis.com/upload/drive/v3/files"
            "?uploadType=resumable&fields=id,name,size,webViewLink,mimeType"
        )
        method = requests.post
        metadata = {"name": name, "parents": [folder_id]}

    size = path.stat().st_size
    init = method(
        init_url,
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": "video/mp4",
            "x-upload-content-length": str(size),
        },
        json=metadata,
        timeout=60,
    )
    if init.status_code == 401:
        token = drive_token(wid)
        init = method(
            init_url,
            headers={
                "authorization": f"Bearer {token}",
                "content-type": "application/json; charset=UTF-8",
                "x-upload-content-type": "video/mp4",
                "x-upload-content-length": str(size),
            },
            json=metadata,
            timeout=60,
        )
    init.raise_for_status()

    location = init.headers.get("Location")
    if not location:
        raise RuntimeError("Drive returned no resumable upload URL.")

    with path.open("rb") as f:
        put = requests.put(
            location,
            headers={
                "content-type": "video/mp4",
                "content-length": str(size),
                "content-range": f"bytes 0-{size-1}/{size}",
            },
            data=f,
            timeout=(30, 900),
        )
    put.raise_for_status()
    result = put.json()
    file_id = str(result["id"])
    web = str(result.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view")
    return file_id, web, int(result.get("size") or size), token


def main() -> dict[str, Any]:
    wid = worker_id()
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

    started = time.monotonic()
    claimed_total = 0
    rendered = 0
    failures: list[dict[str, Any]] = []
    stop_reason = "queue_empty"

    while claimed_total < MAX_JOBS_PER_RUN:
        if time.monotonic() - started >= MAX_RUN_SECONDS:
            stop_reason = "time_budget"
            break

        claim = api("claim", wid)
        jobs = list(claim.get("jobs") or [])
        if not jobs:
            stop_reason = "queue_empty"
            break

        project = dict(claim["project"])
        folder_id = str(claim["output_folder_id"])
        token = str(claim["google_access_token"])
        source_base = safe_name(Path(str(project.get("source_file_name") or "video")).stem)
        job_ids = [int(j["job_id"]) for j in jobs]
        claimed_total += len(jobs)

        with tempfile.TemporaryDirectory(prefix="short-render-", dir=WORKSPACE_ROOT) as tmp:
            root = Path(tmp)

            for job in jobs:
                api("heartbeat", wid, job_ids=job_ids)
                job_id = int(job["job_id"])
                clip_id = str(job["clip_id"])
                start = float(job["start_seconds"])
                end = float(job["end_seconds"])
                expected_duration = max(0.05, end - start)
                source_url = str(job.get("source_url") or "")
                cold_open_enabled = bool(job.get("cold_open_enabled"))
                cold_open_start = (
                    float(job["cold_open_start_seconds"])
                    if cold_open_enabled and job.get("cold_open_start_seconds") is not None
                    else None
                )
                cold_open_end = (
                    float(job["cold_open_end_seconds"])
                    if cold_open_enabled and job.get("cold_open_end_seconds") is not None
                    else None
                )
                start_ms = round(start * 1000)
                end_ms = round(end * 1000)

                source = root / f"{clip_id}-source.mp4"
                output = root / f"{clip_id}.mp4"
                name = f"{source_base}__short_9x16__{start_ms}-{end_ms}__{clip_id[:8]}.mp4"

                try:
                    download_http(source_url, source)
                    cold_open_applied, cold_open_duration = render_short(
                        source,
                        output,
                        expected_duration,
                        cold_open_start=cold_open_start,
                        cold_open_end=cold_open_end,
                    )
                    file_id, file_url, size, token = upload_drive(
                        output, folder_id, name, token, wid
                    )
                    api(
                        "complete",
                        wid,
                        job_id=job_id,
                        clip_id=clip_id,
                        drive_file_id=file_id,
                        drive_file_url=file_url,
                        output_size_bytes=size,
                        cold_open_applied=cold_open_applied,
                        cold_open_duration_seconds=cold_open_duration,
                    )
                    rendered += 1
                except Exception as exc:
                    failures.append({"job_id": job_id, "clip_id": clip_id, "error": str(exc)})
                    try:
                        api("fail", wid, job_id=job_id, clip_id=clip_id, error=str(exc))
                    except Exception:
                        pass

    if claimed_total >= MAX_JOBS_PER_RUN:
        stop_reason = "job_limit"

    if claimed_total == 0 and not failures:
        action = "idle"
    elif failures:
        action = "partial"
    elif stop_reason == "queue_empty":
        action = "drained"
    else:
        action = "limit_reached"

    return {
        "ok": not failures,
        "action": action,
        "stop_reason": stop_reason,
        "claimed": claimed_total,
        "rendered": rendered,
        "failed": len(failures),
        "failures": failures,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if result.get("ok") else 1)
