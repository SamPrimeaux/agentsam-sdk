# AgentSam model selection SSOT contract

Status: **normative v1 acceptance contract** for `/models`, `agentsam models`, exact model selection, provider facts, pricing provenance, and runtime receipts.

The core law is:

> **AgentSam recommends models; providers define model facts; users select the exact model; runtime receipts prove what actually ran.**

This contract exists to prevent model UX, provider discovery, pricing, runtime selection, and usage accounting from drifting apart across CLI, dashboard, MCP, subagents, or future surfaces.

## 1. One model system

The following surfaces MUST resolve through one model inventory + selection authority:

- interactive `/models` and `/model`;
- `agentsam models` and `agentsam models --json`;
- `agentsam -m <model_id>`;
- persisted user model preferences;
- dashboard / Work model selectors;
- MCP-driven AgentSam sessions;
- subagent profiles;
- model execution adapters;
- run/session receipts and usage accounting.

A surface MAY render the data differently. It MUST NOT maintain an independent model catalog, price table, fallback list, or runtime-selection rule.

## 2. Exact model identity is explicit runtime state

A model selection is the tuple:

```text
provider
model_id
reasoning_effort
service_tier
```

The exact provider and exact model MUST be user-visible before inference when a selection is required.

The runtime MUST NOT silently replace an exact selected model with `automatic`, `best available`, `default`, a fallback model, or another provider.

If an exact model is unavailable, AgentSam MUST stop and let the user choose another model. A future user-configured routing policy MAY permit substitution, but that policy itself must be explicit, inspectable, and recorded in the run receipt.

## 3. Provider credentials: machine-local provider SSOT

Provider API credentials are machine-local runtime state. They are not project configuration and must never enter model-visible output.

The current AgentSam provider-file convention is:

```text
~/.agentsam/env.d/openai.env       OPENAI_API_KEY
~/.agentsam/env.d/gemini.env      GEMINI_API_KEY
~/.agentsam/env.d/cloudflare.env  CLOUDFLARE_API_TOKEN
~/.agentsam/env.d/anthropic.env   ANTHROPIC_API_KEY
~/.agentsam/env.d/xai.env         XAI_API_KEY
```

`~/.agentsam/load-agent-env.sh <provider>` is a human/debug helper. Normal AgentSam usage MUST NOT require the user to manually `source` or `unset` credentials before `/models` or model execution.

AgentSam MUST resolve provider credentials internally using the canonical credential resolver. Provider files must be permission-safe and parsed for the expected variable; they must not be evaluated as arbitrary shell code.

IAM / AgentSam account authentication is a separate credential category. An account session MUST NOT become the storage authority for OpenAI, Gemini, Cloudflare, Anthropic, xAI, or other provider API keys.

Public status may expose only safe metadata such as:

```text
provider
configured / present
source_class
safe source path
valid / provider_accepts
required_capability / authorized
verified_at
secret_hidden=true
```

Secret values, authorization headers, bearer tokens, or recoverable derivatives are forbidden in UI, JSON inventory, logs, model context, session titles, and receipts.

## 4. Provider facts vs AgentSam policy

Provider facts and AgentSam recommendations are different authorities and MUST remain distinguishable.

### Provider-owned facts

Where the provider exposes them, AgentSam normalizes:

- exact model ID;
- availability to the current credential/account;
- input/context limit;
- maximum output tokens;
- reasoning controls;
- modalities;
- function/tool support declared by the provider;
- service tiers;
- input pricing;
- cached-input / cache-write pricing;
- output pricing;
- long-context thresholds or multipliers;
- other provider-specific pricing rules.

Every normalized provider fact MUST retain provenance sufficient to answer:

```text
value
source_kind
source_ref or provider
observed_at / pricing_as_of
```

Preferred source order for a fact is:

1. provider machine-readable API;
2. provider authoritative published model/pricing source;
3. unavailable / unknown.

AgentSam MUST NOT silently substitute an old hardcoded guess when an authoritative fact cannot be refreshed.

If a last-verified value is retained for resilience, it MUST be labeled with its verification timestamp and current/stale state. A stale value must never be presented as freshly provider-verified.

### AgentSam-owned policy

AgentSam may add clearly separated policy metadata such as:

- recommended rank;
- coding / agentic / vision / low-cost / long-context tags;
- working-context target;
- compaction threshold;
- compatibility notes;
- measured AgentSam eval results.

AgentSam policy MUST NOT overwrite provider capacity, capability, availability, or price facts.

## 5. Runtime compatibility is not the same as provider capability

A provider may declare that a model supports function calling or vision while the current AgentSam adapter may not yet implement that path.

Inventory MUST keep these concepts separate:

```text
provider_capabilities
agentsam_runtime_compatibility
```

The UI must not claim that AgentSam can execute a capability merely because the provider model supports it.

## 6. `/models` provider picker

Typing `/models` or running interactive `agentsam models` MUST start from a provider picker, not an invented provider-level model such as `Gemini automatic` or `Workers AI default`.

Expected shape:

```text
Select provider

› OpenAI                 configured · verified
  Gemini                 configured · verified
  Cloudflare Workers AI  configured · verified
  Ollama                 local · online
  Anthropic              not configured
  Grok                   not configured
```

The provider row is status and navigation. It is not itself a model selection.

Selecting a provider performs:

```text
resolve credential
→ verify provider access
→ fetch accessible/current model inventory
→ join authoritative capability + pricing facts
→ apply AgentSam ranking metadata
→ render the model picker
```

## 7. Curated first page, unrestricted exact access

The primary provider model picker SHOULD show roughly the top 10 logical coding/agent models rather than forcing the user through every image, speech, embedding, moderation, legacy, or specialist endpoint.

The curated page is a presentation policy, not an access restriction.

The user MUST retain access to the complete provider-visible inventory through a `More models…` / `All models…` path and an exact-model escape hatch:

```bash
agentsam -m <exact_model_id>
```

A future `config.toml` or other persisted configuration UI MUST write to the same canonical model preference state. It must not create a second selection authority.

A concise UX hint may say:

```text
Access other or legacy models with `agentsam -m <model_id>` or your canonical AgentSam model configuration.
```

## 8. Model rows show factual economics and capabilities

For a selected/provider-visible model, the UI SHOULD expose the facts needed to make an informed choice without requiring a documentation hunt:

```text
model ID / label
availability
context/input limit
max output
reasoning levels
provider-declared capabilities
AgentSam runtime compatibility
service tiers
input price
cached-input / cache-write price
output price
long-context pricing rules
pricing/source timestamp
```

Example presentation only:

```text
GPT-6 Astra
OpenAI

Capacity
  context       1,050,000
  max output      128,000

Reasoning
  low · medium · high · xhigh · max

Standard · USD / 1M tokens
  input          $...
  cached input    $...
  output         $...

Pricing provenance
  availability   provider API
  limits         provider authoritative
  pricing        provider authoritative
  verified       <timestamp>
```

The contract does not freeze today's model names or prices. The provider-source records do.

## 9. Selection flow

For a provider requiring explicit selection, the flow is:

```text
Provider
→ Exact model
→ Reasoning level
→ Processing / service tier
```

Only controls supported by the exact selected model may be offered.

The final selection MUST be persisted through one canonical preference writer and MUST survive a CLI restart.

## 10. CLI and JSON are two renderings of one inventory

`/models`, `agentsam models`, and `agentsam models --json` MUST be backed by the same normalized inventory.

The machine-readable contract is `agentsam-model-inventory-v2`; see `model-inventory-v2.schema.json`.

The JSON inventory MUST NOT contain secrets.

At minimum it needs to distinguish:

```text
provider credential/status receipt
provider-visible model records
provider facts + provenance
AgentSam policy annotations
current exact selection
```

## 11. Pricing law

Pricing shown in the picker and pricing used for run-cost calculation MUST come from the same normalized pricing record.

A model turn receipt MUST freeze or reference the pricing basis used at execution time so later provider price changes do not rewrite historical cost estimates.

Provider-authoritative token usage and AgentSam-calculated cost are distinct facts:

```text
provider usage receipt
  input_tokens
  cached_input_tokens
  cache_write_tokens when available
  output_tokens
  reasoning_tokens when available

AgentSam economics receipt
  pricing basis/version
  requested service tier
  actual service tier
  calculated cost
  currency
```

AgentSam must never label a calculated estimate as a provider invoice unless the provider supplied that invoice/cost directly.

## 12. Runtime receipt proves the exact model

Every real model call/run MUST be attributable to:

```text
provider
exact model_id
reasoning_effort
requested_service_tier
actual_service_tier
provider_request_id when available
provider-authoritative usage
pricing basis/version
calculated cost
```

The runtime receipt is the final truth of what actually ran. A UI preference alone is not sufficient proof.

## 13. Failure behavior

These conditions are release blockers for the `/models` contract:

- valid AgentSam provider file exists but UI says the provider is not configured;
- a provider-level pseudo-model such as `Gemini automatic` replaces exact model discovery;
- selected model is silently substituted;
- pricing shown as current without authoritative provenance;
- provider context/output limits are guessed or overwritten by AgentSam policy;
- `/models` and `agentsam models --json` disagree about the same provider/model;
- picker pricing and runtime cost accounting use different price records;
- secrets appear in terminal output, JSON, logs, or model context;
- unsupported reasoning/service-tier controls are offered;
- the primary picker dumps every irrelevant provider endpoint instead of a curated useful page;
- an exact provider-visible model is inaccessible merely because it was omitted from the curated page.

## 14. Publish acceptance proof

Before release, verify the **installed package**, not only repository source:

```bash
which agentsam
agentsam --version
agentsam models
agentsam models --json
agentsam -m <known-accessible-exact-model>
agentsam
# then /models
```

For every configured provider used in release validation, prove:

1. no manual `source` command is required;
2. the machine-local provider credential is found safely;
3. provider access is actually validated;
4. live/provider-visible models are discovered;
5. the curated coding/agent page is useful and bounded;
6. full exact-model access still exists;
7. capacities/capabilities/pricing show provenance;
8. exact model selection persists;
9. reasoning/service tier are reconciled to that model;
10. a runtime receipt reports the same provider/model that the user selected;
11. a deliberately invalid model fails loudly rather than routing elsewhere.

## 15. Acceptance sentence

If any contributor cannot answer all four questions below from one AgentSam inventory + receipt path, the model system is not finished:

```text
What provider credentials are safely available?
What exact models can this account use?
What does the provider currently say each model can do and cost?
What exact provider/model/reasoning/tier actually handled this run?
```
