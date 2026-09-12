# @inneranimalmedia/agentsam-contracts

Framework-neutral AgentSam contracts shared by product surfaces. This package has no React dependency and must not know whether the host is Local Studio, CAD Studio, CMS Studio, or another product.

It owns the portable AgentSam vocabulary: messages, inputs/runs, events, tool calls/capabilities, artifacts/attachments, explicit host context, model options, repository/company graph records, and adapter interfaces. Account-bound repository contracts and dependency edges live here as wire types; database storage and provider-specific lookup remain host concerns.

Product state does **not** belong here. Trails/projects, CAD geometry, CMS page schemas, auth/session persistence, and deployment-specific wiring stay with their owning app/package.
