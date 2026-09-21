# Provider tools and conversation compaction

Canonical capability schemas stay in `protocol/`. The Responses runner validates
selected schemas before any paid pre-turn compaction or inference. Provider
adapters also compile at their HTTP boundary for direct SDK callers.

`src/providers/tool-schema.js` owns a bounded supported JSON Schema dialect:
objects, scalar types/enums, arrays and nested anyOf, with supported scalar bounds.
It strips annotation metadata without confusing schema keywords with property
names. OpenAI/Grok strict projections close every object and make optional
properties required-and-nullable. The runtime restores those optional nulls to
omission before invoking canonical handlers. Gemini uses its JSON Schema field,
`parametersJsonSchema`, not the incompatible OpenAPI `parameters` field.

Unknown/unsupported validation keywords, refs, dynamic dictionaries, malformed
required arrays, missing array items and invalid types fail locally with the
provider, tool and schema path. This is deliberately not a general JSON Schema
compiler: adding refs/compositions requires a tested projection, not dropping
validation keywords or changing strict mode. Provider/API acceptance still needs
live integration evidence; local validation cannot prove model availability or
all future provider restrictions.

`knowledge.search` has a real schema for text, bounded search limits, semantic
selection and generation. Runtime-owned cwd is injected by the runner.

## Interactive compaction

- `/compact` uses the selected active session/model's existing native `compact()`.
- `/compact status` reports support, active context, canonical threshold,
  automatic state and the latest receipt.
- `/context` includes the same model-policy threshold and compaction support.
- `/session` and `/usage` include provider compaction usage/cost in cumulative totals.

The exact returned output is canonical continuation input. It may contain both
ordinary provider-returned items and encrypted items; it must not be filtered to
only encrypted items, decoded, or turned into a homemade summary. A dedicated
session record in the same project SQLite stores only the latest pending returned
window (maximum 10 MiB), separately from generic session JSON. It is atomically
saved with its usage/cost receipt, survives resume, and is deleted when a new
provider response ID successfully replaces it. This storage is local access-
restricted SQLite, not an application-level encrypted store; it must never be
exported as knowledge, telemetry, or model reasoning logs.

Automatic pre-turn compaction includes usage/cost in totals and can checkpoint
its output before the subsequent model call. A failed continuation leaves the
saved compacted window available for retry. Providers lacking declared native
compaction fail closed for the manual command. The local context-item truncation
module is unchanged.

OpenAI normal requests use server-side `context_management` when the model
explicitly declares compaction and a canonical policy threshold. The same
`autoCompact: false` option disables both automatic paths. Response-ID chaining
sends only new input; standalone compaction clears the old ID and uses the exact
returned window. Server-side usage is accounted from the normal response.

Sources checked during implementation:
- https://developers.openai.com/api/docs/guides/function-calling
- https://ai.google.dev/api/generate-content#FunctionDeclaration
- https://developers.openai.com/api/docs/guides/compaction
- https://developers.openai.com/api/reference/python/resources/beta/subresources/responses/methods/compact
