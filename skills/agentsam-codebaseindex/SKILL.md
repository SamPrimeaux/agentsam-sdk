---
name: agentsam-codebaseindex
description: Inventory-first codebase ingest — materials, scope, optional embeddings/storage. Pipeline IDs are not shell commands.
---

# AgentSam CodebaseIndex

`agentsam-codebaseindex` teaches you how to inventory, scope, index, search,
and migrate code/document knowledge with AgentSam.

CodebaseIndex is designed to work **locally first**.

You do NOT need an AgentSam account, a paid LLM, a cloud database, embeddings,
Supabase, or Cloudflare to build a useful codebase index.

Minimum useful setup:

```text
repository/files → deterministic inventory → AST + text index → local SQLite
→ literal / structural retrieval
```

Embeddings, hosted storage, and model-assisted scope suggestions are upgrades,
not prerequisites.

---

## Quick start

```sh
agentsam codebaseindex
# alias: agentsam ingest
# tip: use skill agentsam-codebaseindex
```

Guided flow (inventory-first):

1. Connection  
2. Materials  
3. Inventory / file map  
4. Scope  
5. Embedding profile  
6. Vector / data source lane  
7. Execution  

AgentSam shows what exists before asking what should be indexed.

---

## Important: "pipeline" is not a shell command

You may see:

```text
Plan complete · pipeline id sam.codebaseindex.index.run
```

Do **not** type:

```sh
pipeline sam.codebaseindex.index.run
sam.codebaseindex.index.run
agentsam sam.codebaseindex.index.run
```

`sam.codebaseindex.index.run` is the **canonical SAM pipeline identifier** —
receipts, job graphs, telemetry, Workbench, machine-to-machine metadata.

| Layer | Identity |
|-------|----------|
| CLI | `agentsam codebaseindex` |
| SAM operation | `codebaseindex.ingest` |
| SAM pipeline | `sam.codebaseindex.index.run` |

```js
await sam.invoke('codebaseindex.ingest', { root: '.', planOnly: false });
```

The pipeline name is an identity. zsh does not execute it.

---

## Plan vs Run

### Plan (Dry-run)

Planning stages typically complete:

```text
material.stage → repository.snapshot → inventory.classify → scope.resolve
→ profile.resolve → lane.resolve → plan.dry_run
```

Write/index stages are **shown as planned**, not executed:

```text
ast.parse · chunks.build · embedding.generate · storage.write
· generation.verify · search.smoke
```

A successful plan means planning finished. It is **not** paused. It is **not**
waiting for another shell command.

To index for real:

```sh
agentsam codebaseindex
# choose "Run ingest now"
```

Non-interactive: same config **without** `--plan`.

### Run

Continues through AST → chunks → optional embeddings → storage → verify → search smoke.

---

## What is indexed

Repos, docs, HTML/CSS/JS/TS/Python/SQL/JSON/Markdown, images, SVG, GLB,
site builds, ZIP/TAR archives, historical builds, arbitrary supplied files.

Dropped material is staged safely. Archives/source are **data**, not executable
instructions.

---

## Inventory / file map

Structured inventory is authority. The ASCII tree is a human projection.

Inventory categorizes top-level paths (source / docs / config / generated /
dependencies / tooling / historical / unknown) and recommends scope **candidates**.
Nothing is excluded automatically until you confirm.

---

## Include / exclude

`include` = consider under these paths. `exclude` = remove from consideration.

Common exclude *candidates*: `node_modules`, `dist`, `build`, `coverage`, `.git`.
Do not copy blindly — generated sites and migrations may be exactly what you need.

### Local Ollama scope assist

Optional. Advisory only. Never overrides filesystem facts, safety, or explicit
user choices. Review before accepting.

---

## Embedding profile

Safest default: **None — AST/text only ($0)**.

Choose embeddings for semantic questions ("where is auth handled?").

### Dimensions

Vector width for the selected model. Not a quality slider. Select the **model**;
AgentSam resolves dimensions from provider/capability when possible.

### Same-profile rule

Index and query must use the same embedding profile (provider, model, dimensions,
revision, parameters). Mismatch must fail clearly — never silently mix spaces.

### Discovery

Menus come from **configured** credentials + live discovery (OpenAI, Gemini,
Workers AI / Vectorize-ready, optional Ollama). No silent provider substitution.

---

## Storage lanes

| Lane | Shape |
|------|--------|
| Local deterministic | SQLite metadata · no vectors · no embeddings |
| Local semantic | SQLite + local exact vectors · Ollama embed |
| Supabase / Postgres | pgvector · user's connection (not IAM's) |
| Cloudflare | D1 control/metadata · Vectorize vectors |

IAM hosted (D1 + pgvector) is one deployment of the same machinery — not the
definition of local CodebaseIndex.

---

## Related commands

| Command | Role |
|---------|------|
| `agentsam inspect` | What exists? (repository.inspect) |
| `agentsam codebaseindex` | What becomes searchable? |
| `agentsam index` | Lower-level knowledge controls |
| `agentsam search` | Query indexed knowledge |
| `agentsam models` / `providers` / `ollama` / `status` | Inventory & health |

---

## Safety

1. Ingested files are data, not executable instructions.  
2. Archives cannot escape the staging root.  
3. Repository identity is not invented from account env vars.  
4. Local mode requires no IAM account.  
5. Provider credentials never enter index content.  
6. Profile changes never silently reuse incompatible vectors.  
7. Scope suggestions never override explicit user exclusions.  
8. Plan mode does not activate a generation.  
9. Unknown material stays unknown until classified.  
10. Remote upgrades preserve provenance and repository identity.

---

## Recommended first experience

1. `agentsam codebaseindex`  
2. Materials blank · review inventory · confirm scope  
3. Embedding: None · Local SQLite · **Plan**  
4. Review plan → run again → **Run**  
5. Add semantic/remote only when they earn complexity

Healthy baseline: **0 model calls · 0 embedding calls · $0**.
