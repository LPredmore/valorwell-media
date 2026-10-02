import hmac
import json
import logging
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("valorwell-video-worker")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVER_KEY = os.environ.get("SUPABASE_SERVER_KEY", "")
GITHUB_OIDC_TOKEN = os.environ.get("GITHUB_OIDC_TOKEN", "")
WAKE_TOKEN = os.environ.get("WAKE_TOKEN", "")
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/workspace"))
API_URL = f"{SUPABASE_URL}/functions/v1/video-concat-worker-api" if SUPABASE_URL else ""
CHUNK_SIZE = 8 * 1024 * 1024
DOWNLOAD_CHUNK_SIZE = 8 * 1024 * 1024
HEARTBEAT_BYTES = 64 * 1024 * 1024


class PermanentJobError(RuntimeError):
    pass


class RetryableJobError(RuntimeError):
    pass


def worker_id() -> str:
    return f"{socket.gethostname()}-{os.getpid()}"


def api_call(action: str, wid: str, **payload: Any) -> dict[str, Any]:
    if not API_URL:
        raise RuntimeError("SUPABASE_URL is required.")
    if SUPABASE_SERVER_KEY:
        auth_headers = {"apikey": SUPABASE_SERVER_KEY}
    elif GITHUB_OIDC_TOKEN:
        auth_headers = {"authorization": f"Bearer {GITHUB_OIDC_TOKEN}"}
    else:
        raise RuntimeError(
            "Either SUPABASE_SERVER_KEY or GITHUB_OIDC_TOKEN is required."
        )
    body = {"action": action, "worker_id": wid, **payload}
    response = requests.post(
        API_URL,
        headers={
            **auth_headers,
            "content-type": "application/json",
        },
        json=body,
        timeout=60,
    )
    try:
        data = response.json()
    except ValueError:
        data = {"error": response.text[:500]}
    if not response.ok:
        raise RetryableJobError(
            f"Worker API {action} failed ({response.status_code}): {data.get('error', data)}"
        )
    return data


def heartbeat(
    wid: str,
    job_id: int,
    phase: str,
    percent: float | None = None,
    **extra: Any,
) -> None:
    progress: dict[str, Any] = {"phase": phase}
    if percent is not None:
        progress["percent"] = max(0, min(100, round(percent, 2)))
    progress.update(extra)
    api_call("heartbeat", wid, job_id=job_id, progress=progress)


def refresh_drive_token(wid: str, job_id: int) -> str:
    data = api_call("drive_token", wid, job_id=job_id)
    token = str(data.get("google_access_token") or "")
    if not token:
        raise RetryableJobError("Worker API did not return a Google Drive access token.")
    return token


def drive_headers(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


def download_drive_file(
    wid: str,
    job_id: int,
    file_id: str,
    destination: Path,
    token: str,
    expected_size: int | None,
    total_expected: int,
    bytes_before: int,
) -> tuple[str, int]:
    encoded_id = requests.utils.quote(file_id, safe="")
    url = f"https://www.googleapis.com/drive/v3/files/{encoded_id}?alt=media"
    destination.parent.mkdir(parents=True, exist_ok=True)
    last_heartbeat = 0

    for attempt in range(1, 4):
        mode = "ab" if destination.exists() else "wb"
        existing = destination.stat().st_size if destination.exists() else 0
        headers = drive_headers(token)
        if existing:
            headers["Range"] = f"bytes={existing}-"

        try:
            with requests.get(url, headers=headers, stream=True, timeout=(30, 300)) as response:
                if response.status_code == 401:
                    token = refresh_drive_token(wid, job_id)
                    continue
                if response.status_code not in (200, 206):
                    detail = response.text[:500]
                    if response.status_code in (403, 404):
                        raise PermanentJobError(
                            f"Drive download failed for {file_id}: "
                            f"HTTP {response.status_code} {detail}"
                        )
                    raise RetryableJobError(
                        f"Drive download failed for {file_id}: "
                        f"HTTP {response.status_code} {detail}"
                    )

                if response.status_code == 200 and existing:
                    mode = "wb"
                    existing = 0

                downloaded = existing
                with destination.open(mode) as handle:
                    for chunk in response.iter_content(chunk_size=DOWNLOAD_CHUNK_SIZE):
                        if not chunk:
                            continue
                        handle.write(chunk)
                        downloaded += len(chunk)

                        if downloaded - last_heartbeat >= HEARTBEAT_BYTES:
                            combined = bytes_before + downloaded
                            percent = (
                                combined / total_expected * 65
                                if total_expected > 0
                                else None
                            )
                            heartbeat(
                                wid,
                                job_id,
                                "downloading",
                                percent,
                                current_file=file_id,
                                bytes_downloaded=combined,
                                bytes_total=total_expected,
                            )
                            last_heartbeat = downloaded

            actual = destination.stat().st_size
            if expected_size is not None and expected_size > 0 and actual != expected_size:
                if attempt < 3:
                    continue
                raise RetryableJobError(
                    f"Drive download size mismatch for {file_id}: "
                    f"expected {expected_size}, got {actual}."
                )
            return token, actual

        except PermanentJobError:
            raise
        except (requests.RequestException, OSError) as exc:
            if attempt >= 3:
                raise RetryableJobError(
                    f"Drive download failed for {file_id}: {exc}"
                ) from exc
            time.sleep(2 * attempt)

    raise RetryableJobError(f"Drive download failed for {file_id} after retries.")


def run_json(cmd: list[str]) -> dict[str, Any]:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise PermanentJobError(
            f"Command failed ({proc.returncode}): {' '.join(cmd[:2])}: "
            f"{proc.stderr[-1500:]}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise PermanentJobError(f"Invalid JSON from {' '.join(cmd[:2])}.") from exc


def probe(path: Path) -> dict[str, Any]:
    return run_json([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        (
            "format=duration:"
            "stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,"
            "r_frame_rate,time_base,sample_rate,channels,channel_layout"
        ),
        "-of",
        "json",
        str(path),
    ])


def stream_signature(info: dict[str, Any]) -> dict[str, Any]:
    streams = info.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video:
        raise PermanentJobError("Input does not contain a video stream.")

    return {
        "video": {
            "codec_name": video.get("codec_name"),
            "profile": video.get("profile"),
            "level": video.get("level"),
            "width": video.get("width"),
            "height": video.get("height"),
            "pix_fmt": video.get("pix_fmt"),
            "r_frame_rate": video.get("r_frame_rate"),
        },
        "audio": None
        if audio is None
        else {
            "codec_name": audio.get("codec_name"),
            "sample_rate": audio.get("sample_rate"),
            "channels": audio.get("channels"),
            "channel_layout": audio.get("channel_layout"),
        },
    }


def duration_seconds(info: dict[str, Any]) -> float:
    try:
        return float((info.get("format") or {}).get("duration") or 0)
    except (TypeError, ValueError):
        return 0.0


def validate_compatible(probes: list[dict[str, Any]]) -> dict[str, Any]:
    baseline = stream_signature(probes[0])
    mismatches: list[dict[str, Any]] = []

    for index, info in enumerate(probes[1:], start=2):
        signature = stream_signature(info)
        if signature != baseline:
            mismatches.append(
                {
                    "input_position": index,
                    "expected": baseline,
                    "actual": signature,
                }
            )

    if mismatches:
        raise PermanentJobError(
            "STREAM_MISMATCH: lossless concatenation requires compatible "
            "video/audio streams. "
            + json.dumps(mismatches, separators=(",", ":"))[:2500]
        )
    return baseline


def concat_lossless(inputs: list[Path], output: Path, workspace: Path) -> None:
    manifest = workspace / "concat.txt"
    with manifest.open("w", encoding="utf-8") as handle:
        for path in inputs:
            escaped = str(path).replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")

    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostdin",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(manifest),
            "-map",
            "0",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    if proc.returncode != 0:
        raise PermanentJobError("FFMPEG_CONCAT_FAILED: " + proc.stderr[-3000:])


def drive_search(
    folder_id: str,
    name: str,
    token: str,
) -> dict[str, Any] | None:
    escaped_folder = folder_id.replace("'", "\\'")
    escaped_name = name.replace("'", "\\'")
    params = {
        "q": (
            f"'{escaped_folder}' in parents and "
            f"name = '{escaped_name}' and trashed = false"
        ),
        "pageSize": "10",
        "fields": "files(id,name,size,mimeType,webViewLink)",
    }
    response = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        params=params,
        headers=drive_headers(token),
        timeout=60,
    )
    if response.status_code == 401:
        return {"_unauthorized": True}
    if not response.ok:
        raise RetryableJobError(
            f"Drive search failed ({response.status_code}): {response.text[:500]}"
        )
    files = (response.json() or {}).get("files") or []
    return files[0] if files else None


def start_resumable_upload(
    file_path: Path,
    folder_id: str,
    name: str,
    token: str,
    existing_id: str | None,
) -> tuple[str, str]:
    if existing_id:
        encoded_id = requests.utils.quote(existing_id, safe="")
        url = (
            "https://www.googleapis.com/upload/drive/v3/files/"
            f"{encoded_id}?uploadType=resumable"
            "&fields=id,name,size,mimeType,webViewLink"
        )
        method = requests.patch
        metadata = {"name": name}
    else:
        url = (
            "https://www.googleapis.com/upload/drive/v3/files"
            "?uploadType=resumable&fields=id,name,size,mimeType,webViewLink"
        )
        method = requests.post
        metadata = {"name": name, "parents": [folder_id]}

    response = method(
        url,
        headers={
            **drive_headers(token),
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": "video/mp4",
            "x-upload-content-length": str(file_path.stat().st_size),
        },
        json=metadata,
        timeout=60,
    )
    if response.status_code == 401:
        return "", "unauthorized"
    if not response.ok:
        raise RetryableJobError(
            "Drive resumable-upload initialization failed "
            f"({response.status_code}): {response.text[:500]}"
        )

    session_url = response.headers.get("Location", "")
    if not session_url:
        raise RetryableJobError(
            "Drive resumable-upload initialization returned no session URL."
        )
    return session_url, ""


def upload_resumable(
    wid: str,
    job_id: int,
    file_path: Path,
    folder_id: str,
    name: str,
    token: str,
    overwrite: bool,
) -> tuple[str, dict[str, Any]]:
    existing = drive_search(folder_id, name, token)
    if existing and existing.get("_unauthorized"):
        token = refresh_drive_token(wid, job_id)
        existing = drive_search(folder_id, name, token)

    if existing and not overwrite:
        raise PermanentJobError(
            f"OUTPUT_EXISTS: '{name}' already exists in the destination folder."
        )

    existing_id = str(existing.get("id")) if existing else None
    session_url, status = start_resumable_upload(
        file_path,
        folder_id,
        name,
        token,
        existing_id,
    )

    if status == "unauthorized":
        token = refresh_drive_token(wid, job_id)
        session_url, _ = start_resumable_upload(
            file_path,
            folder_id,
            name,
            token,
            existing_id,
        )

    total = file_path.stat().st_size
    sent = 0

    with file_path.open("rb") as handle:
        while sent < total:
            handle.seek(sent)
            chunk = handle.read(min(CHUNK_SIZE, total - sent))
            end = sent + len(chunk) - 1

            for attempt in range(1, 4):
                try:
                    response = requests.put(
                        session_url,
                        headers={
                            **drive_headers(token),
                            "content-length": str(len(chunk)),
                            "content-range": f"bytes {sent}-{end}/{total}",
                            "content-type": "video/mp4",
                        },
                        data=chunk,
                        timeout=(30, 300),
                    )

                    if response.status_code == 401:
                        token = refresh_drive_token(wid, job_id)
                        continue

                    if response.status_code == 308:
                        remote_range = response.headers.get("Range", "")
                        if remote_range.startswith("bytes=0-"):
                            sent = int(remote_range.split("-")[-1]) + 1
                        else:
                            sent = end + 1
                        break

                    if response.ok:
                        sent = total
                        result = response.json()
                        heartbeat(
                            wid,
                            job_id,
                            "complete_upload",
                            99,
                            bytes_uploaded=sent,
                            bytes_total=total,
                        )
                        return token, result

                    if response.status_code in (403, 404):
                        raise PermanentJobError(
                            f"Drive upload failed ({response.status_code}): "
                            f"{response.text[:500]}"
                        )

                    if attempt == 3:
                        raise RetryableJobError(
                            f"Drive upload failed ({response.status_code}): "
                            f"{response.text[:500]}"
                        )
                    time.sleep(2 * attempt)

                except PermanentJobError:
                    raise
                except requests.RequestException as exc:
                    if attempt == 3:
                        raise RetryableJobError(
                            f"Drive upload failed: {exc}"
                        ) from exc
                    time.sleep(2 * attempt)

            heartbeat(
                wid,
                job_id,
                "uploading",
                85 + (sent / total * 14 if total else 0),
                bytes_uploaded=sent,
                bytes_total=total,
            )

    raise RetryableJobError(
        "Drive resumable upload ended without a completed response."
    )


def process_one_job() -> dict[str, Any]:
    wid = worker_id()
    claim = api_call("claim", wid)
    job = claim.get("job")
    if not job:
        return {"ok": True, "action": "idle"}

    job_id = int(job["id"])
    token = str(claim.get("google_access_token") or "")

    if not token:
        api_call(
            "fail",
            wid,
            job_id=job_id,
            retryable=True,
            error="No Google Drive access token returned at claim time.",
        )
        raise RetryableJobError(
            "No Google Drive access token returned at claim time."
        )

    inputs = list(job.get("inputs") or [])
    output = dict(job.get("output") or {})

    if len(inputs) < 2:
        api_call(
            "fail",
            wid,
            job_id=job_id,
            retryable=False,
            error="concat_video requires at least two inputs.",
        )
        raise PermanentJobError("concat_video requires at least two inputs.")

    if output.get("concat_policy") != "preserve":
        api_call(
            "fail",
            wid,
            job_id=job_id,
            retryable=False,
            error="Only concat_policy=preserve is currently implemented.",
        )
        raise PermanentJobError(
            "Only concat_policy=preserve is currently implemented."
        )

    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    workspace = Path(
        tempfile.mkdtemp(prefix=f"concat-{job_id}-", dir=WORKSPACE_ROOT)
    )

    try:
        total_expected = sum(int(item.get("size_bytes") or 0) for item in inputs)
        downloaded_before = 0
        paths: list[Path] = []

        heartbeat(wid, job_id, "downloading", 0, input_count=len(inputs))

        for index, item in enumerate(inputs, start=1):
            suffix = Path(
                str(item.get("drive_file_name") or "")
            ).suffix or ".mp4"
            path = workspace / f"input_{index:03d}{suffix}"
            expected_size = int(item.get("size_bytes") or 0) or None

            token, actual_size = download_drive_file(
                wid,
                job_id,
                str(item["drive_file_id"]),
                path,
                token,
                expected_size,
                total_expected,
                downloaded_before,
            )
            downloaded_before += actual_size
            paths.append(path)

        heartbeat(wid, job_id, "probing", 68)
        probes = [probe(path) for path in paths]
        source_signature = validate_compatible(probes)
        expected_duration = sum(duration_seconds(info) for info in probes)

        output_path = workspace / "output.mp4"
        heartbeat(wid, job_id, "concatenating", 72)
        concat_lossless(paths, output_path, workspace)

        heartbeat(wid, job_id, "validating", 80)
        output_probe = probe(output_path)
        output_signature = stream_signature(output_probe)
        output_duration = duration_seconds(output_probe)

        if output_signature != source_signature:
            raise PermanentJobError(
                "OUTPUT_VALIDATION_FAILED: output codecs/stream parameters "
                "differ from the inputs."
            )

        tolerance = max(2.0, expected_duration * 0.005)
        if (
            expected_duration > 0
            and abs(output_duration - expected_duration) > tolerance
        ):
            raise PermanentJobError(
                "OUTPUT_VALIDATION_FAILED: output duration differs from the "
                "sum of inputs by more than "
                f"{tolerance:.2f}s (expected {expected_duration:.3f}, "
                f"got {output_duration:.3f})."
            )

        heartbeat(wid, job_id, "uploading", 85)
        _, drive_result = upload_resumable(
            wid,
            job_id,
            output_path,
            str(output["folder_id"]),
            str(output["file_name"]),
            token,
            bool(output.get("overwrite", False)),
        )

        drive_file_id = str(drive_result.get("id") or "")
        if not drive_file_id:
            raise RetryableJobError(
                "Drive upload completed without a file ID."
            )

        web_view = str(
            drive_result.get("webViewLink")
            or f"https://drive.google.com/file/d/{drive_file_id}/view"
        )

        result = {
            "drive_file_id": drive_file_id,
            "drive_file_url": web_view,
            "output_file_name": str(output["file_name"]),
            "output_folder_id": str(output["folder_id"]),
            "output_size_bytes": output_path.stat().st_size,
            "duration_seconds": round(output_duration, 3),
            "input_count": len(paths),
            "processing_mode": "stream_copy",
            "video_codec": source_signature["video"].get("codec_name"),
            "audio_codec": (
                source_signature["audio"].get("codec_name")
                if source_signature.get("audio")
                else None
            ),
        }

        api_call("complete", wid, job_id=job_id, result=result)
        return {
            "ok": True,
            "action": "complete",
            "job_id": job_id,
            "result": result,
        }

    except PermanentJobError as exc:
        log.exception("Permanent concat failure for job %s", job_id)
        api_call(
            "fail",
            wid,
            job_id=job_id,
            retryable=False,
            error=str(exc),
        )
        return {
            "ok": False,
            "action": "error",
            "job_id": job_id,
            "error": str(exc),
        }

    except Exception as exc:
        log.exception("Retryable concat failure for job %s", job_id)
        try:
            api_call(
                "fail",
                wid,
                job_id=job_id,
                retryable=True,
                error=str(exc),
            )
        except Exception:
            log.exception("Could not report failure for job %s", job_id)

        return {
            "ok": False,
            "action": "retry_or_error",
            "job_id": job_id,
            "error": str(exc),
        }

    finally:
        shutil.rmtree(workspace, ignore_errors=True)


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "valorwell-video-ffmpeg-worker",
            "ffmpeg": shutil.which("ffmpeg") is not None,
            "ffprobe": shutil.which("ffprobe") is not None,
        }
    )


@app.post("/wake")
def wake():
    if not WAKE_TOKEN:
        return jsonify({"error": "WAKE_TOKEN is not configured."}), 503

    supplied = request.headers.get("x-wake-token", "")
    if not hmac.compare_digest(supplied, WAKE_TOKEN):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        return jsonify(process_one_job())
    except Exception as exc:
        log.exception("Worker wake failed")
        return jsonify({"error": str(exc)}), 500
