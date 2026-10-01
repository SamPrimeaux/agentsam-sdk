# Specific, definitive, repurposable errors

**Status:** plan only. No catalog, generator, or source changes land with this document.
**Base:** `main` @ `dfb40ed`. Written from reading `protocol/errors/error-catalog.json`, `scripts/generate-error-contracts.mjs`, `packages/agentsam-errors/src/{envelope,error,index}.js`.
**Goal:** an error should say exactly what failed, with the evidence needed to act on it, so nobody re-inspects or re-invents when a tool or CLI breaks in the field. `input_invalid` is a category. The response should be the specific cause, for example `cli_flag_value_invalid` with the flag, the value, and what was expected.

---

## 1. What exists and what is missing

What already works and should be kept:
- One catalog (`error-catalog.json`) generates the runtime vocabulary, the TypeScript types, and the JSON schema. Do not hand-edit generated files.
- One envelope (`AgentSamErrorEnvelope`) with code, reason, severity, owner, retryable, remediation, resource, operation, retry, fallback, redaction, fingerprint.
- Specific, domain-prefixed reasons already exist for CAD (`cad_geometry_invalid`, `cad_tool_version_incompatible`, `cad_output_missing`, and more), Docker, GCP, GitHub and Cloudflare. The model works. It just was not applied to the generic core.

What is vague or missing (each verified in source):

| Gap | Evidence | Effect |
|---|---|---|
| Generic core reasons are broad | `input_invalid`, `input_out_of_range`, `precondition_failed`, `conflict`, `stale_version`, `target_not_found`, `execution_failed`, `persistence_failed`, `internal*` | Many unrelated failures collapse into one label. The caller must inspect the message or logs to learn the cause. |
| A catalog row carries policy only | rows hold code, severity, retryable, owner, remediation action | Nothing says which evidence a given reason must include. `details` is free-form in the schema. |
| Uncatalogued reasons are accepted silently | `createErrorEnvelope` accepts any reason matching the name pattern and falls back to the `unknown` policy | A typo or ad hoc reason yields code `UNKNOWN`, severity `blocking_internal`, with no failure. |
| No lineage from specific to generic | CAD reasons are not linked to `input_invalid` etc. | A consumer that only knows generic reasons cannot degrade gracefully. |
| One central catalog | only the core generator edits it | Packages, apps and customer repos cannot define their own exact reasons without editing core. |
| No message or remediation templates | remediation is an action enum plus optional free text | Messages and fix commands are re-written at every call site. |

Design note: the schema currently says to prefer `failure_class` over exploding the reason list. The existing CAD, Docker, GCP, GitHub and Cloudflare reasons already go the other way. This plan resolves the tension: keep `failure_class` as the cross-cutting dimension (retry and fallback strategy), and make `reason` carry exactly what failed, organized under a stable generic parent so top-level policy does not drift.

## 2. Naming rule

`<namespace>_<subject>_<condition>`

- `namespace`: the owning package or domain (`cli`, `manifest`, `goap`, `cad`, ...).
- `subject`: the thing that failed (`flag`, `blackboard`, `goal`, `path`).
- `condition`: from a short controlled list (`missing`, `invalid`, `unsupported`, `not_found`, `stale`, `conflict`, `exhausted`, `denied`, `unreachable`, `timeout`, `corrupt`).
- A new reason must be specific enough that its `details` can be fully typed. If it cannot, it is still a category and is not a valid new emittable reason.
- Denylist for new emittable names: `error`, `failed`, `invalid`, `bad_input`, `unknown_error`, and any name with no subject.

## 3. Catalog v2 row

Additive fields on each reason. Existing rows keep working unchanged.

| Field | Purpose |
|---|---|
| `parent` | an existing generic reason; must resolve to the same `code` (already enforced for catalogued reasons) |
| `abstract` | true for generic reasons: parents only, not to be emitted by new code |
| `details_schema` | required evidence keys with types; marks which fields are safe to show a user versus operator-only |
| `message_template` | message built from `details` placeholders |
| `remediation` | action (existing enum), message template, and command template where one exists |
| `namespace_owner` | the package or app that owns this prefix |
| `since` | version introduced |

Envelope: add one optional field, `reason_parent`, so a consumer that does not know a child reason can fall back to its parent without the catalog. The envelope schema is generated, so this is a catalog and generator change, not a hand edit.

## 4. Typed constructors, strict mode

- The generator emits one constructor per reason, for example `errors.cli_flag_value_invalid({ flag, value, expected, command })`. The constructor validates `details` against `details_schema`, renders the message, and fills remediation. Call sites stop assembling envelopes by hand.
- `createErrorEnvelope` gains a strict mode that throws on an uncatalogued reason. Strict is the default in tests and CI and for every new emitter. Existing legacy emitters are listed in a shrinking allowlist (a ratchet): the list may only get shorter.

## 5. Repurposable packs

Each package or app may ship an `errors.pack.json` that contributes reasons inside its own namespace. The generator merges core and packs. It rejects reasons outside the contributing pack's namespace and rejects collisions. A customer repo adds its own exact reasons without forking core, matching the existing rule that customer differences live in manifests and data. The existing generic schema-pack protocol (`protocol/database/agentsam.schema-pack.v1.schema.json`) is the precedent for the manifest shape; reuse its conventions rather than inventing a new one.

## 6. Worked examples

Decomposing `input_invalid`:

| Specific reason | Required details | Parent |
|---|---|---|
| `cli_flag_unknown` | `command`, `flag`, `suggestions[]` | `input_invalid` |
| `cli_flag_value_invalid` | `command`, `flag`, `value`, `expected` | `input_invalid` |
| `cli_argument_missing` | `command`, `argument` | `input_invalid` |
| `manifest_field_missing` | `manifest_path`, `field_pointer` | `input_invalid` |
| `manifest_schema_violation` | `manifest_path`, `violations[]` with `pointer`, `keyword`, `expected`, `actual` | `input_invalid` |
| `path_not_found` | `path`, `cwd` | `target_not_found` |
| `path_outside_scope` | `path`, `scope_root` | `repository_scope_violation` |
| `json_parse_failed` | `source`, `line`, `column` | `input_invalid` |
| `id_format_invalid` | `field`, `value`, `expected_pattern` | `input_invalid` |

GOAP (replaces the coarse mapping in `GOAP-ALIGNMENT`):

| Specific reason | Required details | Parent |
|---|---|---|
| `goap_blackboard_revision_stale` | `blackboard_id`, `expected_revision`, `actual_revision`, scope | `stale_version` |
| `goap_goal_not_found` | `goal_id`, scope | `target_not_found` |
| `goap_goal_status_unsupported` | `status`, `supported[]` | `input_invalid` |
| `goap_port_method_missing` | `port`, `method` | `unsupported_operation` |
| `goap_scope_field_missing` | `field` | `input_invalid` |

These names and detail sets are proposals. Domain values must come from the existing catalog domains; whether `cli` and `manifest` need new domains is an open question.

## 7. Gates (extend `errors:check`)

1. Every reason emitted in source exists in the catalog or a merged pack.
2. Abstract reasons are not emitted outside the legacy allowlist, and the allowlist never grows.
3. Every emittable reason has a `details_schema`, a `message_template`, and at least one golden envelope fixture test.
4. New names pass the naming rule and denylist.
5. Pack namespaces are owned and collision-free.
6. Generated files are current.

## 8. CLI and tool surfaces

- `agentsam errors list` and `agentsam errors explain <reason>` print parent, severity, owner, required details, and the fix command, generated from the catalog.
- `agentsam errors audit` reports emission counts per generic reason across the repo, to rank which generic reasons to decompose first. It replaces guessing.
- Tools reached through the mcp-bridge must return an envelope with a catalogued reason on failure; this belongs in `ADAPTER_CONTRACT.md`.

## 9. Phases and exit gates

| Phase | Scope | Exit gate |
|---|---|---|
| 0 | `errors audit` report; read `fingerprint.js`, `normalize.js`, `recovery.js`, `render.js` and record how each treats `reason` | Written findings; confirm fingerprints use the reason and stable detail fields only, not volatile values |
| 1 | Catalog v2 fields, generator support, strict mode, new gates; no new reasons yet | `errors:generate` and `errors:check` green; existing tests unchanged |
| 2 | Typed constructors generated; first decomposition of the top generic reasons from the audit | Golden fixtures per reason; legacy allowlist recorded |
| 3 | Packs: first consumers are `goap` and one CLI namespace | Pack merge, collision and namespace tests pass; GOAP no longer emits bare `TypeError` |
| 4 | CLI `errors` commands; adapter contract update | Commands work from the packed artifact outside the monorepo |
| 5 | Ratchet: allowlist shrinks each release until abstract reasons are not emitted | Allowlist empty or explicitly justified |

## 10. Compatibility

Parents are never removed. Existing reasons, codes, HTTP and gRPC mappings, and consumers keep working. A consumer that only knows parent reasons keeps working through `reason_parent`. The old GOAP `goap_revision_conflict` code is not part of the catalog today and is replaced by the specific reason in section 6.

## 11. Open questions

1. Do `cli` and `manifest` need new `domain` values, or do existing domains (`tool`, `runtime`, `repository`) cover them?
2. Is `reason_parent` an envelope field, or derived by consumers from a shipped lineage table? The envelope is `additionalProperties: false`, so either choice is a schema change.
3. How do `fingerprintError` and `normalize` handle new reasons? Not read yet.
4. Which detail fields are safe for end users, and how does the redaction layer treat each?
5. Pack distribution: shipped inside the package, or merged into a registry file at build time?

## 12. Not verified

Nothing here was executed. The catalog, generator and envelope code were read; tests, `errors:check`, and CI results were not available.
