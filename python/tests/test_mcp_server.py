"""Protocol-level optional Python MCP SDK acceptance."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

@unittest.skipUnless(importlib.util.find_spec("mcp"), "requires agentsam-sdk[mcp]")
class PythonMcpAcceptance(unittest.TestCase):
    def test_workspace_read_uses_sdk_and_rechecks_host_grant(self):
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sample.txt").write_text("native fixture")
            (root / "grant").write_text("allow")
            (root / ".env").write_text("protected fixture")
            manifest = {
                "schema_version": "agentsam.mcp.v1", "name": "fixture", "version": "1.0.0",
                "runtime": {"kind": "python"}, "transport": {"kind": "stdio"}, "auth": {"type": "local"},
                "scopes": [{"scope": "workspace:read"}],
                "tools": [{"name": "workspace.read", "required_scopes": ["workspace:read"],
                           "annotations": {"readOnlyHint": True}}],
            }
            (root / "manifest.json").write_text(json.dumps(manifest))
            script = root / "server.py"
            script.write_text(
                "from pathlib import Path\n"
                "from agentsam_sdk import AgentSamClient\n"
                "from agentsam_sdk.mcp import create_stdio_server, load_manifest, register_read_operation\n"
                "root=Path(__file__).parent\n"
                "client=AgentSamClient(cwd=root)\n"
                "def register(server, manifest):\n"
                "    register_read_operation(server,manifest,client,'workspace.read',authorize=lambda op,p:(root/'grant').read_text()=='allow')\n"
                "create_stdio_server(load_manifest(root/'manifest.json'),register=register).run(transport='stdio')\n"
            )
            async def verify():
                async with stdio_client(StdioServerParameters(command=sys.executable,args=[str(script)])) as (reader,writer):
                    async with ClientSession(reader,writer) as client:
                        await client.initialize()
                        self.assertEqual([t.name for t in (await client.list_tools()).tools],["workspace.read"])
                        ok=await client.call_tool("workspace.read",{"path":"sample.txt"})
                        self.assertFalse(ok.is_error)
                        self.assertIn("native fixture",str(ok.structured_content))
                        protected=await client.call_tool("workspace.read",{"path":".env"})
                        self.assertTrue(protected.is_error or not protected.structured_content.get("ok"))
                        (root/"grant").write_text("deny")
                        denied=await client.call_tool("workspace.read",{"path":"sample.txt"})
                        self.assertTrue(denied.is_error)
            asyncio.run(verify())
