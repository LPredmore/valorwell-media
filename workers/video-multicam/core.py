"""Deterministic two-camera editor for StreamYard local participant recordings.

Pure editing logic is independent of Google Drive and Supabase; the worker owns I/O.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
import wave
from pathlib import Path

SAMPLE_RATE = 16000
BIN_SECONDS = 0.1
FRAME_MS = 20
NAME = re.compile(
    r"^(?P<episode>.+)-(?P<speaker>[^/]+?)-webcam-"
    r"(?P<h>\d+)h_(?P<m>\d+)m_(?P<s>\d+)s_(?P<ms>\d+)ms-StreamYard\.mp4$",
    re.IGNORECASE,
)


def parse_source(name: str) -> dict:
    match = NAME.fullmatch(name)
    if not match:
        raise ValueError("Unsupported StreamYard local recording filename: " + name)
    parts = match.groupdict()
    offset = (int(parts["h"]) * 3600 + int(parts["m"]) * 60 +
              int(parts["s"]) + int(parts["ms"]) / 1000.0)
    return {
        "episode": parts["episode"],
        "speaker": parts["speaker"].replace("_", " ").strip(),
        "offset": offset,
    }


def run(args: list[str], timeout: int = 10800) -> None:
    proc = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if proc.returncode:
        raise RuntimeError("FFmpeg failed: " + proc.stderr[-2400:])


def probe(path: Path) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_type,width,height,sample_rate",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(proc.stdout)
    if not any(s["codec_type"] == "video" for s in data.get("streams", [])):
        raise ValueError("Source contains no video: " + path.name)
    if not any(s["codec_type"] == "audio" for s in data.get("streams", [])):
        raise ValueError("Source contains no isolated audio: " + path.name)
    duration = float(data["format"]["duration"])
    if not 0.5 < duration < 12 * 3600:
        raise ValueError("Invalid recording duration")
    return {"duration": duration, "streams": data["streams"]}


def voice_bins(path: Path, pcm_path: Path, max_seconds: float | None = None) -> list[bool]:
    """Run WebRTC voice activity detection on local mic audio, 100ms time bins."""
    try:
        import webrtcvad
    except ImportError as exc:
        raise RuntimeError("Install webrtcvad-wheels for source-audio analysis") from exc
    run(["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y",
         "-i", str(path), *([] if max_seconds is None else ["-t", f"{max_seconds:.3f}"]),
         "-map", "0:a:0", "-vn", "-ac", "1",
         "-ar", str(SAMPLE_RATE), "-f", "s16le", str(pcm_path)])
    frame_bytes = SAMPLE_RATE * FRAME_MS // 1000 * 2
    data = pcm_path.read_bytes()
    vad = webrtcvad.Vad(2)
    raw = []
    for i in range(0, len(data) - frame_bytes + 1, frame_bytes):
        raw.append(vad.is_speech(data[i:i + frame_bytes], SAMPLE_RATE))
    # Majority over a 100 ms bin rejects isolated click / breath detections.
    frames_per_bin = round(BIN_SECONDS * 1000 / FRAME_MS)
    result = []
    for i in range(0, len(raw), frames_per_bin):
        sample = raw[i:i + frames_per_bin]
        result.append(sum(sample) >= max(2, math.ceil(len(sample) * 0.4)))
    return result


def align_bins(activity: list[bool], offset: float, length: int) -> list[bool]:
    """Translate source-relative activity to the episode's zero-based timeline."""
    aligned = [False] * length
    for i in range(length):
        source_t = (i + 0.5) * BIN_SECONDS - offset
        src = int(source_t / BIN_SECONDS)
        if 0 <= src < len(activity):
            aligned[i] = activity[src]
    return aligned


def choose_shots(a: list[bool], b: list[bool], min_hold: float = 1.7,
                 switch_delay: float = 0.35) -> list[dict]:
    """Generate stable, contiguous ranges from independent microphone activity.

    Overlapping speech and silence retain the existing shot. A sustained new
    speaker starts a cut only after a confidence window.
    """
    if len(a) != len(b) or not a:
        raise ValueError("Two equally long and nonempty activity vectors required")
    hold_bins = max(1, round(min_hold / BIN_SECONDS))
    evidence_bins = max(1, round(switch_delay / BIN_SECONDS))
    # Start on the first speaking participant, default to host when both quiet.
    selected = next((0 if x and not y else 1
                     for x, y in zip(a, b) if x != y), 0)
    boundaries = [(0, selected)]
    last_cut = 0
    pending = None
    pending_from = 0
    for i, (x, y) in enumerate(zip(a, b)):
        desired = (0 if x else 1) if x != y else selected
        if desired == selected:
            pending = None
            continue
        if pending != desired:
            pending = desired
            pending_from = i
        if i - pending_from + 1 >= evidence_bins and i - last_cut >= hold_bins:
            # Cut at confirmed speech onset, without moving backwards.
            cut = max(last_cut + hold_bins, pending_from)
            if cut < len(a):
                boundaries.append((cut, desired))
                selected = desired
                last_cut = cut
            pending = None
    shots = []
    for idx, (start, camera) in enumerate(boundaries):
        end = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(a)
        if end > start:
            shots.append({"start": round(start * BIN_SECONDS, 3),
                          "end": round(end * BIN_SECONDS, 3),
                          "camera": camera})
    return shots


def validate_activity(a: list[bool], b: list[bool]) -> None:
    if min(sum(a), sum(b)) < 20:
        raise ValueError("Insufficient voice activity in a source; refusing blind camera switching")
    both = sum(x and y for x, y in zip(a, b))
    either = sum(x or y for x, y in zip(a, b))
    if either and both / either > 0.85:
        raise ValueError("Participant audio is highly overlapping or mixed; cannot reliably identify speakers")


def ffmpeg_master(first: Path, second: Path, output: Path, shots: list[dict],
                  offsets: tuple[float, float], duration: float,
                  width: int = 1920, height: int = 1080) -> None:
    if not shots or len(shots) > 6000:
        raise ValueError("Invalid shot plan")
    if width <= 0 or height <= 0 or duration <= 0:
        raise ValueError("Invalid output dimensions or duration")
    if not math.isclose(shots[0]["start"], 0, abs_tol=0.11):
        raise ValueError("Shot plan must begin at zero")
    for i, shot in enumerate(shots):
        if shot["camera"] not in (0, 1) or shot["end"] <= shot["start"]:
            raise ValueError("Malformed camera segment")
        if i and abs(shots[i - 1]["end"] - shot["start"]) > 0.11:
            raise ValueError("Shot plan has a gap or overlap")
    if shots[-1]["end"] + 0.11 < duration:
        raise ValueError("Shot plan ends before media duration")

    def enabled(camera: int) -> str:
        ranges = [f"between(t,{x['start']:.3f},{min(duration, x['end']):.3f})"
                  for x in shots if x["camera"] == camera]
        return "+".join(ranges) if ranges else "0"

    # Background creates an unbroken clock, even when a participant joins late.
    filters = [f"color=c=black:s={width}x{height}:r=30:d={duration:.3f}[base]"]
    for idx, offset in enumerate(offsets):
        filters.append(
            f"[{idx}:v:0]fps=30,scale={width}:{height}:"
            "force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
            f"setsar=1,setpts=PTS-STARTPTS+{offset:.3f}/TB[v{idx}]"
        )
    filters.extend([
        f"[base][v0]overlay=eof_action=pass:repeatlast=0:shortest=0:"
        f"enable='{enabled(0)}'[layer]",
        f"[layer][v1]overlay=eof_action=pass:repeatlast=0:shortest=0:"
        f"enable='{enabled(1)}'[video]",
    ])
    for idx, offset in enumerate(offsets):
        delay = max(0, round(offset * 1000))
        filters.append(
            f"[{idx}:a:0]aresample=async=1:first_pts=0,"
            f"adelay={delay}:all=1[a{idx}]"
        )
    filters.append(
        "[a0][a1]amix=inputs=2:duration=longest:normalize=0,"
        "alimiter=limit=0.95[audio]"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-hide_banner", "-nostdin", "-y",
         "-i", str(first), "-i", str(second), "-filter_complex",
         ";".join(filters), "-map", "[video]", "-map", "[audio]",
         "-t", f"{duration:.3f}", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
         str(output)])
    info = probe(output)
    if abs(info["duration"] - duration) > max(0.5, duration * 0.003):
        raise RuntimeError("Output duration failed verification")
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    if video.get("width") != width or video.get("height") != height:
        raise RuntimeError("Output dimensions failed verification")
