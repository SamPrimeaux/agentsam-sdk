"""Deterministic OpenCV video preflight and bounded, timecoded frame sampling.

The Python API takes a local file path for trusted callers. AgentSam's model-facing
SAM adapter instead resolves an installation-owned asset, stages its verified
bytes in a temporary file, and returns scoped derivative IDs—never raw paths.
OpenCV is an optional extra and is loaded only when this module is used.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import sys
from pathlib import Path
from typing import Any

MAX_SAMPLES = 12
MAX_SOURCE_BYTES = 50 * 1024 * 1024
MAX_FRAME_PIXELS = 40_000_000


class OpenCvMediaError(Exception):
    """Structured media-processing failure with a stable machine-readable code."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _opencv() -> Any:
    try:
        import cv2  # type: ignore[import-not-found]
    except ImportError as exc:
        raise OpenCvMediaError("opencv_not_installed") from exc
    return cv2


def _positive_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def _sampling_indices(total: int, count: int) -> list[int]:
    wanted = min(count, total)
    if wanted == 1:
        return [0]
    return sorted({round(index * (total - 1) / (wanted - 1)) for index in range(wanted)})


def inspect_video(
    source: str | Path,
    *,
    sample_count: int = 8,
    max_width: int = 640,
    jpeg_quality: int = 76,
    include_frames: bool = False,
) -> dict[str, Any]:
    """Probe a video and compare selected frames without inferring their meaning.

    `visual_change_score` is the normalized mean absolute grayscale difference
    between consecutive *sampled* frames. It is not optical-flow magnitude,
    actual UI motion, or proof of a scene transition. FPS/duration supplied by
    video containers may be approximate (notably variable-frame-rate media).
    """
    if type(sample_count) is not int or not 1 <= sample_count <= MAX_SAMPLES:
        raise OpenCvMediaError("opencv_invalid_sample_count")
    if type(max_width) is not int or not 64 <= max_width <= 960:
        raise OpenCvMediaError("opencv_invalid_max_width")
    if type(jpeg_quality) is not int or not 40 <= jpeg_quality <= 90:
        raise OpenCvMediaError("opencv_invalid_jpeg_quality")
    if type(include_frames) is not bool:
        raise OpenCvMediaError("opencv_invalid_frame_mode")

    path = Path(source)
    try:
        size = path.stat().st_size
    except (OSError, ValueError) as exc:
        raise OpenCvMediaError("opencv_video_not_found") from exc
    if not path.is_file() or not 0 < size <= MAX_SOURCE_BYTES:
        raise OpenCvMediaError("opencv_video_invalid_or_oversized")

    cv2 = _opencv()
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        raise OpenCvMediaError("opencv_video_open_failed")
    try:
        width = _positive_number(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = _positive_number(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = _positive_number(capture.get(cv2.CAP_PROP_FPS))
        frame_count = _positive_number(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if not width or not height or int(width) * int(height) > MAX_FRAME_PIXELS:
            raise OpenCvMediaError("opencv_video_invalid_dimensions")
        # Fail closed rather than inventing times/frames when container metadata
        # is missing. FFprobe can be used separately to diagnose VFR recordings.
        if not frame_count or frame_count > 100_000_000:
            raise OpenCvMediaError("opencv_video_frame_count_unavailable")
        total = int(frame_count)
        samples: list[dict[str, Any]] = []
        previous_gray = None
        decoded_indices: list[int] = []
        for frame_index in _sampling_indices(total, sample_count):
            if not capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index):
                raise OpenCvMediaError("opencv_video_seek_failed")
            decoded, frame = capture.read()
            if not decoded or frame is None:
                raise OpenCvMediaError("opencv_video_decode_failed")
            if not hasattr(frame, "shape") or frame.shape[0] * frame.shape[1] > MAX_FRAME_PIXELS:
                raise OpenCvMediaError("opencv_video_frame_invalid")
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            height_gray, width_gray = gray.shape[:2]
            thumb_w = min(96, width_gray)
            thumb_h = max(1, round(height_gray * thumb_w / width_gray))
            thumbnail = cv2.resize(gray, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA)
            visual_change_score = None
            if previous_gray is not None:
                previous_at_size = cv2.resize(previous_gray, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA)
                visual_change_score = round(float(cv2.absdiff(previous_at_size, thumbnail).mean()) / 255.0, 5)
            previous_gray = thumbnail
            # Frame index / nominal FPS is a timestamp estimate, not a VFR timecode.
            estimated_ms = round(frame_index / fps * 1000) if fps else None
            sample: dict[str, Any] = {
                "frame_index": frame_index,
                "timestamp_ms": estimated_ms,
                "timestamp_estimated": True,
                "visual_change_score": visual_change_score,
            }
            if include_frames:
                frame_height, frame_width = frame.shape[:2]
                if frame_width > max_width:
                    target_height = max(1, round(frame_height * max_width / frame_width))
                    frame = cv2.resize(frame, (max_width, target_height), interpolation=cv2.INTER_AREA)
                encoded, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality])
                if not encoded:
                    raise OpenCvMediaError("opencv_frame_encode_failed")
                sample["jpeg_base64"] = base64.b64encode(jpeg.tobytes()).decode("ascii")
            samples.append(sample)
            decoded_indices.append(frame_index)
        return {
            "schema": "agentsam.media.opencv-video.v1",
            "ok": True,
            "engine": "opencv",
            "video": {
                "width": int(width), "height": int(height),
                "fps_nominal": round(fps, 5) if fps else None,
                "frame_count_reported": total,
                "duration_ms_estimated": round(total / fps * 1000) if fps else None,
            },
            "sampling": {
                "requested": sample_count,
                "decoded": len(decoded_indices),
                "strategy": "uniform_frame_indices",
            },
            "samples": samples,
            "limitations": [
                "Timestamps and duration use nominal FPS and may be inaccurate for variable-frame-rate video.",
                "Visual change scores compare sampled frames; they do not identify objects, motion direction, or UI behavior.",
            ],
        }
    finally:
        capture.release()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect a trusted local video with optional OpenCV")
    parser.add_argument("--input", required=True, dest="source")
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--quality", type=int, default=76)
    parser.add_argument("--include-frames", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = inspect_video(args.source, sample_count=args.samples, max_width=args.width,
                               jpeg_quality=args.quality, include_frames=args.include_frames)
    except OpenCvMediaError as error:
        print(json.dumps({"ok": False, "code": error.code}), file=sys.stderr)
        return 2
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
