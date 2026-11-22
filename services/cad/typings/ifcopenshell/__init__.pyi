"""Static-only type shim for the optional native IfcOpenShell runtime.

This never installs or emulates the IFC engine. Actual inspect operations must
execute with the real ifcopenshell package in the CAD service environment.
"""
from typing import Any

from . import api as api
from . import geom as geom
from . import guid as guid
from . import validate as validate

version: str

def open(path: str) -> Any: ...
