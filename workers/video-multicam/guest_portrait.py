"""Extract an authentic guest head-and-shoulders still from a StreamYard webcam.

Uses multiple source-video frames, frontal face detection and conservative
quality checks. Never generates or substitutes a synthetic person's face.
"""
from __future__ import annotations

import json
import math
import subprocess
import tempfile
from pathlib import Path


def crop_box(width: int, height: int, face: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Return a bounded 4:5 portrait crop with the face in its upper third."""
    x, y, fw, fh = face
    if min(width, height, fw, fh) <= 0:
        raise ValueError("Invalid dimensions")
    crop_w = min(float(width), float(height) * 0.8, max(fw * 3.1, fh * 2.5))
    crop_h = crop_w * 1.25
    left = max(0.0, min(width - crop_w, x + fw / 2 - crop_w / 2))
    top = max(0.0, min(height - crop_h, y + fh / 2 - crop_h * 0.31))
    left_i, top_i = int(round(left)), int(round(top))
    w_i, h_i = int(round(crop_w)), int(round(crop_h))
    return (left_i, top_i, min(width, left_i + w_i), min(height, top_i + h_i))


def candidate_times(duration: float, count: int = 18) -> list[float]:
    if not math.isfinite(duration) or duration < 8:
        raise ValueError("Video must contain at least eight seconds")
    start = min(15.0, duration * 0.07)
    end = max(start + 1, duration * 0.88)
    return [round(start + (end - start) * (i + 0.5) / count, 2) for i in range(count)]


def evaluate(frame, detector, eye_detector):
    import cv2
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    faces = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5,
                                      minSize=(max(50, width // 16), max(50, height // 12)))
    if len(faces) != 1:
        return None  # Avoid choosing another person or a poster in the background.
    x, y, w, h = (int(z) for z in faces[0])
    if w < width * 0.085 or h < height * 0.14:
        return None
    region = gray[y:y+h, x:x+w]
    if region.size == 0:
        return None
    brightness = float(region.mean())
    focus = float(cv2.Laplacian(region, cv2.CV_64F).var())
    if not 48 <= brightness <= 215 or focus < 32:
        return None
    eyes = eye_detector.detectMultiScale(region[:max(1, h * 2 // 3)],
                                         scaleFactor=1.1, minNeighbors=4,
                                         minSize=(max(12, w // 9), max(10, h // 10)))
    center = abs((x + w / 2) / width - 0.5)
    score = min(focus, 400) * 0.15 + min(w * h / (width * height), 0.3) * 140
    score += 12 if len(eyes) >= 2 else 0
    score += max(0, 20 - center * 55)
    score -= abs(brightness - 135) * 0.12
    return {"score": round(score, 2), "face": (x, y, w, h),
            "focus": round(focus, 2), "eyes": int(len(eyes)),
            "brightness": round(brightness, 1)}


def select_portrait(source: Path, destination: Path, duration: float) -> dict:
    import cv2
    detector = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"))
    eye_detector = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / "haarcascade_eye.xml"))
    if detector.empty() or eye_detector.empty():
        raise RuntimeError("Face detection models unavailable")
    candidates: list[tuple[float, float, object, dict]] = []
    with tempfile.TemporaryDirectory(prefix="bty-guest-frames-") as tmp:
        for i, timestamp in enumerate(candidate_times(duration)):
            path = Path(tmp) / f"frame-{i:02d}.jpg"
            result = subprocess.run([
                "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                "-ss", f"{timestamp:.2f}", "-i", str(source),
                "-frames:v", "1", "-vf", "scale=1280:-2",
                "-q:v", "2", str(path),
            ], capture_output=True, text=True, timeout=100)
            if result.returncode or not path.exists():
                continue
            frame = cv2.imread(str(path))
            if frame is None:
                continue
            info = evaluate(frame, detector, eye_detector)
            if info:
                candidates.append((info["score"], timestamp, frame, info))
    if not candidates:
        raise ValueError("No unambiguous, sharp and well-lit guest face found; manual image required")
    candidates.sort(key=lambda x: x[0], reverse=True)
    score, timestamp, image, info = candidates[0]
    h, w = image.shape[:2]
    left, top, right, bottom = crop_box(w, h, info["face"])
    portrait = image[top:bottom, left:right]
    if portrait.size == 0:
        raise RuntimeError("Invalid guest portrait crop")
    portrait = cv2.resize(portrait, (800, 1000), interpolation=cv2.INTER_AREA)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(destination), portrait, [cv2.IMWRITE_JPEG_QUALITY, 93]):
        raise RuntimeError("Could not save selected guest portrait")
    size = destination.stat().st_size
    if not 20000 <= size <= 8 * 1024 * 1024:
        raise RuntimeError("Guest portrait file size failed verification")
    return {
        "selected_time_seconds": timestamp, "evaluated_candidates": len(candidates),
        "quality_score": score, "face_focus": info["focus"],
        "eyes_detected": info["eyes"], "output_width": 800, "output_height": 1000,
        "size_bytes": size, "provenance": "unedited_frame_crop",
    }
