# AgentSam Architectural Intelligence

The 12 agent skills live under SDK root skills/agentsam-arch-*. This package supplies independently executable reference MCP tooling and source registries. It does NOT claim to implement OCCT/FreeCAD/IFC operations, licensed code interpretations, or certify drawings.

Node stdio launch:
node packages/agentsam-architectural-intelligence/mcp/server.mjs

MCP clients should discover tools/list and invoke tools/call; configured clients must provide absolute script path. Source material dimensions apply only to the recorded product class and are not site-measured tolerances.
