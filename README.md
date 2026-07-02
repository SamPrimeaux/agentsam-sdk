# Agent Sam SDK

> The AI agent layer for developers who need more than a chatbot.

> **Core philosophy:** Build a capability once, expose it everywhere.
>
> - Dashboard → visual control plane
> - SDK → reusable engine
> - CLI → automation interface
> - MCP → AI interface
>
> Every interface should execute the same underlying pipeline.

## Product Vision

AgentSam is not just an SDK—it is a platform for packaging repeatable engineering workflows.

A capability should evolve like this:

1. Build it once.
2. Refine it until it's reliable.
3. Expose it as an SDK module.
4. Attach a simple CLI command.
5. Reuse it in the dashboard.
6. Let AI agents execute the exact same pipeline.

Examples:

```bash
agentsam security scan
agentsam doctor
agentsam deploy
agentsam workspace audit
agentsam cms publish
```

## Kits & Templates

One long-term goal is shipping reusable "AgentSam Kits" that package proven systems instead of isolated code snippets.

Examples:

```bash
agentsam kit install nonprofit-cms
agentsam kit install stripe-campaign
agentsam kit install animal-rescue
agentsam kit install glass-dashboard
```

A kit may include:

- UI components
- Database schema
- Cloudflare configuration
- CMS models
- Stripe integration
- Agent instructions
- Deployment pipeline
- Security policies
- Branding assets

The goal is to turn best-in-class internal projects into reusable products that can be installed, customized, and maintained through AgentSam.


(Existing README content continues below.)