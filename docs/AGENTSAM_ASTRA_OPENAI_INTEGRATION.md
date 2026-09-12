# AgentSamAstra — OpenAI Responses API Integration Guide

**Status:** implementation baseline
**Model:** `gpt-6-astra`
**Canonical OpenAI API:** Responses API
**Agent instruction contract:** `AGENTSAM.md`
**Last standardized:** September 12, 2026

---

## 1. Purpose

`AgentSamAstra` is AgentSam's first-class GPT-6 Astra runtime.

The goal is not to bolt another model onto the existing provider adapter. Astra should be implemented using the current OpenAI API architecture so that its reasoning, tools, tool discovery, streaming, long-running work, and future steering capabilities are available through one coherent runtime.

The central contract is:

```text
User
  ↓
AgentSam authenticated runtime
  ↓
AGENTSAM.md + request-specific instructions
  ↓
AgentSam capability/tool registry
  ↓
OpenAI Responses API
  ↓
gpt-6-astra
  ↓
tool calls / reasoning / assistant output
  ↓
AgentSam executes authorized tools
  ↓
function_call_output
  ↓
Responses API continuation
  ↓
final/continuing response
```

Do not build a separate Chat Completions tool path for Astra. GPT-6 Astra can appear on Chat Completions for compatible generation use cases, but OpenAI's current guidance explicitly requires the **Responses API for Astra tool calling**.

OpenAI currently identifies `gpt-6-astra` as its flagship model for complex end-to-end work, with a 1,050,000-token context window and up to 128,000 output tokens.

---

# 2. Core AgentSamAstra laws

These should become implementation invariants.

### Responses is the canonical runtime

All AgentSamAstra turns should enter through one Responses API adapter:

```text
provider=openai
model=gpt-6-astra
api=responses
```

Avoid separate implementations for:

```text
simple chat
tool chat
coding chat
reasoning chat
```

Those are capabilities and routing decisions inside one provider lane.

### AgentSam owns authorization

The model may propose an action.

It does not decide whether it is authorized.

Authentication, account ownership, tool permissions, connection resolution, rate limits, risk checks, filesystem boundaries, and similar enforcement remain application-side concerns.

Values the server already knows should generally **not become model-generated tool arguments**. OpenAI similarly recommends removing arguments that application code already possesses rather than forcing the model to regenerate them.

For AgentSam specifically:

```text
authenticated account
session/conversation
resolved repository
resolved connection
runtime capability grants
```

should be supplied or derived by the AgentSam runtime.

A tool should not ask Astra to invent an `account_id` merely because the backend needs one.

### `AGENTSAM.md` defines behavior, not live state

`AGENTSAM.md` should contain durable instructions such as:

```text
identity
execution behavior
tool-use policy
repository workflow
testing policy
communication style
delegation rules
approval boundaries
completion criteria
```

It should not become a dumping ground for dynamic session state, user records, entire repository maps, database contents, or random retrieved context.

OpenAI recommends code-managed production prompts with typed dynamic inputs, tests, and normal code review rather than treating remote reusable prompt objects as the application source of truth.

That matches the intended AgentSam architecture well:

```text
AGENTSAM.md       → stable agent contract
request input     → current user instruction
capabilities      → runtime-resolved tools
retrieval         → explicit task-relevant context
auth              → server-side authority
conversation      → AgentSam session state
```

---

# 3. `AGENTSAM.md` hierarchy

The root instruction file should be concise enough to remain stable and cacheable.

Recommended conceptual order:

```text
# AgentSam

## Identity
## User-intent and follow-through
## Instruction priority
## Execution rules
## Tool-use rules
## Repository and filesystem rules
## Testing and verification
## Delegation
## Communication
## Completion criteria
```

OpenAI's prompt guidance recommends separating identity, instructions, examples, and contextual information, while keeping reusable prompt material early so prompt caching can benefit from a stable prefix.
Astra is particularly sensitive to instructions contained in accessible files such as `AGENTS.md`, so conflicting nested instructions and skills need to be audited rather than silently accumulated.

Therefore:

```text
AGENTSAM.md
     ↓
feature/repository instructions
     ↓
selected skill instructions
     ↓
task context
     ↓
user request
```

must have an explicit precedence contract.

Do not rely on accidental concatenation order.

---

# 4. Initial `AGENTSAM.md` behavioral baseline

A useful first version is:

```md
# AgentSam

## Identity

You are AgentSam, an execution-oriented AI software agent.

Your job is to understand the user's intended outcome, use available
capabilities when useful, perform authorized work, verify meaningful
changes, and continue until the requested task is complete.

## Execution

Treat requests for action as authorization to perform reversible,
in-scope work.

Infer routine implementation details from the repository, current
task, available tools, and prior conversation rather than stopping
for unnecessary clarification.

Ask the user only when missing information would materially change
the result or when an irreversible external action requires approval.

Do not stop after describing what should be done when the available
tools allow you to perform the requested work.

## Context

Do not assume repository, project, workspace, terminal, browser, or
other context merely because it exists.

Use context explicitly supplied for the current task or deliberately
retrieve the minimum additional context necessary to complete it.

## Tools

Use tools when they materially improve correctness or are required to
perform the requested action.

Do not call tools simply because they are available.

Prefer the smallest relevant tool surface.

If a required tool is deferred, discover it through tool search before
concluding that the capability is unavailable.

Never invent successful tool execution.

Use returned tool data as the authority for claims about external
state.

## Authorization

Treat runtime authentication and authorization as authoritative.

Never invent account IDs, repository IDs, connection IDs, credentials,
permissions, or ownership information.

Do not attempt to bypass capability restrictions enforced by the
runtime.

## Coding

Inspect relevant code before making nontrivial changes.

Prefer minimal coherent changes that fit the existing architecture.

Do not create parallel legacy implementations when an existing
canonical path can be repaired or extended.

## Verification

Run checks appropriate to the change.

Do not repeatedly execute broad test suites after relevant checks have
already passed unless new changes or failures justify doing so.

Never claim a build, test, migration, merge, deployment, or external
action succeeded without evidence.

## Delegation

Delegate parallelizable work when a configured subagent can improve
speed or quality.

The root agent remains responsible for integrating results and
completing the user's requested outcome.

## Communication

State the main result clearly.

Use concise progress updates during substantial work.

Prefer direct technical language over filler, canned conclusions, and
unnecessary repetition.

## Completion

Continue until the requested outcome is complete, blocked by a real
external constraint, or requires an irreversible action for which the
runtime requires user approval.

When blocked, identify the concrete blocker and preserve all completed
work.
```

## This reflects Astra's documented strengths and the areas OpenAI recommends explicitly tuning: follow-through, instruction precedence, writing style, delegation, and proportionate testing.

# 5. Canonical Responses request

The minimum production request should look conceptually like this:

```ts
const response = await openai.responses.create({
  model: "gpt-6-astra",

  reasoning: {
    effort: reasoningEffort,
  },

  instructions: agentsamInstructions,

  input,

  tools,

  parallel_tool_calls: true,
});
```

Start with the fewest request parameters possible.

Do not blindly carry old provider settings into Astra.

OpenAI's current Astra migration guidance specifically says to remove unsupported sampling parameters such as:

```text
temperature
top_p
top_logprobs
```

when configuring Astra according to the model-specific path.

The important behavioral inputs become:

```text
model
instructions
input
reasoning
tools
tool_choice
state/continuation
```

---

# 6. Reasoning-effort policy

GPT-6 Astra supports:

```text
low
medium
high
xhigh
max
```

It does not support `none`.

For the first AgentSamAstra baseline:

```text
ask        → low
plan       → medium
agent      → high
debug      → high
multitask  → high
```

Use `xhigh` or `max` deliberately for difficult tasks rather than making them the normal default.

This should remain a routing configuration value:

```ts
type AstraReasoningEffort =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";
```

Do not bury reasoning effort inside the text prompt.

Astra can also change reasoning effort during an ongoing conversation through a `configuration_update`, allowing the stable prompt prefix to remain cacheable.

That is a Phase 2 optimization, not required for the initial plumbing.

---

# 7. Tool architecture

AgentSam should distinguish four tool classes.

```text
1. AgentSam function tools
   AgentSam-owned backend operations

2. OpenAI built-in tools
   web search, file search, code interpreter,
   hosted shell, computer use, apply patch, etc.

3. MCP tools
   capabilities exposed through MCP servers

4. Discovery
   tool_search
```

Function tools are JSON-schema interfaces from Astra into AgentSam-controlled code. Custom tools can accept free-form textual input when structured JSON would be counterproductive. Built-in tools execute through OpenAI's platform. MCP connects other tool systems.

These categories should remain distinct in telemetry and permissions even if they share one model-facing registry.

---

# 8. Stop injecting hundreds of tools

This is one of the most important architectural changes.

OpenAI's current function-calling guidance recommends keeping the initial function surface small, with a soft target of **fewer than 20 functions available at the start of a turn**, and using tool search for larger catalogs.

AgentSamAstra should therefore use:

```text
small eager capability surface
          +
namespaced deferred tools
          +
tool_search
```

instead of:

```text
200+ schemas
      ↓
every request
      ↓
model must inspect all of them
```

Function definitions consume input context and therefore contribute to token usage.

A reasonable layout is:

```text
agentsam
├── repo
│   ├── inspect
│   ├── search
│   └── status
│
├── files
│   ├── read
│   └── search
│
├── terminal
│   └── status
│
├── github
│   └── status
│
└── deferred
    ├── deployment/*
    ├── database/*
    ├── browser/*
    ├── advanced_git/*
    ├── indexing/*
    ├── security/*
    └── specialized MCP tools
```

Exactly which tools are eager should be measured, not guessed.

---

# 9. Namespaces + deferred loading

OpenAI now supports namespaces for logically grouping related functions.

Example:

```ts
{
  type: "namespace",
  name: "repository",
  description: "Repository inspection and source-control operations.",
  tools: [
    {
      type: "function",
      name: "search",
      ...
    },
    {
      type: "function",
      name: "create_worktree",
      defer_loading: true,
      ...
    }
  ]
}
```

A namespace may contain both eager and deferred functions. Deferred functions are discovered through `tool_search`; non-deferred functions remain directly callable.

The root request then includes discovery:

```ts
tools: [
  {
    type: "tool_search",
  },

  ...toolNamespaces
]
```

OpenAI describes hosted tool search as the simple choice when the application already knows the overall inventory and wants the API/model to load only the relevant definitions.

This maps naturally onto AgentSam's registry.

The registry knows all tools.

Astra does not need all schemas in context simultaneously.

---

# 10. Strict function schemas

AgentSam function tools should use:

```json
{
  "strict": true
}
```

wherever possible.

OpenAI currently recommends strict mode because it makes model-generated arguments conform reliably to the declared schema. Strict schemas require object schemas to reject additional properties and to mark declared properties as required.

Canonical shape:

```ts
{
  type: "function",
  name: "repository_read_file",
  description: "Read a UTF-8 source file from the resolved repository.",
  strict: true,

  parameters: {
    type: "object",

    properties: {
      path: {
        type: "string",
        description: "Repository-relative path to read."
      }
    },

    required: ["path"],
    additionalProperties: false
  }
}
```

If something is optional under strict mode, represent that in the schema itself rather than leaving an undeclared ambiguity.

Avoid schemas like:

```text
on: boolean
off: boolean
```

when one enum could prevent contradictory states.

---

# 11. The canonical tool loop

Never assume:

```ts
response.output[0].content[0].text
```

contains the final answer.

OpenAI explicitly warns that `output` can contain multiple kinds of items, including tool and reasoning items, and recommends using `output_text` when the SDK provides it for aggregated assistant text.

AgentSam's loop should inspect every output item.

Conceptually:

```ts
let input = initialInput;

for (;;) {
  const response = await openai.responses.create({
    model: "gpt-6-astra",
    reasoning: { effort },
    instructions,
    tools,
    input,
  });

  // Preserve every returned item, including reasoning/tool items.
  input = input.concat(response.output);

  const calls = response.output.filter(
    (item) => item.type === "function_call"
  );

  if (calls.length === 0) {
    return {
      responseId: response.id,
      text: response.output_text,
      output: response.output,
      usage: response.usage,
    };
  }

  const outputs = await executeAuthorizedCalls(calls);

  input = input.concat(
    outputs.map(({ callId, result }) => ({
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result),
    }))
  );
}
```

The essential invariant is:

```text
function_call.call_id
        ↓
execute tool
        ↓
function_call_output.call_id
```

The original `call_id` must be preserved.

Assume a response may contain:

```text
zero calls
one call
many calls
reasoning items
tool-search items
assistant messages
```

rather than designing only around the one-function tutorial case.

---

# 12. Parallel execution

Because a response can contain several independent calls, the AgentSam executor should be capable of parallel execution where safe.

For example:

```text
read package.json
read wrangler.toml
inspect git status
```

can often run concurrently.

Actions such as:

```text
modify file
commit
merge
deploy
```

usually have ordering dependencies and should be serialized according to AgentSam's execution graph.

`parallel_tool_calls` permits the model to request concurrent work, but application-side scheduling remains authoritative.

---

# 13. Async tool calling

Astra introduces async tool calling.

With a function or custom tool configured with:

```ts
async: true
```

Astra can continue reasoning, invoke other tools, or answer independent parts of the task while AgentSam executes longer-running work. The eventual result is still returned against the original `call_id`.

Good future AgentSam candidates include:

```text
large repository indexing
long builds
remote deployments
security scans
browser jobs
large test suites
external agent runs
```

Do **not** make every tool async.

Phase 1 should get the ordinary deterministic tool loop correct.

Phase 2 can opt long-running operations into async execution.

---

# 14. Conversation state

AgentSam should remain the canonical conversation/state owner.

OpenAI state may optimize continuation, but it should not become the only durable copy of an AgentSam conversation.

Two valid Responses patterns exist:

```text
A. previous_response_id continuation

B. explicit replay of relevant Response output/input items
```

For the first AgentSam implementation, persist at minimum:

```text
AgentSam conversation ID
OpenAI response ID
model
reasoning effort
request metadata
tool calls
tool results
usage
final status
```

A crucial detail: the Responses `instructions` field applies to the current request. When using `previous_response_id`, previous instructions are not automatically treated as the new request's instruction field.

Therefore every AgentSamAstra request should deliberately provide the current compiled `AGENTSAM.md` instruction contract.

Do not assume it survived because the previous response ID exists.

---

# 15. Prompt caching

The stable portion of AgentSam's prompt should remain stable.

Recommended order:

```text
AGENTSAM.md
stable provider policy
stable capability guidance

then

task-specific context
retrieval
files
current user input
```

OpenAI recommends placing reusable prompt material early so the prompt prefix can benefit from caching.

Avoid generating a giant slightly different system prompt every turn.

That destroys the point of having a canonical instruction contract and reduces cache reuse.

---

# 16. Code Interpreter

Astra supports OpenAI's Code Interpreter.

It provides a sandboxed Python environment and can process files, perform data analysis, generate files, and iteratively run Python.

Example configuration:

```ts
{
  type: "code_interpreter",
  container: {
    type: "auto",
    memory_limit: "1g"
  }
}
```

Available documented memory tiers include:

```text
1 GB
4 GB
16 GB
64 GB
```

OpenAI containers are **ephemeral**. A container expires after 20 minutes of inactivity and its associated data cannot then be recovered.
Therefore:

```text
OpenAI container = temporary compute
AgentSam storage   = durable authority
```

Never treat a Code Interpreter container as the canonical AgentSam filesystem.

Any artifact worth retaining must be imported into AgentSam-controlled storage before the ephemeral container disappears.

---

# 17. Native AgentSam execution versus hosted OpenAI execution

AgentSam should deliberately select the execution backend.

```text
AgentSam terminal/sandbox
    → repository operations
    → builds
    → package managers
    → application runtime
    → deployment tooling

OpenAI Code Interpreter
    → Python analysis
    → data transformation
    → temporary file processing
    → calculation
    → model-directed analytical work
```

Do not silently move repository authority into OpenAI's ephemeral Python container merely because Astra supports it.

Likewise, hosted shell, computer use, Apply Patch, web search, and other built-in tools should be explicitly represented as execution capabilities, not invisibly mixed with AgentSam-native tools.

---

# 18. Retrieval and files

Retrieval should be task-driven.

Do not preload a full repository, project, workspace, or account corpus into every Astra request.

Instead:

```text
user task
   ↓
determine needed context
   ↓
search/retrieve
   ↓
load relevant slices
   ↓
perform work
```

OpenAI describes adding relevant external context as retrieval-augmented generation and supports both application-managed retrieval and built-in file search.

For AgentSam, that means its own account/repository retrieval layer can remain the canonical code-intelligence system.

OpenAI file search is another capability, not a mandatory replacement.

---

# 19. Streaming

The production AgentSamAstra adapter should stream Responses events rather than waiting for a fully buffered result.

The UI should be able to distinguish:

```text
assistant text delta
reasoning/status event
tool search
tool call
tool execution
tool result
final assistant text
usage/final status
```

Do not collapse every event into an undifferentiated text stream.

This becomes especially important once async tools and mid-turn steering are introduced.

---

# 20. Mid-turn steering

Astra supports adding instructions while work is in progress over a WebSocket-based Responses flow.

That creates a future AgentSam capability:

```text
Agent is working
       ↓
user: "don't touch that migration"
       ↓
steering event
       ↓
same active task continues with updated instruction
```

OpenAI says the completed work already present in the active Responses session can be preserved while the new instruction affects the continuation.

Treat this as Phase 3.

Do not block the initial Astra integration on it.

---

# 21. Cost contract

As of September 12, 2026, current OpenAI documentation lists GPT-6 Astra Standard short-context pricing per million tokens as:

```text
input          $10.00
cached input   $1.00
cache write    $12.50
output         $50.00
```

Long-context pricing is higher once the documented threshold is crossed. Current pricing shows:

```text
long input          $20.00
long cached input   $2.00
long cache write    $25.00
long output         $75.00
```

The Astra model documentation currently states that Batch and Flex are priced at 50% of Standard rates and Fast mode at 2× applicable rates.

Built-in tools can add separate cost. The supplied pricing documentation currently lists charges for capabilities including web search, containers, file-search storage, and tool calls.

Therefore every OpenAI run should capture:

```text
input tokens
cached input tokens
cache-write tokens
output tokens
reasoning tokens where exposed
tool-call counts
container usage
selected service tier
estimated/actual cost
```

Cost should become normal AgentSam run telemetry rather than a provider-dashboard-only concern.

---

# 22. Model routing

`gpt-6-astra` should be a real model catalog entry, not a hard-coded exception.

Conceptually:

```json
{
  "model_key": "openai:gpt-6-astra",
  "provider": "openai",
  "provider_model": "gpt-6-astra",
  "api_family": "responses",
  "reasoning": true,
  "tool_calling": true,
  "tool_search": true,
  "async_tools": true,
  "computer_use": true,
  "code_interpreter": true,
  "context_window": 1050000,
  "max_output_tokens": 128000
}
```

Provider adapters should receive a resolved model configuration.

They should not perform a second competing model-selection process.

---

# 23. Recommended implementation boundary

Use a small provider package.

```text
backend/
└── agentsam/
    └── providers/
        └── openai/
            ├── client.ts
            ├── responses.ts
            ├── stream.ts
            ├── state.ts
            ├── tools.ts
            ├── tool-search.ts
            ├── usage.ts
            ├── errors.ts
            └── types.ts

agentsam/
├── AGENTSAM.md
└── prompts/
    ├── compile.ts
    └── types.ts

backend/
└── agentsam/
    └── tools/
        ├── registry.ts
        ├── namespaces.ts
        ├── execute.ts
        ├── permissions.ts
        └── result.ts
```

Exact repository placement can follow the existing monorepo conventions, but responsibilities should remain separate:

```text
OpenAI adapter
    knows OpenAI

tool registry
    knows AgentSam capabilities

executor
    knows how AgentSam executes tools

authorization
    knows whether execution is allowed

AGENTSAM.md compiler
    knows behavioral instructions

router
    chooses the model

chat/work UI
    consumes normalized runtime events
```

---

# 24. Normalized AgentSam response protocol

Do not expose raw OpenAI response objects throughout the application.

Normalize them at the provider boundary.

Example:

```ts
type AgentSamProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_search"; query?: string }
  | {
      type: "tool_call";
      callId: string;
      name: string;
      arguments: unknown;
    }
  | {
      type: "tool_result";
      callId: string;
      result: unknown;
    }
  | { type: "status"; status: string }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      reasoningTokens?: number;
    }
  | {
      type: "completed";
      responseId: string;
      text: string;
    };
```

That keeps the rest of AgentSam provider-neutral while allowing the OpenAI implementation to use the full Responses protocol.

---

# 25. Error handling

The provider adapter should explicitly classify:

```text
authentication failure
rate limit
spend/quota failure
invalid schema
invalid tool result
unknown call_id
context overflow
model unavailable
container expired
tool timeout
stream interruption
provider 5xx
user cancellation
```

Do not turn all provider failures into:

```text
Something went wrong
```

Likewise, do not retry blindly.

A schema rejection and a transient network failure are fundamentally different problems.

---

# 26. Telemetry

Each Astra turn should produce one coherent turn record.

Minimum useful fields:

```text
run_id
conversation_id
account_id
model_key
provider
provider_response_id

mode
reasoning_effort
service_tier

started_at
first_event_at
completed_at

input_tokens
cached_input_tokens
cache_write_tokens
output_tokens
reasoning_tokens

tool_search_count
tool_call_count
tool_names
tool_failures

status
error_code

estimated_cost
```

This makes latency, tool behavior, routing quality, and cost observable without dumping every internal event into production logs.

---

# 27. Security boundary

Function calling does not turn model output into trusted application input.

Treat every function call like structured untrusted input:

```text
model proposes
      ↓
JSON schema validates
      ↓
AgentSam resolves authority
      ↓
permission/risk policy checks
      ↓
application executes
      ↓
result returned to model
```

Never use a model-created account, user, repository, filesystem root, credential, or connection identifier as proof of authority.

The frontend is also not an authority boundary.

Permissions that matter must be enforced server-side.

---

# 28. Phase 1 — make Astra real

The first implementation milestone is intentionally narrow.

Build:

1. `openai` SDK/provider client.
2. `gpt-6-astra` catalog entry.
3. Responses API request path.
4. `AGENTSAM.md` loader/compiler.
5. `reasoning.effort`.
6. streaming response support.
7. strict function tools.
8. complete multi-call tool loop.
9. `call_id` preservation.
10. usage/cost telemetry.
11. cancellation.
12. a small eager tool surface.
13. `tool_search`.
14. deferred AgentSam tool namespaces.

Proof should include:

```text
plain text turn
reasoning turn
one function call
multiple function calls
deferred tool discovered through tool_search
tool failure returned to Astra
follow-up after tool output
stream cancellation
usage captured
```

---

# 29. Phase 2 — tool and state optimization

After the base runtime is stable:

```text
async tool calling
configuration_update reasoning changes
prompt-cache diagnostics
larger namespace catalog
MCP deferred discovery
parallel executor scheduling
state continuation optimization
compaction
provider failover
cost-aware model routing
```

The key measurement is no longer merely "does Astra work?"

Measure:

```text
time to first event
time to first useful text
tool-selection accuracy
tool-search accuracy
unnecessary tool calls
schema failures
tokens per completed task
cost per completed task
task completion rate
```

---

# 30. Phase 3 — AgentSamAstra as a full work agent

Then enable capabilities that depend on the stable event/runtime contract:

```text
mid-turn steering
long-running async jobs
subagent orchestration
computer use
hosted shell where appropriate
Apply Patch
browser workflows
cross-tool concurrency
checkpoint/resume
richer artifact handling
```

At this stage `AgentSamAstra` becomes an agent runtime rather than merely an OpenAI model option.

---

# 31. Acceptance criteria

The integration is complete only when this works end to end:

```text
User:
"Audit this repo, find the terminal connection bug,
repair it, run the appropriate tests, and tell me what changed."

                ↓

AgentSam authenticates account
                ↓
loads stable AGENTSAM.md
                ↓
selects gpt-6-astra
                ↓
starts Responses stream
                ↓
Astra sees small eager tool set
                ↓
uses tool_search for repo/terminal tools
                ↓
AgentSam validates tool args
                ↓
executes authorized repository operations
                ↓
returns outputs with correct call_ids
                ↓
Astra continues reasoning
                ↓
edits code through authorized execution lane
                ↓
runs proportionate verification
                ↓
receives results
                ↓
produces final answer
                ↓
AgentSam stores response ID, usage,
tool telemetry, timing, and cost
```

with no hidden workspace bootstrap, no giant tool dump, no fake execution, no provider-specific state leaking throughout the UI, and no requirement for the model to manufacture authority information.

That is the `AgentSamAstra` baseline.

---

# 32. The implementation rule to keep

The main abstraction should be:

```text
AgentSam decides what exists and what is authorized.

AGENTSAM.md defines how the agent should behave.

The Responses API carries the reasoning/tool conversation.

Astra decides what capability it needs.

tool_search discovers the relevant capability.

AgentSam executes it.

The tool result goes back through the same response loop.

AgentSam owns the durable state and evidence.
```

Everything else should build on that contract.
