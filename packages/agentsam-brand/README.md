# @inneranimalmedia/agentsam-sdk-brand

Deterministic **Brand Intelligence** for AgentSam.

```text
repository.snapshot  →  brand.scan  →  brand.resolve  →  brand.plan  →  (apply/verify)
```

- **Brand ≠ Theme.** Theme is a projection; Brand is authority.
- **No LLM required** for scan/resolve/plan skeleton.
- **Same file authority** as security/knowledge (Merkle + gitignore via snapshot).
- States stay separated: `observed` → `inferred` → `declared` → `resolved`.

```bash
agentsam brand scan --json
agentsam brand resolve
agentsam plan brand --goap
agentsam brand --write   # writes .agentsam/brand/{evidence,resolved,contract}.json
```

Progression (generic, not brand-only): `@inneranimalmedia/agentsam-sdk/progression`
