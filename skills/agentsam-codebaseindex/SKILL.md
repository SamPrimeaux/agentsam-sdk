---
name: agentsam-codebaseindex
description: Guide codebase ingest — materials (zip/tar/html/images/glb), allowlists, embedding/storage choices, and sam.codebaseindex.index.run.
---

# AgentSam Codebaseindex

**SAM operation:** `codebaseindex.ingest`  
**Pipeline id:** `sam.codebaseindex.index.run`  
**CLI:** `agentsam codebaseindex` · alias `agentsam ingest`

## What this is

Systems Automation Machinery for turning repositories **and dropped materials** into a searchable knowledge index.

Embeddings are optional. AST/text indexing is the `$0` default.

## Quick start

```sh
agentsam codebaseindex
# tip: use skill agentsam-codebaseindex
```

Guided (clack) steps:

1. Paste/drop materials (or leave blank for repo-only)
2. Allowlist include / exclude
3. Storage: sqlite (local) or postgres
4. Embedding model: none | gemini | openai | ollama
5. Plan or run

Non-interactive:

```sh
agentsam ingest --paths ./dist,./site.tar.gz --include src,docs --embedding none --yes
agentsam codebaseindex --embed --embedding gemini:gemini-embedding-2:768 --yes
```

SDK:

```js
import { AgentSamClient } from '@inneranimalmedia/agentsam-sdk';
const sam = new AgentSamClient();
await sam.invoke('codebaseindex.ingest', {
  root: '.',
  materials: ['./legacy-site.tar.gz'],
  embed: false,
});
```

## Materials

The CLI accepts **pasted or drag-dropped paths**:

| Kind | Examples | Behavior |
|------|----------|----------|
| Archive | `.zip` `.tar` `.tgz` `.tar.gz` | Extract under `.agentsam/ingest/<id>/` |
| Tree | build/site folders | Include or copy into stage |
| Document | `.html` `.md` `.css` `.json` | Staged + allowlisted |
| Image | `.png` `.jpg` `.webp` `.svg` | Asset catalog in receipt |
| 3D | `.glb` `.gltf` `.obj` | Asset catalog in receipt |
| Code | `.js` `.ts` `.py` … | Indexed with AST/text |

Tip: drop a production build tarball the same way you drop a repo folder.

## Skills tip (machine baseline)

Every AgentSam CLI command prints:

```text
tip: use skill <id>
```

Load instructions anytime:

```sh
agentsam skills agentsam-codebaseindex
agentsam skills agentsam-codebaseindex --references
```

## Related

- `agentsam index plan|run` — lower-level knowledge commands
- `agentsam search "query"` — retrieve after ingest
- `agentsam inspect` — repository evidence without indexing
- Host IAM full pipeline may escalate beyond local SQLite when account-scoped
