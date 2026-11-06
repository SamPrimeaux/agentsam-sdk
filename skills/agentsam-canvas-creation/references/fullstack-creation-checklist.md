# Full-stack creation readiness (domain-neutral)

Before calling an artifact executable or production-prepared, establish:

- **Intent and source:** owner, creative direction, project, original assets,
  provenance, licensing when known and expected user outcomes.
- **Structure:** routes/pages/scenes, hierarchy, reusable components and
  real content slots, stable IDs and responsive constraints.
- **Client behavior:** focus, navigation, validation, keyboard and pointer
  interactions, loading/empty/error states, accessibility and reduced motion.
- **Data:** explicit static-versus-live bindings, ownership and schemas,
  missing-data behavior and separation of demo data from persisted records.
- **Server behavior:** actual service/operation ownership, authorization
  (verified principal), request and response schemas, idempotency,
  revision conflicts and side-effect boundaries. Do not infer authority
  from a route, query parameter, workspace ID or browser storage.
- **Assets:** source preservation, authorized storage references, generated
  revisions, optimization and recoverable missing-asset states.
- **Observability:** operation IDs, scoped targets, real stage events,
  errors, cancellation/retry semantics and appropriate audit receipts.
- **Persistence:** working/saved revision, refresh/back idempotency, save,
  reopen and recovery; publication is separate and explicit.
- **Validation:** type/schema tests, permission negatives, editor interaction,
  responsive and live route verification. No fixture-only success claims.

If the host lacks a required backend operation, surface that gap and implement
or obtain an authorized adapter before claiming the Canvas is fully working.
Do not generate fake API contracts or assume a deployed service exists.
