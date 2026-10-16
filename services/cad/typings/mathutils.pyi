# Stub for Blender's embedded mathutils (see bpy.pyi note).
from collections.abc import Iterable
from typing import Any

class Vector:
    def __init__(self, values: Iterable[float] = ...) -> None: ...
    x: float
    y: float
    z: float
    def __iter__(self) -> Any: ...

class Matrix:
    def __init__(self, values: Any = ...) -> None: ...
