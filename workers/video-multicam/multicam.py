"""Deterministic multicamera preview renderer.

Manifest times are seconds on the common episode timeline. Positive
start_offset means the source begins later than episode time zero.
This module is opt-in and does not modify the existing Shorts worker.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path


def validate(manifest: dict) -> tuple[list[dict], list[dict], float]:
    sources = manifest.get("sources")
    shots = manifest.get("shots")
    if not isinstance(sources, list) or len(sources) < 2:
        raise ValueError("At least two camera sources are required")
    if not isinstance(shots, list) or not shots:
        raise ValueError("A nonempty camera shot list is required")
    ids = set()
    for src in sources:
        if not isinstance(src, dict) or not src.get("id") or src["id"] in ids:
            raise ValueError("Camera source IDs must be unique and nonempty")
        ids.add(src["id"])
        p = Path(str(src.get("path", "")))
        if not p.is_file():
            raise ValueError(f"Missing camera source: {p}")
        offset = float(src.get("start_offset", 0))
        if not math.isfinite(offset) or offset < 0:
            raise ValueError("Source start_offset must be finite and nonnegative")
    end = 0.0
    for shot in shots:
        start = float(shot["start"])
        stop = float(shot["end"])
        if shot.get("camera") not in ids:
            raise ValueError("Shot refers to unknown camera")
        if not all(map(math.isfinite, (start, stop))) or abs(start-end) > 0.001 or stop <= start:
            raise ValueError("Shots must form a gapless, ordered timeline starting at zero")
        source = next(s for s in sources if s["id"] == shot["camera"])
        if start + 0.001 < float(source.get("start_offset", 0)):
            raise ValueError("Shot starts before the selected camera recording")
        end = stop
    return sources, shots, end


def command(args: list[str]) -> None:
    subprocess.run(args, check=True, capture_output=True, text=True)


def render(manifest: dict, destination: Path, width: int = 1920, height: int = 1080):
    sources, shots, duration = validate(manifest)
    by_id = {s["id"]: s for s in sources}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="bty-multicam-") as root:
        folder = Path(root)
        segments = []
        for i, shot in enumerate(shots):
            src = by_id[shot["camera"]]
            start = float(shot["start"]) - float(src.get("start_offset", 0))
            length = float(shot["end"]) - float(shot["start"])
            segment = folder / f"scene-{i:05d}.mp4"
            command([
                "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                "-ss", f"{start:.6f}", "-i", str(src["path"]),
                "-t", f"{length:.6f}", "-an", "-vf",
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1",
                "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", str(segment),
            ])
            segments.append(segment)
        concat_list = folder / "segments.txt"
        concat_list.write_text("".join(f"file '{p.as_posix()}'\\n" for p in segments))
        picture = folder / "picture.mp4"
        command(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                 "-f", "concat", "-safe", "0", "-i", str(concat_list),
                 "-c", "copy", str(picture)])
        # Prefer an independent, already mixed master audio recording.
        # Mixing isolated microphones is deliberately not implicit: differing gain,
        # echo and spill require a separately validated mix.
        master = manifest.get("master_audio")
        if master:
            audio = Path(str(master))
            if not audio.is_file():
                raise ValueError("master_audio path does not exist")
            command(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                     "-i", str(picture), "-i", str(audio),
                     "-map", "0:v:0", "-map", "1:a:0", "-t", f"{duration:.6f}",
                     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                     "-movflags", "+faststart", str(destination)])
        else:
            # Video-only output is intentional: never silently select one person's
            # isolated microphone and omit the other person.
            command(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                     "-i", str(picture), "-c", "copy",
                     "-movflags", "+faststart", str(destination)])
    return {"output": str(destination), "duration_seconds": duration, "shots": len(shots),
            "has_audio": bool(master)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    opts = parser.parse_args()
    print(json.dumps(render(json.loads(opts.manifest.read_text()), opts.output)))
