"""Static-only façade for the established IfcOpenShell editing API."""
from typing import Any

def run(operation: str, *args: Any, **kwargs: Any) -> Any: ...
