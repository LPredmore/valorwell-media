import tempfile
import unittest
from pathlib import Path

from core import align_bins, choose_shots, ffmpeg_master, parse_source, probe, validate_activity, run


class MultiCameraTests(unittest.TestCase):
    def test_streamyard_filename_offsets(self):
        one = parse_source(
            "Veterans_Future_Foundation-Ben_Armstrong-webcam-00h_00m_00s_444ms-StreamYard.mp4"
        )
        two = parse_source(
            "Veterans_Future_Foundation-Luke_Predmore-webcam-00h_00m_01s_027ms-StreamYard.mp4"
        )
        self.assertAlmostEqual(one["offset"], 0.444)
        self.assertAlmostEqual(two["offset"] - one["offset"], 0.583)
        self.assertEqual(one["speaker"], "Ben Armstrong")
        with self.assertRaises(ValueError):
            parse_source("something-unrelated.mp4")

    def test_activity_alignment(self):
        self.assertEqual(align_bins([True, False, True], 0.2, 5),
                         [False, False, True, False, True])

    def test_stable_switches_and_full_timeline(self):
        a = [True] * 30 + [False] * 30 + [True] * 30
        b = [False] * 30 + [True] * 30 + [False] * 30
        shots = choose_shots(a, b)
        self.assertEqual([s["camera"] for s in shots], [0, 1, 0])
        self.assertEqual(shots[0]["start"], 0)
        self.assertEqual(shots[-1]["end"], 9.0)
        self.assertTrue(all(x["start"] < x["end"] for x in shots))

    def test_short_interruption_does_not_force_cut(self):
        a = [True] * 40 + [False] * 2 + [True] * 40
        b = [False] * 40 + [True] * 2 + [False] * 40
        shots = choose_shots(a, b)
        self.assertEqual(len(shots), 1)

    def test_mixed_audio_safety(self):
        with self.assertRaisesRegex(ValueError, "overlapping"):
            validate_activity([True] * 100, [True] * 100)
        with self.assertRaisesRegex(ValueError, "Insufficient"):
            validate_activity([True] * 5, [False] * 5)

    def test_real_ffmpeg_two_camera_render(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            one, two, output = root / "red.mp4", root / "blue.mp4", root / "master.mp4"
            for target, color, frequency in [
                (one, "red", "440"), (two, "blue", "880")
            ]:
                run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                     "-f", "lavfi", "-i", f"color=c={color}:s=320x180:r=30:d=4",
                     "-f", "lavfi", "-i", f"sine=frequency={frequency}:sample_rate=16000:duration=4",
                     "-c:v", "libx264", "-pix_fmt", "yuv420p",
                     "-c:a", "aac", "-shortest", str(target)])
            shots = [
                {"start": 0.0, "end": 2.0, "camera": 0},
                {"start": 2.0, "end": 4.0, "camera": 1},
            ]
            ffmpeg_master(one, two, output, shots, (0, 0), 4, 320, 180)
            info = probe(output)
            self.assertAlmostEqual(info["duration"], 4.0, delta=0.2)
            # Sample the center pixel of each interval to confirm actual camera selection.
            samples = []
            for moment in ("1.0", "3.0"):
                proc = __import__("subprocess").run(
                    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", moment,
                     "-i", str(output), "-frames:v", "1", "-vf",
                     "crop=1:1:160:90,format=rgb24", "-f", "rawvideo", "-"],
                    capture_output=True, check=True,
                )
                samples.append(tuple(proc.stdout[:3]))
            self.assertGreater(samples[0][0], samples[0][2] + 70)
            self.assertGreater(samples[1][2], samples[1][0] + 70)


if __name__ == "__main__":
    unittest.main()
