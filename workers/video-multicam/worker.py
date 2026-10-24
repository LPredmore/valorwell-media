"""GitHub Actions worker: Drive episode folder -> verified speaker-switched MP4."""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

import requests

from core import align_bins, choose_shots, ffmpeg_master, parse_source, probe, validate_activity, voice_bins
from guest_portrait import select_portrait

API = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/functions/v1/video-multicam-worker-api"
GATE_API = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/functions/v1/video-bty-nightly-gate"
_CLAIMED_EPISODE: dict = {}
FOLDER_ID = os.environ.get("SOURCE_FOLDER_ID", "").strip()
PREVIEW = int(os.environ.get("PREVIEW_SECONDS", "0") or "0")
ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/tmp/bty-multicam"))
CHUNK = 8 * 1024 * 1024
_OIDC = ""
_GOOGLE_TOKEN = ""


def oidc() -> str:
    global _OIDC
    if _OIDC:
        return _OIDC
    url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "")
    token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
    if not url or not token:
        raise RuntimeError("GitHub OIDC credentials unavailable")
    response = requests.get(
        url + ("&" if "?" in url else "?") + "audience=valorwell-video-worker",
        headers={"authorization": "bearer " + token}, timeout=30,
    )
    response.raise_for_status()
    _OIDC = str(response.json()["value"])
    return _OIDC


def api(action: str, **extra: object) -> dict:
    global _OIDC, _GOOGLE_TOKEN
    payload = {"action": action, "folder_id": FOLDER_ID,
               "preview_seconds": PREVIEW, **extra}
    for _ in range(2):
        response = requests.post(
            API, json=payload, headers={"authorization": "Bearer " + oidc()},
            timeout=120,
        )
        if response.status_code == 401:
            _OIDC = ""
            continue
        result = response.json()
        if not response.ok:
            raise RuntimeError("Multi-camera API " + action + ": " + str(result.get("error")))
        if "google_access_token" in result:
            _GOOGLE_TOKEN = str(result["google_access_token"])
        return result
    raise RuntimeError("GitHub worker identity rejected")


def episode_gate(action: str, **details: object) -> dict:
    """Use the GitHub workload identity to atomically claim and track one episode."""
    global _OIDC
    for attempt in range(2):
        response = requests.post(
            GATE_API,
            json={"action": action, **details},
            headers={"authorization": "Bearer " + oidc()},
            timeout=120,
        )
        if response.status_code == 401 and attempt == 0:
            _OIDC = ""
            continue
        response.raise_for_status()
        result = response.json()
        if not result.get("ok"):
            raise RuntimeError("Episode gate refused " + action)
        return result
    raise RuntimeError("Episode gate identity rejected")


def token() -> str:
    global _GOOGLE_TOKEN
    if not _GOOGLE_TOKEN:
        api("drive_token")
    return _GOOGLE_TOKEN


def fetch_source(item: dict, path: Path) -> None:
    global _GOOGLE_TOKEN
    source_id = str(item["id"])
    if not re.fullmatch(r"[a-zA-Z0-9_-]{10,150}", source_id):
        raise ValueError("Invalid source ID")
    url = "https://www.googleapis.com/drive/v3/files/" + source_id
    expected = int(item["size"])
    for attempt in range(7):
        size = path.stat().st_size if path.exists() else 0
        if size == expected:
            return
        headers = {"authorization": "Bearer " + token()}
        if size:
            headers["Range"] = "bytes=" + str(size) + "-"
        try:
            with requests.get(url, params={"alt": "media"}, headers=headers,
                              stream=True, timeout=(30, 300)) as response:
                if response.status_code == 401:
                    _GOOGLE_TOKEN = ""
                    continue
                if response.status_code not in (200, 206):
                    response.raise_for_status()
                if size and response.status_code == 200:
                    size = 0  # A server may ignore Range: replace, never append.
                with path.open("ab" if size else "wb") as handle:
                    for chunk in response.iter_content(chunk_size=CHUNK):
                        if chunk:
                            handle.write(chunk)
            if path.stat().st_size == expected:
                return
        except (requests.RequestException, OSError):
            if attempt == 6:
                raise
    raise RuntimeError("Drive source download incomplete: " + source_id)


def upload(path: Path, name: str, folder: str, sources: list[dict]) -> str:
    global _GOOGLE_TOKEN
    size = path.stat().st_size
    if size < 100000:
        raise ValueError("Rendered MP4 is unexpectedly small")
    meta = {"name": name, "parents": [folder], "mimeType": "video/mp4",
            "description": "BTY multi-camera master. Input Drive IDs: " +
                           ", ".join(str(s["id"]) for s in sources)}
    for _ in range(2):
        response = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "resumable", "fields": "id,size,name"},
            headers={"authorization": "Bearer " + token(),
                     "content-type": "application/json; charset=UTF-8",
                     "x-upload-content-type": "video/mp4",
                     "x-upload-content-length": str(size)},
            json=meta, timeout=60,
        )
        if response.status_code == 401:
            _GOOGLE_TOKEN = ""
            continue
        response.raise_for_status()
        break
    else:
        raise RuntimeError("Drive upload authorization failed")
    location = response.headers.get("Location")
    if not location or not location.startswith("https://"):
        raise RuntimeError("Missing resumable Google Drive upload session")
    pos = 0
    with path.open("rb") as file:
        while pos < size:
            file.seek(pos)
            chunk = file.read(min(CHUNK, size - pos))
            if not chunk:
                raise RuntimeError("Unexpected EOF while uploading")
            end = pos + len(chunk) - 1
            headers = {"content-type": "video/mp4",
                       "content-length": str(len(chunk)),
                       "content-range": f"bytes {pos}-{end}/{size}"}
            for attempt in range(4):
                try:
                    r = requests.put(location, data=chunk, headers=headers, timeout=(30, 300))
                    if r.status_code in (200, 201):
                        result = r.json()
                        if str(result.get("id") or "") and int(result.get("size") or size) == size:
                            return str(result["id"])
                        raise RuntimeError("Drive upload verification failed")
                    if r.status_code == 308:
                        matched = re.search(r"bytes=0-(\d+)", r.headers.get("Range", ""))
                        pos = int(matched.group(1)) + 1 if matched else end + 1
                        break
                    if r.status_code < 500 and r.status_code != 429:
                        r.raise_for_status()
                except requests.RequestException:
                    if attempt == 3:
                        raise
            else:
                raise RuntimeError("Drive resumable upload failed repeatedly")
    raise RuntimeError("Google Drive upload completed without final ID")


def find_drive_file(folder: str, name: str) -> str | None:
    global _GOOGLE_TOKEN
    q = "'" + folder + "' in parents and name = '" + name.replace("'", "\\'") + "' and trashed = false"
    for _ in range(2):
        response = requests.get(
            "https://www.googleapis.com/drive/v3/files",
            headers={"authorization": "Bearer " + token()},
            params={"q": q, "fields": "files(id,mimeType,size)", "pageSize": "10"},
            timeout=60,
        )
        if response.status_code == 401:
            _GOOGLE_TOKEN = ""
            continue
        response.raise_for_status()
        items = [x for x in response.json().get("files", [])
                 if x.get("mimeType") == "application/json" and int(x.get("size") or 0) > 0]
        return str(items[0]["id"]) if items else None
    raise RuntimeError("Unable to query existing speaker timeline")


def upload_timeline(payload: dict, folder: str, name: str) -> str:
    global _GOOGLE_TOKEN
    existing = find_drive_file(folder, name)
    if existing:
        return existing
    data = json.dumps(payload, sort_keys=True, indent=2).encode("utf-8")
    if len(data) > 10 * 1024 * 1024:
        raise ValueError("Speaker timeline exceeds upload limit")
    metadata = json.dumps({
        "name": name, "parents": [folder], "mimeType": "application/json",
        "description": "Machine-generated BTY two-camera shot timeline and source metadata",
    }).encode("utf-8")
    boundary = "btystreamyardtimeline2026"
    body = (
        b"--" + boundary.encode() + b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
        metadata + b"\r\n--" + boundary.encode() +
        b"\r\nContent-Type: application/json\r\n\r\n" + data +
        b"\r\n--" + boundary.encode() + b"--\r\n"
    )
    for _ in range(2):
        response = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "multipart", "fields": "id,size,mimeType"},
            headers={"authorization": "Bearer " + token(),
                     "content-type": "multipart/related; boundary=" + boundary},
            data=body, timeout=120,
        )
        if response.status_code == 401:
            _GOOGLE_TOKEN = ""
            continue
        response.raise_for_status()
        result = response.json()
        if not result.get("id") or result.get("mimeType") != "application/json":
            raise RuntimeError("Speaker timeline upload was not confirmed")
        return str(result["id"])
    raise RuntimeError("Speaker timeline upload not authorized")



def upload_guest_jpeg(path: Path, filename: str, folder: str) -> str:
    """Upload a small JPEG to the configured guest-image Drive folder."""
    global _GOOGLE_TOKEN
    content = path.read_bytes()
    if not 20000 <= len(content) <= 8 * 1024 * 1024:
        raise ValueError("Invalid guest image file size")
    boundary = "btyguestportrait20261017"
    metadata = json.dumps({
        "name": filename, "parents": [folder], "mimeType": "image/jpeg",
        "description": "Original still selected from the guest webcam recording",
    }).encode("utf-8")
    body = (
        b"--" + boundary.encode() +
        b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
        metadata + b"\r\n--" + boundary.encode() +
        b"\r\nContent-Type: image/jpeg\r\n\r\n" +
        content + b"\r\n--" + boundary.encode() + b"--\r\n"
    )
    for _ in range(2):
        response = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "multipart", "fields": "id,size,mimeType,name"},
            headers={"authorization": "Bearer " + token(),
                     "content-type": "multipart/related; boundary=" + boundary},
            data=body, timeout=150,
        )
        if response.status_code == 401:
            _GOOGLE_TOKEN = ""
            continue
        response.raise_for_status()
        result = response.json()
        if (result.get("id") and result.get("mimeType") == "image/jpeg" and
                int(result.get("size") or 0) == len(content) and
                result.get("name") == filename):
            return str(result["id"])
        raise RuntimeError("Guest image upload failed Drive verification")
    raise RuntimeError("Guest image upload unauthorized")


def ensure_guest_portrait(job: dict, available_sources: dict[str, Path] | None = None) -> dict:
    """Fail open: portrait failure must not damage a successful episode render."""
    if PREVIEW:
        return {"skipped": "preview"}
    try:
        prepared = api("guest_image_prepare")
        if not prepared.get("needed"):
            return {"skipped": prepared.get("reason", "not_needed"),
                    "attached": bool(prepared.get("attached"))}
        source = dict(prepared["guest_source"])
        source_id = str(source["id"])
        source_file = (available_sources or {}).get(source_id)
        with tempfile.TemporaryDirectory(prefix="bty-guest-portrait-", dir=ROOT) as directory:
            if source_file is None:
                source_file = Path(directory) / "guest-source.mp4"
                fetch_source(source, source_file)
                if source_file.stat().st_size != int(source["size"]):
                    raise RuntimeError("Guest source download failed size check")
            duration = probe(source_file)["duration"]
            image = Path(directory) / "guest-portrait.jpg"
            selection = select_portrait(source_file, image, duration)
            file_id = upload_guest_jpeg(
                image, str(prepared["output_name"]), str(prepared["output_folder_id"])
            )
            completion = api(
                "guest_image_complete", image_id=file_id,
                selected_time_seconds=selection["selected_time_seconds"],
                quality_score=selection["quality_score"],
                evaluated_candidates=selection["evaluated_candidates"],
            )
            return {
                "image_file_id": file_id, "attached": completion.get("attached"),
                "pending_project": completion.get("pending_project"),
                "selected_time_seconds": selection["selected_time_seconds"],
                "evaluated_candidates": selection["evaluated_candidates"],
            }
    except Exception as exc:
        # Existing rendering/upload success remains intact; a curator can
        # provide the image manually if no reliable source frame was found.
        return {"portrait_error": str(exc)[:350], "manual_fallback": True}


def main() -> dict:
    global FOLDER_ID, PREVIEW
    # Reconcile earlier successfully uploaded guest photos with projects
    # registered by the delayed transcription/ingest pipeline.
    try:
        api("guest_image_reconcile")
    except Exception:
        pass  # Portraits are optional; rendering must stay available.
    if FOLDER_ID.upper() == "AUTO":
        FOLDER_ID = ""
    if not FOLDER_ID:
        candidate = episode_gate("discover")
        if not candidate.get("found") or not candidate.get("folder_id"):
            return {"ok": True, "skipped": "no_new_paired_episode"}
        FOLDER_ID = str(candidate["folder_id"])
        PREVIEW = 0
        # Make the discovered episode available to subsequent workflow steps.
        env_file = os.environ.get("GITHUB_ENV", "")
        if env_file:
            with open(env_file, "a", encoding="utf-8") as output:
                output.write("SOURCE_FOLDER_ID=" + FOLDER_ID + "\n")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{10,150}", FOLDER_ID):
        raise ValueError("Specify a valid SOURCE_FOLDER_ID")
    if not 0 <= PREVIEW <= 600:
        raise ValueError("PREVIEW_SECONDS must be 0 (full) or 1-600")
    job = api("prepare")
    if not PREVIEW and job.get("existing"):
        pending = episode_gate(
            "pending", folder_id=FOLDER_ID, fingerprint=str(job["fingerprint"])
        )
        if pending.get("pending"):
            if pending.get("research_status") != "complete":
                researched = episode_gate(
                    "research", episode_id=pending["episode_id"],
                    fingerprint=str(job["fingerprint"]),
                    sources=list(job["sources"]),
                    organization_name=re.sub(
                        r"-multicam-master-[a-f0-9]{12}\.mp4$", "",
                        str(job["output_name"])
                    ).replace("_", " "),
                )
                if researched.get("status") != "complete":
                    raise RuntimeError("Previously rendered episode needs verified intake review")
            portrait = ensure_guest_portrait(job)
            return {"ok": True, "skipped": "existing_master_intake_reconciled",
                    "drive_file_id": job["existing"]["id"],
                    "guest_portrait": portrait}
    if not PREVIEW and not job.get("existing"):
        sources = list(job["sources"])
        fingerprint = str(job["fingerprint"])
        organization = re.sub(
            r"-multicam-master-[a-f0-9]{12}\.mp4$", "",
            str(job["output_name"])
        ).replace("_", " ")
        claim = episode_gate(
            "claim", folder_id=FOLDER_ID, fingerprint=fingerprint,
            organization_name=organization, sources=sources
        )
        if not claim.get("claimed"):
            return {"ok": True, "skipped": "episode_already_active_or_processed",
                    "reason": claim.get("reason"), "state": claim.get("status")}
        _CLAIMED_EPISODE.update({
            "folder_id": FOLDER_ID,
            "fingerprint": fingerprint,
            "episode_id": claim["id"],
        })
        research = episode_gate(
            "research", episode_id=claim["id"], fingerprint=fingerprint,
            sources=sources, organization_name=organization
        )
        if research.get("status") != "complete":
            raise RuntimeError(
                "Verified organization intake incomplete; needs review before rendering"
            )
    timeline_name = str(job["output_name"]).removesuffix(".mp4") + ".timeline.json"
    timeline_file = find_drive_file(str(job["output_folder_id"]), timeline_name)
    if job.get("existing") and timeline_file:
        ROOT.mkdir(parents=True, exist_ok=True)
        portrait = ensure_guest_portrait(job)
        return {"ok": True, "skipped": "identical_output_and_timeline_already_exist",
                "drive_file_id": job["existing"]["id"], "timeline_file_id": timeline_file,
                "guest_portrait": portrait}
    sources = list(job["sources"])
    if len(sources) != 2 or any(parse_source(x["name"])["speaker"] != x["speaker"] for x in sources):
        raise ValueError("Manifest speaker mapping is invalid")
    expected_size = sum(int(x["size"]) for x in sources)
    free = shutil.disk_usage(ROOT.parent if ROOT.parent.exists() else "/tmp").free
    if expected_size * 2.3 > free:
        raise RuntimeError("Insufficient disk for two camera sources and rendered output")
    ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="multicam-", dir=ROOT) as directory:
        tmp = Path(directory)
        files = [tmp / f"source-{i}.mp4" for i in range(2)]
        for source, path in zip(sources, files):
            fetch_source(source, path)
            if path.stat().st_size != int(source["size"]):
                raise ValueError("Source size mismatch")
        probes = [probe(x) for x in files]
        offsets = tuple(float(x["offset"]) for x in sources)
        # Both camera views must be available throughout the selected range.
        duration = min(off + info["duration"] for off, info in zip(offsets, probes))
        if PREVIEW:
            duration = min(duration, PREVIEW)
        duration = math.floor(duration * 10) / 10
        if duration <= max(offsets) + 5:
            raise ValueError("Insufficient overlapping source duration")
        count = round(duration / 0.1)
        activities = []
        for i, (file, source) in enumerate(zip(files, sources)):
            raw = voice_bins(file, tmp / f"speaker-{i}.pcm", max_seconds=duration)
            activities.append(align_bins(raw, float(source["offset"]), count))
        validate_activity(*activities)
        shots = choose_shots(*activities)
        if len(shots) < 2:
            raise ValueError("Speaker timeline does not contain a verified camera change")
        if not timeline_file:
            timeline_file = upload_timeline({
                "schema_version": 1,
                "episode_duration_seconds": duration,
                "source_fingerprint": job["fingerprint"],
                "sources": [{"id": x["id"], "name": x["name"], "speaker": x["speaker"],
                             "offset_seconds": x["offset"]} for x in sources],
                "shots": shots,
                "method": "webrtcvad_20ms_100ms_bins_hold_1700ms",
                "preview": bool(job["is_preview"]),
            }, str(job["output_folder_id"]), timeline_name)
        if job.get("existing"):
            portrait = ensure_guest_portrait(job, {
                source["id"]: file for source, file in zip(sources, files)
            })
            return {"ok": True, "skipped": "master_already_exists_timeline_backfilled",
                    "drive_file_id": job["existing"]["id"], "guest_portrait": portrait,
                    "timeline_file_id": timeline_file, "speaker_segments": len(shots)}
        output = tmp / "master.mp4"
        ffmpeg_master(files[0], files[1], output, shots, offsets, duration)
        destination = upload(output, str(job["output_name"]),
                             str(job["output_folder_id"]), sources)
        confirmation = api("complete", output_id=destination)
        if _CLAIMED_EPISODE:
            marked = episode_gate(
                "rendered", folder_id=FOLDER_ID,
                fingerprint=_CLAIMED_EPISODE["fingerprint"],
                master_file_id=destination
            )
            if not marked.get("updated"):
                raise RuntimeError("Master uploaded but episode registry did not confirm it")
            _CLAIMED_EPISODE.clear()
        portrait = ensure_guest_portrait(job, {
            source["id"]: file for source, file in zip(sources, files)
        })
        return {"ok": True, "drive_file_id": destination,
                "timeline_file_id": timeline_file, "speaker_segments": len(shots),
                "duration_seconds": duration, "preview": bool(job["is_preview"]),
                "guest_portrait": portrait,
                "ready_for_normal_intake": confirmation.get("ready_for_normal_intake", False)}


if __name__ == "__main__":
    try:
        result = main()
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        if _CLAIMED_EPISODE:
            try:
                episode_gate(
                    "failed",
                    folder_id=_CLAIMED_EPISODE["folder_id"],
                    fingerprint=_CLAIMED_EPISODE["fingerprint"],
                    error=str(error)[:900],
                )
            except Exception:
                print("Episode registry failure callback was unavailable", file=sys.stderr)
        # Do not dump provider tokens or source URLs into GitHub Actions logs.
        print(json.dumps({"ok": False, "error": str(error)[:800]}), file=sys.stderr)
        sys.exit(1)
