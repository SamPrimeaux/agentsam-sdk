# AgentSam Runtime Protocol

> Standing law: **`agentsam.runtime.v1` is the portable execution contract. `agentsamd` and ExecOS are supported runtime implementations/adapters; neither is a transport.**

## Architectural law

**`agentsam.runtime.v1` is the execution authority. `agentsamd` is the stock portable machine daemon for independent installs; ExecOS is a proven managed/platform runtime and dispatcher used by InnerAnimalMedia. Runtime implementations sit behind the same connection/protocol model, and transports stay separate from them.**

Physical D1 tables stay `terminal_*` for this generation. Domain nouns in code are `RuntimeInstance`, `RuntimeConnection`, `RuntimeAdapter`, `RuntimeCapabilities`.

| Noun | Role |
|---|---|
| **agentsamd** | Lives with execution: exec, PTY, fs, processes, git, tools, capabilities, attach |
| **Native helper** (this sprint) | Privileged companion under unprivileged Go: keychain, mounts, devices |
| **ExecOS / EXECOS Worker** (`env.EXECOS` / `EXECOS_IAM`) | Supported managed/platform runtime + cloud→machine dispatch used by InnerAnimalMedia. Historical rows may use `runtime_adapter=execos_legacy`; that compatibility id does **not** imply a retirement decision. |
| **PTY_SERVICE** | VPC/PTY health lane — not the daemon |
| **agentsam-go-worker** | Optional hosted Go service (same Go core). **Not** the Studio control plane |
| **Local Studio Worker** | Stock app host: auth, D1 SSOT, bindings, runtime APIs |

### Four permanent concepts (never conflate)

```text
INSTANCE   what computer/execution environment is this?
ADAPTER    what speaks agentsam.runtime.v1 there?
TRANSPORT  how do we reach that adapter?
AUTH       how is this connection authenticated?
```

Examples:

| | Mac | GCP VM | CF Sandbox |
|---|---|---|---|
| provider | local | google_cloud | cloudflare |
| substrate | host | vm | sandbox |
| lifecycle | persistent | persistent | ephemeral |
| provider_product | (host) | compute_engine | sandbox |
| protocol | agentsam.runtime.v1 | same | same |
| runtime_adapter | agentsamd or ExecOS | agentsamd or ExecOS | cloudflare_sandbox |
| transport | cloudflare_tunnel / direct_https | cloudflare_tunnel / vpc_service | service_binding |
| auth_mode | connection_token | connection_token / platform_bridge | service_binding |

**Forbidden:** `transport IN ('execos','container')` — those were adapter/substrate smuggled into transport.

### ExecOS support status

ExecOS is **supported working machinery**, not presumed deprecated. Current InnerAnimalMedia production/runtime paths still use it for governed dispatch, enrolled-device execution, bridge authentication, terminal/session routing, and `user_hosted_tunnel` flows.

`execos_legacy` exists because earlier rows encoded `execos` as a transport and needed a compatibility mapping into the newer four-axis model. The word `legacy` in that identifier is migration vocabulary; it is **not** authorization to delete, disable, or silently replace ExecOS.

The portability goal is additive:

```text
agentsam.runtime.v1
        ├── agentsamd              stock portable/local runtime
        ├── ExecOS                 supported managed/platform runtime
        ├── cloudflare_sandbox     sandbox adapter
        └── future adapters
```

Where implementations overlap, converge on protocol semantics and acceptance tests. A future deprecation is a separate, evidence-backed product decision.

---

## Runtime Registry (D1 spine — preserve)

```text
ACCOUNT
│
├── agentsam_api_credentials     AAK / BRK
├── cloud_provider_connections   optional provisioning authority (widen providers)
│
└── terminal_instances           WHAT EXISTS
       ├── provider, substrate, provider_product, lifecycle
       ├── platform / arch / capabilities_json
       ▼
    terminal_connections         HOW AGENTSAM TALKS TO IT
       ├── protocol = agentsam.runtime.v1
       ├── runtime_adapter = agentsamd | execos_legacy (ExecOS compatibility id) | …
       ├── transport = direct_https | cloudflare_tunnel | vpc_service | …
       ├── auth_mode
       ├── terminal_connection_credentials
       ├── terminal_enrollment_tokens
       ├── terminal_sessions          interactive PTY
       ├── terminal_jobs              noninteractive (runtime_run_id)
       └── terminal_port_forwards
```

**Do not** introduce parallel `runtime_instances` / `runtime_connections` tables this generation.

### Authority ladder (keep)

```text
AAK / BRK  →  enrollment token  →  connection credential  →  session attach token
```

### Rebuild now (bounded)

1. **`terminal_instances`** — drop `kind`↔provider CHECK; drop `compute_provider`; add substrate / provider_product / lifecycle / hw_model; normalize arch `x64`→`x86_64`.
2. **`terminal_connections`** — replace transport=`execos|container` with `protocol` + `runtime_adapter` + real `transport`; fold `transport_provider` into `transport`; add `endpoint_ref`; stop growing provider-specific columns (keep queried CF indexes for now, prefer `provider_metadata_json`).
3. **`terminal_jobs`** — `execos_run_id` → `runtime_run_id` (all live values null).
4. **`cloud_provider_connections`** — widen `provider`; remove policy CHECK forcing GCP `provider_connection_id`.

### Do not rebuild unless needed

`terminal_connection_credentials`, `terminal_enrollment_tokens`, `terminal_sessions` (optionally rename `auth_token_hash`→`attach_token_hash` while empty), `terminal_port_forwards`, `agentsam_api_credentials`.

---

## Installation grades (this sprint)

| Grade | What |
|---|---|
| **Full daemon** | Go `agentsamd` + enroll + LaunchAgent/systemd |
| **Native helper** | Rust/Zig privileged helper with daemon |
| **Provider adapter** | CF Sandbox etc. (`runtime_adapter=cloudflare_sandbox`) |

```bash
agentsam setup runtime
# plan → create instance → create connection → mint enrollment → agentsamd enroll
```

---

## Protocol surface

```text
identity / capabilities / health
exec / spawn / signal / terminate
pty.create|attach|resize|detach
fs.read|write|list|watch
ports.list|expose
system.inspect
```

---

## Migration priority

1. Freeze vocabulary (this doc + `packages/runtime-protocol`).
2. Rebuild `terminal_instances` (local_device→host).
3. Normalize historical `transport=execos` records into **adapter + real transport** fields. Existing `runtime_adapter=execos_legacy` is a compatibility identifier for ExecOS-backed connections, not a support/deprecation state.
4. Stock independent/local installs may default to `runtime_adapter=agentsamd`; managed/platform installs may continue to use ExecOS. Both remain valid registered runtimes.
5. `execos_run_id` → protocol-neutral `runtime_run_id` where that column still encodes implementation detail.
6. Widen `cloud_provider_connections`.
7. Heartbeats fill `capabilities_json`, `provider_product`, and lifecycle facts from the selected runtime.
8. `agentsam setup runtime` writes records from GOAP plans without assuming one runtime implementation.
9. Prove overlapping ExecOS / agentsamd operations against the same `agentsam.runtime.v1` semantics instead of removing one merely because the other exists.
10. Any future narrowing or retirement of ExecOS requires an explicit product decision, inventory of production callers, proven replacement parity, migration plan, acceptance tests, and approval.

---

## Rejected

- Parallel `runtime_*` physical tables beside `terminal_*` this generation
- `transport = execos` or `container`
- kind↔provider coupling (VM=Google only, etc.)
- Soft dual-write forever
- Casting agentsam-go-worker as the EXECOS/control plane
- Stock dependence on `load-agent-env.sh`

---

## Success criteria

- User123 can install Studio → `setup runtime` → enroll the stock `agentsamd` runtime (+ native helper where needed) → attach without InnerAnimalMedia infrastructure.
- Existing InnerAnimalMedia ExecOS connections remain supported and functional while sharing protocol-neutral registry/session concepts.
- Same protocol semantics can be implemented across Mac / GCP VM / Docker / CF Container; Sandbox remains an adapter.
- Transport can change without renaming the instance or changing runtime/session semantics.
- D1 spine stays `terminal_*`; vocabulary remains instance + adapter + transport + auth.
- The historical string `execos_legacy` is treated as compatibility vocabulary only. **Do not infer support lifecycle from the identifier.**
- Duplication between ExecOS and agentsamd is resolved by shared contracts/tests and explicit routing, not by deleting proven machinery without parity.
