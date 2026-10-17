import importlib.util
import tempfile
import unittest
from pathlib import Path

module = Path(__file__).with_name("multicam.py")
spec = importlib.util.spec_from_file_location("multicam", module)
multicam = importlib.util.module_from_spec(spec)
spec.loader.exec_module(multicam)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.a = Path(self.temp.name) / "a.mp4"
        self.b = Path(self.temp.name) / "b.mp4"
        self.a.touch()
        self.b.touch()
        self.valid = {
            "sources": [
                {"id": "host", "path": str(self.a), "start_offset": 0},
                {"id": "guest", "path": str(self.b), "start_offset": 0.5},
            ],
            "shots": [
                {"camera": "host", "start": 0, "end": 2},
                {"camera": "guest", "start": 2, "end": 4},
            ],
        }

    def test_valid(self):
        _, shots, end = multicam.validate(self.valid)
        self.assertEqual(len(shots), 2)
        self.assertEqual(end, 4)

    def test_unknown_speaker(self):
        self.valid["shots"][1]["camera"] = "stranger"
        with self.assertRaises(ValueError):
            multicam.validate(self.valid)

    def test_timeline_gap(self):
        self.valid["shots"][1]["start"] = 2.2
        with self.assertRaises(ValueError):
            multicam.validate(self.valid)

    def test_camera_before_start(self):
        self.valid["shots"][0]["camera"] = "guest"
        with self.assertRaises(ValueError):
            multicam.validate(self.valid)

    def test_source_missing(self):
        self.b.unlink()
        with self.assertRaises(ValueError):
            multicam.validate(self.valid)


if __name__ == "__main__":
    unittest.main()
