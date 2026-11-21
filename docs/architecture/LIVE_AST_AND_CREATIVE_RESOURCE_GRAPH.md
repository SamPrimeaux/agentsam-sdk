# AgentSam live AST and creative resource graph

**Scope:** Local SDK initial capability, 2026-11-20. The hosted D1 registry and
`agentsam_codebase_retrieve` have **not** been migrated by this change.

## Why this exists

`agentsam init . --yes` adopts an existing source checkout without an index.
That should be enough to inspect available source with the appropriate parser.
Historically the hosted `agentsam_codebase_retrieve` resolves an ACTIVE index
generation before *any* structural D1 lookup. That remains useful for persisted
history/graph intelligence, but it is not a requirement for live AST work.

These are separate, complementary capabilities:

1. **Live syntax/structure** — parse the working tree at request time, no
   D1/SQLite/vector/embeddings/GitHub/auth/network prerequisite.
2. **Repository index** — optional persistent, versioned AST nodes and
   cross-file graph, with generation/revision provenance and incremental refresh.
3. **Semantic retrieval** — optional embedded concepts and similarity search.
4. **Creative resource graph** — typed, format-aware object structures, not
   arbitrary text chunks.

Do not rename the older indexed tool to pretend it already does live parsing.
A live AST provider and indexed provider should be separately discoverable, with
explicit selection and honest capability/result metadata.

## Initial SDK implementation

`src/indexing/live-ast.js` supplies:
- `searchLiveAst(root, symbol, opts)`: local JavaScript/TypeScript compiler AST.
- `matchLiveAst(root, grammarPattern, {language, path})`: installed ast-grep
  real language grammar, including Python/Rust/Go when supported. No silent
  lexical fallback when a grammar or binary is missing.
- `createLiveAstRepositoryProvider(root)`: satisfies the portable
  `RepositoryKnowledgeProvider` methods; `snapshot()` explicitly declares
  that live evidence is not a persisted immutable snapshot.

`src/indexing/live-cad-graph.js` supplies `inspectLiveCadProject` over existing validated `cad.project.v1` and `cad.project.v2` projects, retaining stable entity IDs, relationships, coordinate units and wall assemblies.
A glTF preview is NOT an editable native CAD authority. This CAD inspector is
read-only and does not evaluate OCCT BRep, IFC or native FreeCAD objects.

`src/indexing/live-resource-graph.js` initially provides
`inspectLiveGltf(root, relativeFile)`, with individually addressable glTF 2.0
nodes, scenes, meshes, materials/PBR, textures, cameras, skins, images, and
references. Each object returns its file-relative JSON Pointer, source hash,
and optional authored ID. Array positions are **not** persistent identities.

Examples:

```sh
agentsam init . --yes
agentsam ast symbols AgentComposer --cwd .
agentsam ast match --pattern 'def $NAME($$$ARGS): $$$BODY' --lang python --cwd .
agentsam ast scene assets/house.gltf --cwd .
agentsam ast cad .agentsam/cad/projects/house/1.json --cwd .
```

Initial source scanning uses an authorized root, a bounded file/entry traversal,
symlink refusal, content size limits, line references and explicit parse errors.
This slice does **not** yet implement cross-file symbol resolution or a full
scene/BIM authoring workflow. It is source inspection only.

## Production integration required

The hosted tool `agentsam_codebase_retrieve` is generation-scoped. Keep it for
indexed retrieval. Offer distinct, real live tool keys after runtime handlers
and tests exist, e.g.:

- `agentsam_ast_live`: symbol/query/grammar + workspace_root + source lane.
- `agentsam_resource_graph_live`: format + path + scope + object query.
- `agentsam_codebase_retrieve`: explicitly indexed graph and semantic route.

Do **not** create active `agentsam_tools` rows for unimplemented handlers.
A live terminal source must be bound to the authenticated user's authorized
local device/workspace and must not silently clone GitHub or jump to another
account. Hosted Workers do not have the user's filesystem.

Live response provenance should include `source`, `workspace_root` (internal
only where required), `path`, `span` or `resource_pointer`, `parser`,
`source_hash`, `git_revision` when available, `truncated`, and diagnostics.
Indexes additionally report `repository_id` and `index_generation_id`.
Explain missing coverage rather than returning empty results as exhaustive.

## Multi-domain creative contract

For each resource type, ship a **format-specific parser adapter** with:

- `detect` (content/version identification)
- `parse` (typed syntax or object tree, no text flattening)
- `nodes` (stable authored IDs if available; source-path/version/pointers)
- `edges` (object references, dependency and ownership relationships)
- `inspect` (bounded properties with units and schema/version)
- `validate` (broken refs, unsupported nodes, transforms, units)
- `patch` / `serialize` (future explicit editor-controlled revisions,
  atomic changes, and round-trip preservation)

Priority format families:

| Domain | Parser/runtime boundary | Structured units |
| --- | --- | --- |
| JS/TS | TypeScript AST; typechecker/project graph next | symbols, imports, calls, types |
| Python/Rust/Go and other code | ast-grep/Tree-sitter grammar adapters, optional LSP | definitions, references, syntax |
| glTF/GLB | glTF 2.0 asset graph; binary GLB adapter remains future | scenes, objects, meshes, PBR, animation |
| AgentSam CAD v1/v2 | existing portable project validators and editable schema | geometry entities, wall assemblies, relationships, scenes, units |
| IFC/BIM | IFC schema/version-aware native parser (not regex) | entities, relations, placements, property sets, units |
| STEP/BRep and CAD | OCCT/STEP parser + parametric feature provenance | solids, faces, edges, topology, features |
| OpenSCAD | language parser + evaluated solid/CSG graph | modules, parameters, CSG operations |
| USD | USD scene-composition parser/runtime | prims, layers, variants, materials, references |
| SVG/design | XML/SVG DOM with reversible source mappings | groups, paths, text, transforms, styles |
| Media/timeline | format-aware compositions/edits | tracks, clips, keyframes, effects |
| CMS/layout | app-owned schema/section/block parsers | sites, pages, sections, blocks, assets |

Do not claim that a file extension or JSON parser alone grants IFC, OCCT,
OpenSCAD, Blender, or USD AST understanding. A grammar's syntax tree and
evaluated domain model are also separate: a valid source AST does not establish
correct geometry or physical units.

## Acceptance boundary

- Any *supported* local source project can be adopted without indexing.
- Live JS/TS and optional other installed grammar patterns resolve on the
  current source tree, including uncommitted edits.
- No unexpected D1, embeddings, clone, storage upload, or index activation.
- Results cannot silently claim cross-file edges where resolution is absent.
- Typed scene objects are individually inspectable with source revision
  locators; a material is not flattened into a scene text blob.
- Further IFC/OCCT/USD/MovieMode/CMS integrations are **not shipped** by this
  first implementation and must be covered by adapter-specific tests.
