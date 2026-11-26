"""OpenCV is an optional dependency; real video fixtures stay local and tiny."""

import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agentsam_sdk.media import OpenCvMediaError, inspect_video


class OptionalOpenCvTests(unittest.TestCase):
    def test_rejects_invalid_requests_without_loading_native_modules(self):
        with self.assertRaisesRegex(OpenCvMediaError, 'opencv_invalid_sample_count'):
            inspect_video('/no/video.mp4', sample_count=100)
        with self.assertRaisesRegex(OpenCvMediaError, 'opencv_video_not_found'):
            inspect_video('/no/video.mp4')

    def test_missing_opencv_is_a_structured_error_not_import_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'video.mp4'
            path.write_bytes(b'placeholder')
            with patch.dict(sys.modules, {'cv2': None}):
                with self.assertRaises(OpenCvMediaError) as raised:
                    inspect_video(path)
                self.assertEqual(raised.exception.code, 'opencv_not_installed')


class RealOpenCvVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import cv2  # noqa: PLC0415
            import numpy  # noqa: PLC0415
        except ImportError:
            raise unittest.SkipTest('optional opencv-python-headless extra not installed')
        cls.cv2, cls.np = cv2, numpy

    def test_real_video_probe_frames_and_scene_change_score(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'clip.avi'
            writer = self.cv2.VideoWriter(str(source), self.cv2.VideoWriter_fourcc(*'MJPG'), 5, (64, 48))
            if not writer.isOpened():
                self.skipTest('host OpenCV build has no MJPEG video writer')
            try:
                for index in range(10):
                    frame = self.np.full((48, 64, 3), 0 if index < 5 else 255, dtype=self.np.uint8)
                    writer.write(frame)
            finally:
                writer.release()

            result = inspect_video(source, sample_count=4, include_frames=True, max_width=64)
            self.assertTrue(result['ok'])
            self.assertEqual(result['engine'], 'opencv')
            self.assertEqual(result['video']['width'], 64)
            self.assertEqual(result['video']['height'], 48)
            self.assertEqual(result['video']['frame_count_reported'], 10)
            self.assertEqual(result['video']['duration_ms_estimated'], 2000)
            self.assertEqual(result['sampling']['decoded'], 4)
            indices = [row['frame_index'] for row in result['samples']]
            self.assertEqual(indices, [0, 3, 6, 9])
            self.assertIsNone(result['samples'][0]['visual_change_score'])
            self.assertGreater(result['samples'][2]['visual_change_score'], 0.9)
            self.assertLess(result['samples'][3]['visual_change_score'], 0.05)
            for row in result['samples']:
                self.assertTrue(base64.b64decode(row['jpeg_base64']).startswith(b'\xff\xd8'))

            metadata_only = inspect_video(source, sample_count=4)
            self.assertTrue(all('jpeg_base64' not in row for row in metadata_only['samples']))
            cli = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'agentsam_sdk' / 'media' / 'opencv.py'),
                                  '--input', str(source), '--samples', '3'], check=True, capture_output=True, text=True)
            self.assertEqual(json.loads(cli.stdout)['sampling']['decoded'], 3)


if __name__ == '__main__':
    unittest.main()
