# SAM Kernel — Systematic Autonomous Machinery

**Status:** LOCKED vocabulary + seed contracts (2026-09-25)  
**Product:** AgentSam (`@inneranimalmedia/agentsam-sdk`)  
**Machinery:** SAM = **Systematic Autonomous Machinery**

This document is the canonical architecture for how AgentSam exposes work. It does **not** replace `AGENTSAM.md` runtime agent law; it defines the developer-facing execution spine.

---

## Naming (non-negotiable)

| Term | Meaning |
|------|---------|
| **AgentSam** | Product / SDK / CLI / platform |
| **SAM** | **Systematic Autonomous Machinery** — the execution architecture underneath AgentSam |
| **`sam`** | Conventional client variable for that machinery — **not** a human identity or owner name |
| **`sam.invoke()`** | Universal normalized execution doorway |

Docs and comments prefer:

- “SAM resolves the registered operation…”
- “AgentSam executes the operation through SAM…”

Never:

- “Sam will decide…”
- anthropomorphic `sam.ask()` / `sam.think()` as public verbs

---

## Hierarchy

```text
@inneranimalmedia/agentsam-sdk
│
├── AgentSamClient   (sam)
│     ├── session: login / logout / whoami
│     ├── runtime: status / configuration
│     └── SAM: invoke / describe / discover + domain modules
│
├── SAM Kernel
│     auth · schemas · policy · execution lanes · events · errors · receipts
│
├── Modules (brand, repository, knowledge, security, cad, cms, …)
│     register operations into the kernel — they do not own a second runtime
│
├── Operations · Capabilities · Tools · Skills · Pipelines · Providers · Contracts
└── Projections: TypeScript · CLI · MCP · HTTP · Python · Workbench · docs
```

**CLI is a projection, not the source of truth.** Canonical identity is the **operation ID**.

---

## Four seed primitives

| Primitive | Role |
|-----------|------|
| `defineSamOperation()` | Register one operation (schemas, lanes, model policy, handler) |
| `sam.invoke(id, input, options?)` | Execute any registered operation |
| `sam.describe(id)` | Metadata / schemas / requirements without execution |
| `sam.discover({ query })` | Compact operation cards before schema hydration |

Domain ergonomics are projections of `invoke`:

```js
await sam.brand.scan({ root: '.' });
// ≡
await sam.invoke('brand.scan', { root: '.' });
```

---

## Vocabulary

| Kind | Meaning |
|------|---------|
| **module** | Domain namespace (`brand`, `repository`, `cad`) |
| **operation** | User-callable capability (`brand.scan`) |
| **tool** | Bounded executable primitive (often agent-facing) |
| **skill** | Procedural knowledge / instructions |
| **pipeline** | Ordered composition of operations/tools |
| **capability** | Declaration of what the runtime can perform |
| **provider** | Adapter to an external/local implementation |
| **contract** | Portable schemas / types / vocabulary |

Do not flatten everything into “tools.”

---

## Operation contract (normative)

Every externally callable AgentSam capability:

1. Has **one** canonical operation ID (`module.action` or `module.subsystem.action`)
2. Declares typed **input** / **output** schemas
3. Declares **execution** metadata: lanes, `model: never|optional|required`, network, side effects, risk
4. Is invokable through **SAM** (`invoke`) and projected to CLI / MCP / HTTP without renaming authority
5. Returns a **SamResult** envelope (`data` + `receipt` + optional evidence/artifacts/usage)

Alias ≠ authority. Human CLI aliases (`agentsam inspect`, `agentsam sca`) remain; internal ID stays `repository.inspect` / `security.scan`.

### Session vs operations

`login`, `logout`, `whoami`, shell preferences, and help are **client/session/runtime** controls. Do not force them through `sam.invoke('auth.login')`.

---

## Result envelope

```ts
interface SamResult<T> {
  schema: 'agentsam.result.v1';
  operation: string;
  ok: boolean;
  data: T;
  receipt: SamReceipt;
  evidence?: unknown[];
  artifacts?: unknown[];
  usage?: { provider_calls: number; cost_usd?: number; /* … */ };
  warnings?: unknown[];
}
```

`data` is what the caller asked for. `receipt` is how SAM proves what happened.

---

## Execution policy (AI is a lane, not the API)

`choice()` / `predicate()` / `score()` (future `sam.machine.evaluate`) mean **bounded classification**, not “send to GPT.” Runtime may satisfy via rules, cache, heuristics, local models, or remote models under policy.

Operations declare `model: never | optional | required` so `$0` machinery is machine metadata, not README prose.

---

## Seed operations (first migration set)

| Operation ID | CLI projection | model |
|--------------|----------------|-------|
| `repository.inspect` | `agentsam inspect` | never |
| `brand.scan` | `agentsam brand scan` | never |
| `security.scan` | `agentsam security scan` | never |
| `terminal.exec` | (runtime / tools) | never |
| `cad.blender.inspect` | `agentsam cad blender inspect` | never |
| `codebaseindex.ingest` | `agentsam codebaseindex` / `ingest` | optional |

Pipeline alias for host escalation: `sam.codebaseindex.index.run`.

Handlers reuse existing implementations. New work asks: **What module owns this operation?**

---

## Go / agentsamd (next lane — Slice H)

Local durable machine service (`agentsamd`) owns PTY, jobs, local invoke — **not** a Tauri rewrite. `AGENTSAM_API_KEY` authenticates **remote/platform** operations; local capabilities stay key-optional. Tauri may later consume the same daemon.

See: Go Worker product lane already live; expand carefully.

---

## Related files

| Path | Role |
|------|------|
| `protocol/sam/operation.schema.json` | Operation metadata schema |
| `protocol/sam/result.schema.json` | SamResult envelope |
| `protocol/sam/registry.seed.json` | Seed operation registry |
| `src/sam/` | Kernel registry + `AgentSamClient` / `invoke` / `describe` / `discover` |
| `protocol/capabilities/manifest.json` | Existing capability cards (migrate into ops over time) |

---

## Anti-patterns

- Building a miniature runtime inside each package
- Making `systemOne()` / chat APIs the flagship surface
- Letting CLI command strings define internal operation IDs
- Requiring `AGENTSAM_API_KEY` for local inspect/merkle/security
- Documenting APIs by hand that should be projections of the registry
