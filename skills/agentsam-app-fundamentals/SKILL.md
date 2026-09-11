---
name: agentsam-app-fundamentals
description: >
  Keep application-building work grounded in execution domains, contracts, credentials,
  dependency graphs, AST evidence, Merkle evidence, and explicit I/O boundaries. Use when
  adding or reviewing a feature, service, package, API, auth flow, secret, integration,
  frontend/backend boundary, worker, webhook, or external credentialed destination. Also
  use for quick reminders when a large codebase makes the underlying mechanics hard to
  keep in working memory. Triggers on "app fundamentals", "quick bytes", "trust boundary",
  "client secret", "redirect URI", "frontend/backend", "AST", "Merkle", "contract drift",
  "service boundary", "credentialed destination", and "where should this logic live".
metadata:
  short-description: "Application-building laws: ownership, contracts, credentials, graphs, AST, and Merkle evidence"
  aliases:
    - app-fundamentals
    - application-fundamentals
    - quick-bytes
user-invocable: true
---

# AgentSam Application Fundamentals

Use this skill as a **small engineering compass**, not a giant textbook. A large
platform becomes manageable when every feature can answer a few mechanical
questions: who executes it, who owns authority, what contract crosses the boundary,
what credential is used, what it depends on, and what evidence proves the change.

## Quick bytes

- **Execution domain:** trust follows who controls the machine/runtime, not the folder name.
- **Browser/client:** user-controlled and therefore observable/tamperable. Never make it the final authority for security or privileged state changes.
- **Server/backend:** operator-controlled execution. Re-verify identity, authorization, ownership, prices, permissions, and other invariants here.
- **Import:** a dependency edge. **Export:** a public contract another module may depend on.
- **AST:** parsed code structure. Use it to identify symbols, imports/exports, calls, environment access, and execution-domain contradictions without relying on text grep alone.
- **Dependency graph/DAG:** the map of what depends on what. It determines blast radius, build order, affected tests, and what can run in parallel.
- **Schema/contract:** the agreed shape at a boundary. Compile-time types help; runtime validation proves real external data matches the contract.
- **Merkle/content hash:** identity for observed bytes. A changed root proves something changed; an unchanged root proves the captured content is identical under the same policy.
- **Semantic metadata root:** identity for the indexed/classified view of those bytes. It can change when execution classification or parser-derived meaning changes even when content does not.
- **Client ID:** usually a public application identifier. **Client secret/API secret:** a credential proving authority; keep it out of browser code and public bundles.
- **Redirect URI:** an explicitly registered destination for an authorization flow. The provider returns to the callback; your backend verifies the flow, establishes your app session, then chooses the final in-app destination.
- **Firewall/WAF:** an ingress filter. It reduces hostile traffic; it does not replace authentication, authorization, ownership checks, runtime validation, or least privilege.
- **Hook:** code that runs automatically because a lifecycle event occurred. Treat hooks as explicit I/O contracts, not mystery scripts.

If one of those concepts is fuzzy for the current task, read the matching reference
before editing.

## The six questions for every feature

Before changing code, be able to answer:

1. **User behavior:** what can the user now do?
2. **Execution owner:** which runtime is trusted to make the decision or perform the side effect?
3. **Contract:** what request/event/type/schema crosses each boundary?
4. **State:** what is ephemeral, browser-local, durable, cached, or externally owned?
5. **Credentialed destinations:** which external systems are called, from which runtime, with which public IDs/secrets/scopes?
6. **Proof:** which tests, AST/index evidence, Merkle receipt, runtime response, or observable metric proves it works?

If a feature cannot answer these, it is not ready to be called complete.

## Build vertical slices, not disconnected layers

For application work, trace the real behavior end to end:

```text
user action
  -> client intent
  -> validated boundary contract
  -> trusted server/domain operation
  -> database/service/provider side effect
  -> response/event
  -> client state/render
  -> test + runtime proof
```

A button without the trusted operation behind it is incomplete. A backend endpoint
without a real consumer may be dead surface area. A shared type without runtime
validation is not proof that an external system obeyed the type.

## Credentialed-destination card

Whenever a feature talks to Google, GitHub, Cloudflare, Stripe, a model provider,
a database, another Worker/service, or any other privileged destination, write down
this card before wiring it:

```text
Destination
  provider/service:
  purpose:
  caller execution domain:
  public identifier(s):
  secret credential(s):
  credential owner/runtime:
  allowed origin/host:
  callback/redirect/webhook URI(s):
  scopes/permissions:
  request contract:
  response contract:
  timeout/retry/idempotency:
  failure behavior:
  audit/observability:
  rotation/revocation path:
```

This turns "a pile of env vars" into an explicit relationship. Environment variable
names are configuration labels; the credential value is the sensitive authority.
Validate required configuration at boot or boundary entry and fail clearly.

Read `references/trust-credentials-and-destinations.md` for auth/OAuth and destination
mechanics.

## Graph law for packages/services/apps

As a system grows, do not rely on remembering which file "goes with" another file.
Make coupling machine-visible:

```text
package/service A
  imports / calls / subscribes to
package/service B
  implements contract C
  owns state D
  uses credential E
```

Prefer a single contract authority for cross-surface behavior: a shared type/schema,
OpenAPI/GraphQL/Protobuf definition, event schema, or other versioned interface. Use
AST/import graphs and package metadata to determine affected dependents instead of
manually searching a million-line repository.

Read `references/graphs-contracts-ast-merkle.md` for the deeper model.

## AgentSam evidence tools

Prefer deterministic evidence before broad model reasoning:

```bash
agentsam inspect --json
agentsam inspect --execution-domain browser --view files --json
agentsam security scan --path .
agentsam merkle ...
agentsam index ...
agentsam search ...
```

Use repository/index tools to narrow the relevant graph. Do not dump the whole repo
or all tool schemas into context.

## Rules while building

1. Never infer trust from `frontend/`, `backend/`, `worker/`, or `shared/` names alone; verify execution reality.
2. Never put a long-lived secret into code delivered to a user-controlled runtime.
3. Never let client-side validation be the only security or correctness check.
4. Never introduce a second contract authority when an existing canonical schema/type can be extended.
5. Never change a shared contract without identifying downstream dependents.
6. Never treat a Merkle hash as proof of correctness; it proves observed identity/change, not behavior.
7. Never treat AST/index output as infallible; account for parser coverage, generated/framework code, and explicit classification overrides.
8. Never let a hook silently mutate unrelated state. Bound its inputs, outputs, permissions, timeout, and failure policy.
9. Never call a credential "just an env var." Record who owns it, where it may exist, and what it authorizes.
10. Never ship a cross-layer feature from screenshots alone. Exercise the real I/O path.

## Handoff to progression guard

Once the feature's boundaries are coherent, use `agentsam-progression-guard` to decide
**when and where those invariants must be re-proven** during commit, CI, deploy, and
runtime promotion.
