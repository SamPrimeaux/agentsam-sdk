# Filesystem & Code

Reading/writing/searching files, AST-level codebase retrieval, code index builds, Merkle diffing, and knowledge ingestion.

**20 tools** in this domain.

## `code` (1)

- **`agentsam_codebase_retrieve`** (Codebase AST Retrieve) — Query-type-routed codebase retrieval: exact name/calls/exports resolve from D1 AST without embeddings; fuzzy natural-language questions use OpenAI embeddings → pgvector AST symbols, then optional one-hop graph expand. mode is a HARD override: structural=D1 only, semantic=pgvector ANN, auto=classify first. Empty structural lookups escalate to semantic unless escalate=false. Do NOT use agentsam_d1_query for source code. _★ heavily used (327 calls)_

## `code.index` (1)

- **`agentsam_code_index_build`** (Code Index Build) — Start or observe the existing account/repository-scoped index pipeline. Does not implement parsing/embedding/activation itself. _never used_

## `code.search` (2)

- **`agentsam_github_grep`** (GitHub Grep (live tree)) — GitHub Code Search API alias of agentsam_github_search (repo-scoped via OAuth). Not local disk, not PTY ripgrep — use fs_search_files or agentsam_grep for those.
- **`agentsam_grep`** (Grep (github | filesystem | terminal rg)) — Ripgrep over the workspace checkout. Default lane: MY_CONTAINER (works when Mac PTY is down). Optional fast lane: local PTY working tree.

## `filesystem` (10)

- **`agentsam_filesystem_git_status`** (Filesystem Git Status) — Structured staged/unstaged/untracked via git status --porcelain under workspace_root.
- **`agentsam_filesystem_hash_many`** (Filesystem Hash Many) — Batch content hashes. content_mode raw_bytes|git_blob. _never used_
- **`agentsam_filesystem_stat_many`** (Filesystem Stat Many) — Batch stat metadata under approved workspace_root. _never used_
- **`agentsam_filesystem_walk`** (Filesystem Walk) — Walk approved workspace_root with containment limits. Prefer over terminal find for tree inspection.
- **`agentsam_merkle_build`** (Merkle Build) — Construct + persist content-addressed fs-merkle-v1 snapshot (github|execos|entries).
- **`agentsam_merkle_compare`** (Merkle Compare) — Domain-checked Merkle diff. Refuses mismatched leaf_hash_domain.
- **`agentsam_merkle_delete`** (Merkle Delete) — Delete snapshot R2 body + thin D1 index row. _never used_
- **`agentsam_merkle_explain`** (Merkle Explain) — Explain why a folder changed (V1 honest subset — no pure-rename claim).
- **`agentsam_merkle_get`** (Merkle Get) — Fetch snapshot path/children by snapshot_id from R2+D1 index.
- **`fs_list_dir`** (List directory) — List entries on the active Files plane: Local FSA when connected; else host path on the caller tunnel. When files_source=r2, lists the selected R2 bucket/prefix. Not a terminal tool, not GitHub.

## `filesystem.edit` (1)

- **`fs_edit_file`** (FS Edit File) — Patch a file in the connected local filesystem only. GitHub edits must use agentsam_github_patch with explicit repo and branch. _risk: high_

## `filesystem.read` (1)

- **`fs_read_file`** (FS Read File) — Read a workspace file (Local folder / PTY / GitHub committed tip). Default max_bytes=32768 with byte_offset pagination. Prefer line_start/line_end from agentsam_codebase_retrieve over whole-file reads. _★ heavily used (546 calls)_

## `filesystem.search` (1)

- **`fs_search_files`** (Search Files (rg)) — Ripgrep over the workspace checkout. Required: query. Optional: path. Never call with {}. _★ heavily used (530 calls)_

## `filesystem.write` (1)

- **`fs_write_file`** (FS Write File) — Write a file to the connected local filesystem only. GitHub writes must use agentsam_github_write with explicit repo and branch. _risk: high, ★ heavily used (101 calls)_

## `knowledge` (1)

- **`agentsam_knowledge_ingest_segment`** (Knowledge ingest segment) — Canonical atomic knowledge write (ingest_segment). Pass a full ingest_segment payload, or markdown + file_name for the docs topic adapter. _never used_

## `repository.evidence` (1)

- **`agentsam_repository_snapshot`** (Repository Snapshot) — Capture the canonical agentsam.snapshot.v1 repository evidence packet. Deterministic filesystem inspection delegated to the SDK on an authorized host. _**inactive**, never used_
