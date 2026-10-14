"""Prepare compact audio files for Beyond the Yellow transcription.

Runs only within the existing OIDC-authorized video-short-render-worker workflow.
Original videos remain in Google Drive, unchanged.
"""
import json
import os
import socket
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import requests

BASE = os.environ["SUPABASE_URL"].rstrip("/")
API = BASE + "/functions/v1/video-audio-prep-api"
ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/tmp/video-transcription-audio"))
CHUNK = 8 * 1024 * 1024
OIDC = os.environ.get("GITHUB_OIDC_TOKEN", "")


def oidc_token() -> str:
    req_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    sep = "&" if "?" in req_url else "?"
    r = requests.get(
        req_url + sep + "audience=valorwell-video-worker",
        headers={"authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]},
        timeout=30,
    )
    r.raise_for_status()
    value = r.json().get("value")
    if not value:
        raise RuntimeError("GitHub OIDC token missing.")
    return str(value)


def call(action: str, worker: str, **details: Any) -> dict[str, Any]:
    global OIDC
    if not OIDC:
        OIDC = oidc_token()
    for attempt in range(2):
        r = requests.post(API, json={"action": action, "worker_id": worker, **details},
                          headers={"authorization": "Bearer " + OIDC}, timeout=120)
        if r.status_code == 401 and attempt == 0:
            OIDC = oidc_token()
            continue
        data = r.json() if r.content else {}
        if not r.ok:
            raise RuntimeError(f"Audio API {action} HTTP {r.status_code}: {data}")
        return data
    raise RuntimeError(f"Audio API {action} authentication rejected.")


def google_request(method: str, url: str, token: str, **kwargs: Any) -> requests.Response:
    headers = dict(kwargs.pop("headers", {}))
    headers["authorization"] = "Bearer " + token
    return requests.request(method, url, headers=headers, timeout=(30, 900), **kwargs)


def download_video(file_id: str, token: str, path: Path, expected: int) -> None:
    url = "https://www.googleapis.com/drive/v3/files/" + file_id
    # Direct streaming from Google Drive in GitHub Actions: no Supabase streaming lifetime.
    with google_request("GET", url, token, params={"alt": "media"}, stream=True) as r:
        r.raise_for_status()
        with path.open("wb") as handle:
            for chunk in r.iter_content(CHUNK):
                if chunk:
                    handle.write(chunk)
    size = path.stat().st_size
    if size < 1 or (expected > 0 and size != expected):
        raise RuntimeError(f"Source download size mismatch: {size} vs {expected}.")


def extract_audio(source: Path, target: Path) -> None:
    # 48 kbit/s mono MP3 is typically <25 MB per one-hour recording.
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-map", "0:a:0", "-vn", "-ac", "1",
        "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", str(target),
    ], check=True, timeout=1800)
    if not target.exists() or target.stat().st_size < 1000:
        raise RuntimeError("FFmpeg produced no transcription audio.")


def drive_folder(parent: str, token: str) -> str:
    name = "BTY - Transcription Audio"
    q = f"'{parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '{name}' and trashed = false"
    url = "https://www.googleapis.com/drive/v3/files"
    r = google_request("GET", url, token, params={"q": q, "fields": "files(id,name)", "pageSize": 10})
    r.raise_for_status()
    files = r.json().get("files") or []
    if files:
        return str(files[0]["id"])
    r = google_request("POST", url, token, json={
        "name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent]
    }, params={"fields": "id"})
    r.raise_for_status()
    return str(r.json()["id"])


def upload_audio(path: Path, folder: str, name: str, token: str) -> tuple[str, int]:
    meta_url = "https://www.googleapis.com/drive/v3/files"
    q_name = name.replace("'", "\\'")
    q = f"'{folder}' in parents and name = '{q_name}' and trashed = false"
    existing = google_request("GET", meta_url, token, params={
        "q": q, "fields": "files(id,size,mimeType)", "pageSize": 10
    })
    existing.raise_for_status()
    size = path.stat().st_size
    for file in existing.json().get("files") or []:
        if file.get("mimeType") == "audio/mpeg" and int(file.get("size") or 0) == size:
            return str(file["id"]), size

    init = google_request(
        "POST", "https://www.googleapis.com/upload/drive/v3/files", token,
        params={"uploadType": "resumable", "fields": "id,size,mimeType"},
        headers={"content-type": "application/json; charset=UTF-8",
                 "x-upload-content-type": "audio/mpeg",
                 "x-upload-content-length": str(size)},
        json={"name": name, "parents": [folder]},
    )
    init.raise_for_status()
    location = init.headers.get("Location")
    if not location:
        raise RuntimeError("Google Drive did not supply upload session URL.")
    with path.open("rb") as handle:
        upload = requests.put(
            location, data=handle,
            headers={"content-type": "audio/mpeg", "content-length": str(size),
                     "content-range": f"bytes 0-{size-1}/{size}"},
            timeout=(30, 1200),
        )
    upload.raise_for_status()
    file = upload.json()
    if int(file.get("size") or size) != size:
        raise RuntimeError("Uploaded audio size mismatch.")
    return str(file["id"]), size


def main() -> None:
    worker = f"github-transcription-{socket.gethostname()}-{os.getpid()}"
    ROOT.mkdir(parents=True, exist_ok=True)
    # One source per workflow run to limit resource use and preserve scheduling capacity.
    data = call("claim", worker)
    project = data.get("project")
    if not project:
        print(json.dumps({"ok": True, "action": "idle"}))
        return
    project_id = str(project["id"])
    try:
        token = str(data["google_access_token"])
        name = Path(str(project.get("source_file_name") or "recording")).stem
        safe = "".join(ch if ch.isalnum() or ch in " -_" else "_" for ch in name)[:100]
        with tempfile.TemporaryDirectory(prefix="bty-audio-", dir=ROOT) as directory:
            root = Path(directory)
            original = root / "source.mp4"
            audio = root / "transcription.mp3"
            download_video(str(project["source_file_id"]), token, original,
                           int(project.get("source_size_bytes") or 0))
            extract_audio(original, audio)
            # Get a fresh token before the upload if the initial 1+ GB download was slow.
            token = str(call("drive_token", worker, project_id=project_id)["google_access_token"])
            folder = drive_folder(str(project["source_folder_id"]), token)
            audio_id, size = upload_audio(
                audio, folder, f"{safe}__transcription__{project_id[:8]}.mp3", token
            )
            completed = call("complete", worker, project_id=project_id,
                             drive_file_id=audio_id, output_size_bytes=size)
            print(json.dumps({"ok": True, "action": "prepared", "project_id": project_id,
                              "bytes": size, "result": completed}))
    except Exception as exc:
        try:
            call("fail", worker, project_id=project_id, error=str(exc))
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
