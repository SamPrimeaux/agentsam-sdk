# AgentSam Product Experience Standard

**Status:** Internal product law  
**Applies to:** AgentSam SDK · Local Studio · packaged AgentSam apps · runtime surfaces · developer tooling  
**Product:** `@inneranimalmedia/agentsam-sdk`  
**Machinery:** SAM — **Systematic Autonomous Machinery**

> **Complex underneath. Effortless above.**

## Product posture

AgentSam is a professional software platform, not a prototype dashboard, chatbot wrapper, or collection of demos. The UI communicates maturity through **clarity, speed, consistency, depth, and restraint**.

A user should feel that the system is capable without being forced to look at all of the machinery that makes it capable.

## Progressive discovery

> **Reveal a capability when context makes it useful; do not advertise the entire machinery permanently.**

This applies to terminals, runtimes, languages, forwarding, LSP, databases, cloud providers, CMS, CAD, machine inspection, identity, install/setup, and AgentSam itself.

If only one healthy runtime exists, do not show a runtime picker. If a repository requires Go, surface Go when the user runs or inspects that repository. Context creates discovery.

## Local Studio is a real desktop work application

Local Studio is not a PWA pretending to be desktop software, a hosted website hidden behind a native wrapper, a bootstrap/status page users must escape before doing work, or a chatbot with tools bolted on.

Expected launch path:

```text
Launch AgentSam Local Studio.app
        ↓
bundled Local Studio application
        ↓
restore last workspace/session
        ↓
local runtime becomes available quietly
        ↓
account/cloud/provider state hydrates without blocking local work
```

The shipped `.app` must boot directly into the real application interface. A thin **Open Studio UI / Stay on this shell** runtime-status page is a development or recovery fallback, not a shippable default.

## Local-first contract

Local functionality remains useful without authentication or network availability: files, local projects, SQLite, PTY/terminal, agentsamd, repository inspection, local language tooling, and installed local CAD/modeling integrations.

Authentication enhances the product. It does not gate the user's computer.

## Visual identity

The default visual language is **quiet, dark, precise, desktop-native, and content-first**.

Prefer near-black neutral work surfaces, restrained borders, compact chrome, crisp typography, careful spacing, small precise active states, limited iconography, contextual panels that disappear when closed, and motion that communicates state changes.

Avoid particle effects as ordinary product chrome, glowing dashboard cards, pulsing status indicators, decorative telemetry, giant capability dashboards, nested cards without purpose, permanent status rails, and "AI is thinking" theater.

Motion should be experienced as smoothness, not watched as entertainment.

## Canonical layout modes

### Focused work

```text
project/history rail | main work/chat | contextual editor/browser/details
```

### Code / file work

```text
project/history rail | editor/work surface | file tree/workspace/context
```

### Full workbench

```text
minimal nav | primary surface | optional contextual secondary pane
```

The active task owns the screen. Secondary panes support it.

A user should move naturally among recent work, projects, Git worktrees, local folders, attached runtimes, containers, and future remote workspaces without needing to understand the transport underneath.

## The work surface defines the experience

Browsing should feel like a browser; coding like an editor; data work like a database editor; CMS work like a CMS; CAD work like CAD; terminal work like a terminal.

AgentSam intelligence is contextual infrastructure, not permanent visual chrome.

> Every capability should feel native to the surface where it is used.

## Tabs, split panes, browser, and annotation

Tabs are first-class desktop primitives. State should preserve and restore per workspace, split panes should feel like one application, and contextual panels should disappear completely when closed.

The in-app browser is a serious work primitive, not an iframe preview.

Annotation is a signature AgentSam interaction. A user should be able to select a real DOM element, code range, file, database object, CMS section, CAD object, browser region, artifact, runtime, or job and open a minimal contextual composer against that structured selection.

AgentSam should know **what was selected**, not merely where the user clicked.

## Terminal and runtime model

Do not create separate terminal architectures for each language.

```text
terminal_instance   → where compute lives
terminal_connection → how AgentSam reaches it
terminal_session    → interactive PTY
terminal_job        → detached/background work
```

Capabilities hang off the target:

```text
pty
exec
filesystem
ports
forwarding
jobs
lsp
docker
node
python
go
rust
freecad
openscad
blender
```

"Go service", "Rust task", "Python worker", and "Node dev server" are process profiles, not new PTY technologies.

Forwarding should be first-class but mostly invisible. If a process exposes a port, Local Studio can offer **Open preview** and resolve forwarding underneath.

## Databases

AgentSam's own `.agentsam/data/agentsam.sqlite` is application state, not a claim that Local Studio supports only one SQLite database.

User-owned SQLite is first-class: create/open arbitrary databases, attach/detach, CRUD, scoped SQL, duplicate/backup, rename/delete with confirmation, and offline operation.

## Identity

Identity must feel integrated, not like a developer bootstrap screen. Unsigned-in users can continue local work.

Provider lanes remain distinct:

```text
Google
→ native desktop client
→ PKCE + browser authorization
→ loopback callback
→ Keychain

Cloudflare
→ provider authorization in browser
→ confidential Worker completes provider flow
→ short-lived PKCE-bound desktop handoff
→ AgentSam desktop session in Keychain

InnerAnimalMedia / IAM
→ branded IAM authority in browser
→ confidential Worker owns client secret
→ short-lived PKCE-bound desktop handoff
→ AgentSam desktop session in Keychain
```

Browser authorization is expected. Browser **session dependence** is not.

Desktop acceptance test: authenticate, close the browser, quit Local Studio, clear hosted Studio cookies, reopen Local Studio, and confirm account/provider state restores from Keychain or renewable desktop refresh state. No confidential client secret belongs in the packaged app.

## External desktop escape hatches

Useful actions include Open in Cursor, default app, Terminal, iTerm2, Reveal in Finder, Open on GitHub, and Save as.

These are convenience paths. They do not replace Local Studio's own editor, PTY, browser, files, database, or runtime system.

## Donor extraction and dependency direction

InnerAnimalMedia is a donor and proving ground. It is not a runtime dependency of Local Studio.

```text
                  agentsam-sdk
                      │
          reusable packages/contracts
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   Local Studio  InnerAnimalMedia  customer apps
```

Never make Local Studio import portable runtime/UI truth from the InnerAnimalMedia repository.

Salvage proven UI, adapters, contracts, browser/editor/file behaviors, OAuth work, CMS mechanics, runtime patterns, and interaction components; remove InnerAnimalMedia-specific tenancy, branding, URLs, customer IDs, bindings, and deployment policy; land reusable ownership once in AgentSam SDK; let InnerAnimalMedia consume it through explicit adapters.

Portability test:

> Could a developer clone only `agentsam-sdk`, build/install Local Studio, and get the core experience without an `inneranimalmedia` checkout?

For portable functionality, the answer must be yes.

## Authority and registry discipline

Do not flatten product, app, package, service, feature, capability, operation, tool, runtime, and install state into one registry.

Preserve:

```text
APP
apps/*/agentsam.app.json

PACKAGE / SERVICE
agentsam.package.json / package metadata

FEATURE
agentsam.feature.json

CAPABILITY
protocol/capabilities/manifest.json

OPERATION
protocol/sam/* + defineSamOperation()

TOOL
platform / MCP bounded registry

RUNTIME
agentsam.runtime.v1 + terminal_* state

INSTALL
.agentsam state + receipts
```

The official platform product inventory remains `agentsam_products` and its platform relationships.

Any source-controlled `registry/products/*` layer is a **thin relationship/index seed**: product IDs, authority paths, host/mount relationships, service relationships, and platform linkage. It must not copy versions, commands, capability lists, runtime facts, or other fields already owned elsewhere.

## Product quality bar

Local Studio should feel deliberate, quiet, responsive, high-confidence, contextual, predictable, and deeply capable.

Never gimmicky, demo-first, fake, capability-theater, or overloaded with status chrome.

Infrastructure earns its value by making visible work reliable.

## Acceptance rules

1. **Real over fake** — no fake green states or pretend integrations.
2. **Context over dashboards** — surface capabilities where they matter.
3. **Local-first** — local work does not wait on account/cloud availability.
4. **Progressive discovery** — advanced controls appear when useful.
5. **One coherent product** — browser, files, editor, terminal, database, CMS, CAD, Work, and AgentSam share interaction language.
6. **No permanent noise** — closed panels disappear.
7. **Native desktop behavior** — tabs, split panes, file dialogs, Keychain, external-open actions, local processes.
8. **Capability truth** — UI affordances derive from real runtime/provider capability.
9. **Smoothness is functional** — animation reduces friction.
10. **AgentSam remains contextual** — intelligence supports the work instead of competing with it.

## Design test

Before adding a permanent control, panel, badge, dashboard, runtime selector, or status surface, ask:

```text
Does the user need this visible right now?
Can context reveal it later?
Can the system infer this safely?
Is it useful to the task, or merely proof that our backend exists?
Would a mature professional application expose this continuously?
```

If the answer points toward hiding it, hide it.

## North star

> **A serious desktop work environment where browser, files, code, terminal, data, CMS, CAD, runtimes, cloud resources, and AgentSam intelligence behave as if they were designed together from the beginning.**

AgentSam makes complex infrastructure feel simple without pretending the infrastructure is simple.

That is the brand.
