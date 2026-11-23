# Stub for Blender's embedded bmesh (see bpy.pyi note). Only what the adapters call.
from typing import Any

class BMVert:
    index: int

class BMEdge:
    is_manifold: bool
    verts: Any

class BMFace:
    verts: Any

class BMesh:
    verts: Any
    edges: Any
    faces: Any
    def from_mesh(self, mesh: Any) -> None: ...
    def transform(self, matrix: Any) -> None: ...
    def calc_volume(self, signed: bool = ...) -> float: ...
    def free(self) -> None: ...

def new() -> BMesh: ...
