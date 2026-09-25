# Portable slash skills — architecture & migration report

**Status:** implemented in `agentsam-sdk` (local-first). **Not committed** pending review.  
**Do not** copy IAM `skill-slash-invoke.js` / R2 hydration / platform account fallback into the SDK.

---

## Target architecture

```
/skill args
   ↓
parseSlashInvocation()          ← CLI / shell only; prose = no lookup
   ↓
SkillRegistry                   ← user · installed · app · builtins
   ↓
SkillManifest (agentsam.skill.v1)
   ↓
SkillContentResolver            ← inline | local_file | package_file | database | object_store
   ↓
SkillRuntime.invoke()           ← turn-only
   ↓
SkillInvocationResult
   ├── modelInstructions        ← what the model sees
   ├── tools / operations       ← declared requirements
   ├── interaction              ← AgentSamInteraction (Clack / Studio / Tauri)
   └── receipt                  ← source · version · checksum
```

### Explicit non-goals (monolith leaks rejected)

| Leak | Replacement |
|------|-------------|
| `account_id IN ('platform','system')` | Layered registry sources — no pseudo accounts |
| `ORDER BY account_id = ?` precedence | Install-time trigger map; collisions → alias |
| Global unique published slash | Package may *suggest*; local registry owns binding |
| `metadata.pipeline` → subagent profiles | Declared `tools` / `operations` / `capabilities` |
| `hydrateSkillRowFromR2` | `object_store` adapter (R2 is one driver) |
| D1-required lookup | Local `~/.agentsam/skills/registry.json` works offline |
| Empty `promptBlock` | `modelInstructions` ≠ `interaction` |
| Hyperdrive as “provider” | `accelerator_ref` on retrieval rows |
| `embedding_model` + `dimensions` on retrieval | `embedding_profile_id` only |

### Canonical slash

- Parse: `/[a-zA-Z0-9][a-zA-Z0-9-]{0,63}` → store/lookup as **lowercase** `/kebab-case`
- Normalize on write (`canonicalizeSlashTrigger`); exact match on read
- Underscores rewritten to dashes at canonicalize time

### Registry layers

1. **User / installed** (`~/.agentsam/skills/`) — authoritative triggers  
2. **App-provided** (optional inject)  
3. **SDK builtins** (`skills/catalog.json`) — suggested trigger only if free  

### Interaction contract (`agentsam.interaction.v1`)

`ready | needs_input | needs_approval | blocked | complete`  
Prompt kinds: `info | text | select | multiselect | confirm | error`

---

## Migration report (IAM → portable)

IAM cutover `0011_*` remains host storage. Portable runtime does **not** depend on it.

| IAM today | Portable SDK | Host migration later |
|-----------|--------------|----------------------|
| Lookup with `platform`/`system` | Delete clause | Hosted SkillStore adapter filters by real `account_id` only |
| `LOWER(TRIM(slash_trigger))` | Canonical write | Backfill triggers to lowercase kebab; drop expression lookups |
| Partial unique published slash | Drop global uniqueness | Allow duplicate *suggestions*; enforce uniqueness per install |
| `metadata.pipeline` + subagents | Remove from slash path | Map declared ops to SAM operations |
| R2 hydrate in invoke | Content resolver | Register `cloudflare-r2` object_store adapter |
| Retrieval `provider IN (… hyperdrive …)` | See `migrations/sqlite/agentsam_skill_retrieval.portable.sql` | Split strategy/provider/driver/accelerator |
| Metrics triggers on `content_markdown` | Compute on resolve/install | Keep trigger only as inline optimization |
| `promptBlock: ''` | Split fields | Chat adapters render `interaction` |

**Hosted ownership:** stay in the **SkillStore adapter**, not in the portable manifest (no `workspace_id` / `tenant_id` on `agentsam.skill.v1`).

---

## CLI surface

```
agentsam skill list|create|inspect|edit|install|alias|remove|publish|invoke
agentsam skills …          # legacy catalog reader (SDK built-in markdown skills)
```

Interactive shell:

- `/skills` — vocabulary (no model)
- `/<trigger> args` — skill invoke when not a hard-coded shell command
- Unknown `/deply` → suggestions (no model)

---

## Files added

- `protocol/skills/agentsam.skill.v1.schema.json`
- `protocol/skills/agentsam.interaction.v1.schema.json`
- `src/skills/{slash,manifest,interaction,metrics,content-resolver,local-store,registry,runtime,index}.js`
- `src/skills/catalog.js` (renamed from index)
- `src/commands/skill.js`
- `migrations/sqlite/agentsam_skill_retrieval.portable.sql`
- `test/skill-runtime.test.mjs`

---

## Hosted SkillStore

Portable runtime uses `createNullHostedSkillStore()` offline.

Hosts inject a real adapter that lists/puts skills **by real `account_id` only**.
IAM must not keep `account_id IN ('platform','system')` visibility.

See `src/skills/hosted-store.js`.
