# SAM OpenCV media inspection

OpenCV is an **optional computer-vision engine**, not an AI model and not a new AgentSam agent, registry, storage service or background worker. The same SAM operations can be called by any model/provider that can invoke AgentSam's host tools.

## Install the optional engine

```bash
# In the AgentSam SDK checkout (or in an installed SDK Python environment)
python3 -m venv python/.venv
python/.venv/bin/python -m pip install -e './python[opencv]'
python/.venv/bin/python -c 'import cv2; print(cv2.__version__)'
```

This installs `opencv-python-headless` and its NumPy dependency in a **project-local Python environment**; the Python SDK's normal installation has no OpenCV dependency. The SDK CLI first looks for the packaged Python environment, then for a Python interpreter explicitly configured with `AGENTSAM_OPENCV_PYTHON`, and finally for a compatible `python3` on the host. If no working OpenCV interpreter is available, SAM does **not** advertise tools it cannot execute. For video imports, install FFprobe/FFmpeg separately; those are existing SAM evidence engines.

## Model-independent operations

| Operation | Side effects | Output |
|---|---|---|
| `media.local.import` | Authorized library write | Imports a validated, workspace-bounded MP4, MOV, WebM, MKV or AVI into the existing Media Library, or an existing image/GLB |
| `media.video.inspect` | Read only | Dimensions, nominal FPS, reported frames, estimated duration, uniform timecoded samples, and numeric visual-change scores |
| `media.video.sample_frames` | Authorized derivative writes | 1–12 JPEG derivatives with frame index, estimated timestamp, change score, SHA-256, source lineage, and existing Media Library asset IDs |

All video operations use the **trusted host's account, actor, installation and existing media store**. Neither the model nor the tool input can supply an arbitrary disk path. Cross-account asset access fails, and frame writes require the host to authorize `media_derivative_create`. The original video remains unmodified. The Node adapter uses temporary files with bounded runtime/size and removes them on completion; it does not store private source paths in SAM results.

Example once the normal SAM host and user session are connected:

```js
const imported = await samAdapter.invoke('media.local.import', {
  relativePath: 'recordings/navigation.mov',
});
const metadata = await samAdapter.invoke('media.video.inspect', {
  assetId: imported.data.assetId, sampleCount: 8,
});
const frames = await samAdapter.invoke('media.video.sample_frames', {
  assetId: imported.data.assetId, sampleCount: 8, maxWidth: 640,
});
// frames.data.frames contains owned Media Library asset IDs, not external URLs.
```

Call the standalone Python helper only for **trusted local tooling** (it accepts a filesystem path and does not implement the SAM authorization layer):

```python
from agentsam_sdk.media import inspect_video
metadata = inspect_video('recording.mp4', sample_count=8)
```

## Interpretation boundaries and resource budgets

- This is **deterministic media processing**, not semantic vision analysis. A vision-capable model must separately receive the selected frames to interpret UI components, motion, or scenes. Normal chat-attachment ingestion and provider-specific multimodal frame delivery are **not yet automatically wired** by this SDK change.
- Timestamps and duration are estimated using nominal FPS and may be inaccurate on variable-frame-rate iPhone screen recordings. OpenCV can fail to seek in certain container/codec combinations; such failures are surfaced, not silently guessed.
- `visual_change_score` is the grayscale difference **between sampled frames**; it does not identify objects, verify interaction, measure optical-flow direction, or prove a scene cut.
- The current host-local adapter accepts source assets up to **50 MiB**, at most 12 sampled frames, at most 960 pixels of JPEG width, two concurrent jobs, and 45 seconds per job. Larger recordings require a future streaming/object-storage processing lane instead of loading an entire video into memory.
- FFprobe validates the imported video container before placing it into the existing Media Library. The source MIME, ownership, and SHA-256 are checked again by the OpenCV adapter.

## Tests

```bash
python/.venv/bin/python -m unittest discover -s python/tests -p test_opencv_media.py -v
node --test test/integration/sam-opencv-media.test.mjs
```

The real-engine tests generate tiny videos, verify decoded frame content, prove cross-account isolation and denied writes, and confirm frame derivatives retain source lineage. No video or external cloud storage is required.
