"""Optional, model-independent media processing for AgentSam.

Importing this namespace never imports OpenCV or adds a mandatory dependency.
"""

from .opencv import OpenCvMediaError, inspect_video

__all__ = ["OpenCvMediaError", "inspect_video"]
