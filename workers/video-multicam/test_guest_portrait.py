import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("guest_portrait", Path(__file__).with_name("guest_portrait.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GuestPortraitTests(unittest.TestCase):
    def test_candidate_times_are_bounded(self):
        for duration in (12, 60, 3600):
            timestamps = module.candidate_times(duration)
            self.assertEqual(len(timestamps), 18)
            self.assertEqual(timestamps, sorted(timestamps))
            self.assertTrue(all(0 <= t < duration for t in timestamps))

    def test_invalid_duration_fails(self):
        with self.assertRaises(ValueError):
            module.candidate_times(4)

    def test_crop_has_portrait_shape_and_bounds(self):
        for width, height, face in [
            (1280, 720, (475, 100, 210, 260)),
            (1920, 1080, (800, 100, 400, 520)),
            (720, 1280, (20, 45, 160, 220)),
        ]:
            left, top, right, bottom = module.crop_box(width, height, face)
            self.assertTrue(0 <= left < right <= width)
            self.assertTrue(0 <= top < bottom <= height)
            self.assertAlmostEqual((right - left) / (bottom - top), 0.8, delta=0.025)

    def test_crop_rejects_invalid_face(self):
        with self.assertRaises(ValueError):
            module.crop_box(1280, 720, (0, 0, 0, 0))


if __name__ == "__main__":
    unittest.main()
