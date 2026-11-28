"""Reusable MCP server support for explicitly trusted local Python hosts.

Install agentsam-sdk[mcp] to use this optional API. The default local server
does not expose filesystem, terminal, database, or remote account access.
"""
from .server import create_stdio_server, load_manifest, register_read_operation

__all__ = ["create_stdio_server", "load_manifest", "register_read_operation"]
