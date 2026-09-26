# AgentSam Runtime Protocol

> Branch: `feat/runtime-protocol-agentsamd`. Law: **agentsamd is the machine daemon; providers are adapters.**

## Architectural law

**agentsamd is the AgentSam machine/runtime daemon. Providers are adapters beneath it.**

Physical D1 tables stay `terminal_*` for this generation. Domain nouns in code are `RuntimeInstance`, `RuntimeConnection`, `RuntimeAdapter`, `RuntimeCapabilities`.

| Noun | Role |
|---|---|
| **agentsamd** | Lives with execution: exec, PTY, fs, processes, git, tools, capabilities, attach |
| **Native helper** (this sprint) | Privileged companion under unprivileged Go: keychain, mounts, devices |
| **EXECOS Worker** (`env.EXECOS` / `EXECOS_IAM`) | Interim cloud→machine hop + session/job writes. Becomes `runtime_adapter=execos_legacy`, then retires |
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
| runtime_adapter | agentsamd | agentsamd | cloudflare_sandbox |
| transport | cloudflare_tunnel / direct_https | cloudflare_tunnel / vpc_service | service_binding |
| auth_mode | connection_token | connection_token / platform_bridge | service_binding |

**Forbidden:** `transport IN ('execos','container')` — those were adapter/substrate smuggled into transport.

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
       ├── runtime_adapter = agentsamd | execos_legacy | …
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

1. Freeze vocabulary (this doc + `packages/runtime-protocol`)
2. Rebuild `terminal_instances` (local_device→host)
3. Rebuild `terminal_connections` (execos→`runtime_adapter=execos_legacy`)
4. New enrollments default `runtime_adapter=agentsamd`, `protocol=agentsam.runtime.v1`
5. `execos_run_id` → `runtime_run_id`
6. Widen `cloud_provider_connections`
7. Heartbeat fills `capabilities_json`, `provider_product`, lifecycle facts
8. `agentsam setup runtime` writes these records from GOAP plans
9. After agentsamd proven: migrate live ExecOS rows `execos_legacy` → `agentsamd`
10. Keep ExecOS as adapter during cutover — never as the architecture

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

- User123: Studio → `setup runtime` → enrolled agentsamd (+ native helper on host) → attach
- Same protocol on Mac / GCP VM / Docker / CF Container; Sandbox via adapter
- Transport changes without renaming the instance
- D1 spine stays `terminal_*`; vocabulary is four-axis + adapter + transport
- ExecOS is `execos_legacy` until retired; agentsamd is the computer
