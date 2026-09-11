# @inneranimalmedia/agentsam-contracts

Framework-neutral AgentSam contracts shared by product surfaces. This package has no React dependency and must not know whether the host is Local Studio, CAD Studio, CMS Studio, or another product.

It owns the portable agent boundary: messages, inputs/runs, events, tool calls/capabilities, artifacts/attachments, explicit host context, model options, and the `AgentWorkbenchAdapter` interface.

Product state does **not** belong here. Trails/projects, CAD geometry, CMS page schemas, auth/session persistence, and deployment-specific wiring stay with their owning app/package.
