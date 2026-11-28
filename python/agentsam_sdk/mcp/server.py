"""Python adapter for the shared AgentSam MCP manifest."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
from typing import Annotated, Any, Callable, Literal
import unicodedata

from ..client import AgentSamClient
from ..runtime.native import NATIVE_OPERATION_SPECS


def load_manifest(path: str | Path) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if value.get("schema_version") != "agentsam.mcp.v1":
        raise ValueError("mcp_manifest_schema_invalid")
    if value.get("runtime", {}).get("kind") != "python" or value.get("transport", {}).get("kind") != "stdio":
        raise ValueError("mcp_runtime_transport_unsupported")
    if value.get("auth", {}).get("type") != "local":
        raise ValueError("mcp_stdio_local_authority_required")
    return value


def _register_declared(server, manifest: dict, name: str, handler: Callable):
    from mcp.types import ToolAnnotations
    matches = [tool for tool in manifest.get("tools", []) if tool.get("name") == name]
    if len(matches) != 1:
        raise ValueError("mcp_tool_manifest_entry_invalid:" + name)
    tool = matches[0]
    scopes = {scope["scope"] for scope in manifest.get("scopes", [])}
    if not set(tool.get("required_scopes", [])).issubset(scopes):
        raise ValueError("mcp_tool_scope_not_declared:" + name)
    server.tool(name=name, title=tool.get("title"), description=tool.get("description"),
                annotations=ToolAnnotations.model_validate(tool.get("annotations", {})),
                structured_output=True)(handler)


def register_read_operation(server, manifest: dict, client: AgentSamClient, operation_id: str, *, authorize: Callable):
    """Register one explicitly declared native read operation.

    The trusted host supplies the scoped SDK client and a fresh policy/device
    authorization callback. No model input can choose the workspace root.
    """
    spec = NATIVE_OPERATION_SPECS.get(operation_id)
    if not spec or spec.get("side_effects") or operation_id not in ("workspace.read", "workspace.stat", "workspace.list"):
        raise ValueError("mcp_sdk_operation_not_read_only:" + operation_id)
    if not callable(authorize):
        raise ValueError("mcp_workspace_authority_required")

    def invoke(params: dict[str, Any]) -> dict[str, Any]:
        if authorize(operation_id, params) is not True:
            raise PermissionError("mcp_workspace_access_denied")
        return client.invoke(operation_id, params, write=False)

    if operation_id == "workspace.list":
        def handler(path: str = ".", depth: int = 3, max_entries: int = 100) -> dict[str, Any]:
            return invoke({"path": path, "depth": depth, "max_entries": max_entries})
    else:
        def handler(path: str) -> dict[str, Any]:
            return invoke({"path": path})
    _register_declared(server, manifest, operation_id, handler)


def create_stdio_server(manifest: dict, *, register: Callable | None = None):
    """Create a local MCP server using the official Python SDK.

    The launching process controls access. The host may explicitly add
    tools, resources, or prompts through the registration callback.
    """
    try:
        from mcp.server.mcpserver import MCPServer
        from pydantic import Field
    except ImportError as exc:
        raise RuntimeError("Install agentsam-sdk[mcp] to enable MCP support") from exc
    if manifest.get("schema_version") != "agentsam.mcp.v1" or manifest.get("runtime", {}).get("kind") != "python" or manifest.get("transport", {}).get("kind") != "stdio" or manifest.get("auth", {}).get("type") != "local":
        raise ValueError("mcp_stdio_local_authority_required")
    server = MCPServer(manifest["name"], version=manifest["version"])

    def health() -> dict[str, Any]:
        return {"ok": True, "name": manifest["name"], "version": manifest["version"],
                "tool_count": len(manifest["tools"]), "checked_at": datetime.now(timezone.utc).isoformat()}

    def info() -> dict[str, Any]:
        return {"manifest": manifest, "tools": manifest["tools"]}

    def transform(text: str, operation: Literal["trim", "uppercase", "lowercase", "slugify"]) -> dict[str, Any]:
        if len(text) > 10000:
            raise ValueError("text_too_long")
        if operation == "trim":
            result = text.strip()
        elif operation == "uppercase":
            result = text.upper()
        elif operation == "lowercase":
            result = text.lower()
        else:
            normalized = "".join(c for c in unicodedata.normalize("NFKD", text) if not "\u0300" <= c <= "\u036f")
            result = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
        return {"operation": operation, "result": result}

    # Keep the input schema identical to the JS starter where possible.
    transform.__annotations__["text"] = Annotated[str, Field(max_length=10000)]

    def calculate(left: float, operation: Literal["add", "subtract", "multiply", "divide"], right: float) -> dict[str, Any]:
        if not math.isfinite(left) or not math.isfinite(right):
            raise ValueError("non_finite_operand")
        if operation == "divide" and right == 0:
            raise ValueError("division_by_zero")
        if operation == "add":
            result = left + right
        elif operation == "subtract":
            result = left - right
        elif operation == "multiply":
            result = left * right
        else:
            result = left / right
        if not math.isfinite(result):
            raise ValueError("calculation_result_out_of_range")
        return {"left": left, "operation": operation, "right": right, "result": result}

    declared = {tool["name"] for tool in manifest.get("tools", [])}
    for name, handler in (("system.health", health), ("system.info", info), ("text.transform", transform), ("math.calculate", calculate)):
        if name in declared:
            _register_declared(server, manifest, name, handler)
    if register is not None:
        register(server, manifest)
    return server
