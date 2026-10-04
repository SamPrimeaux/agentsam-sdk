# SAM Work Protocol proposal

**Status:** proposal; no runtime or package split is authorized by this document  
**Protocol family:** `agentsam.work.v1`  
**Product language:** Task, Steps, Parallel work, Review, Evidence, Feedback, Revision, Approval, Result

## Decision summary

SAM Work Protocol is **not a new agent framework**. It is a provider-neutral contract layer over the WorkGraph, GOAP, runtime, queue, scoring, receipt, and error machinery already owned by AgentSam.

A model response is not the unit of work. The unit of work is a typed task with explicit inputs, outputs, evidence, acceptance criteria, and feedback. Models, tools, subprocesses, automated validators, and people are participants in completing that task.

Decomposition is execution structure, not user complexity. A user describes the result they want; SAM may sequence, parallelize, reduce, review, or revise internally while presenting ordinary progress language.

Feedback is evidence about a run. It does not automatically rewrite prompts, skills, routing, presets, policies, or memory.

## Scope and boundaries

This proposal defines a shared vocabulary and versioned wire contracts. It does not:

- replace `@inneranimalmedia/agentsam-work-graph`, GOAP, queues, or runtime scheduling;
- expose model-vendor or research-framework terminology in durable APIs;
- make hidden reasoning or full model transcripts part of the contract;
- create one package for every execution strategy;
- treat model review as proof;
- permit an unbounded review/revision loop;
- infer legal conclusions from brand-policy findings;
- promote feedback into learned behavior without evaluation and human approval.

## Conceptual flow

```text
User intent
    |
    v
Typed task contract
    |
    v
Work decomposition
    |
    +---- Steps -------------------+
    |                              |
    +---- Parallel work ----+      |
    |                       v      v
    |                    Outputs  Output
    |                       |      |
    |                       +--+---+
    |                          v
    |                        Reduce
    |                          |
    v                          v
Evidence ------------------> Review
                               |
                         +-----+-----+
                         v           v
                      Accept       Revise
                                      |
                                      +-- bounded loop
```

The public execution vocabulary has five composable strategies:

```ts
type SamNodeStrategy =
  | "execute"
  | "sequence"
  | "fanout"
  | "reduce"
  | "review";
```

- **execute** performs one bounded unit of work.
- **sequence** orders work when a later step consumes an earlier output.
- **fanout** permits independent work to run concurrently.
- **reduce** combines typed outputs and preserves unresolved conflicts.
- **review** evaluates an artifact against explicit acceptance criteria.

A graph is composition of these primitives, not a sixth reasoning metaphor.

## Normative laws

1. **Contracts before prompts.** A task is canonical; provider requests are compiled representations.
2. **Typed boundaries.** Every node states what it consumes, produces, and what can prove success.
3. **Least context.** A node receives only required bindings, not the complete prior transcript by default.
4. **Trust is explicit.** Context carries provenance and trust; instructions found inside untrusted context are data, not authority.
5. **Evidence and opinion differ.** A review may recommend, evidence may prove, and acceptance decides.
6. **Hard gates stay hard.** A weighted score cannot override a failed required criterion.
7. **Revision is bounded.** Every loop has limits, budgets, and an explicit stop reason.
8. **Disagreement is retained.** A reducer may not silently erase conflicting outputs or evidence.
9. **Receipts describe reality.** A receipt records what ran, what was observed, and why execution stopped.
10. **Learning requires promotion.** Run feedback enters a ledger; evaluated, approved changes alter durable behavior.

## Contract family

The initial family should use independently versioned schemas:

| Schema | Responsibility |
|---|---|
| `agentsam.task.v1` | user objective, context, constraints, output, acceptance, execution policy |
| `agentsam.prompt.v1` | provider-neutral prompt compilation input |
| `agentsam.workgraph.v1` | typed nodes, dependencies, bindings, and strategies |
| `agentsam.feedback.v1` | verdicts and structured findings |
| `agentsam.evidence.v1` | observations and proof references |
| `agentsam.rubric.v1` | reusable evaluation criteria |
| `agentsam.run-state.v1` | durable execution state and budgets |
| `agentsam.receipt.v1` | immutable closeout summary |
| `agentsam.skill.v1` | one reusable capability contract |
| `agentsam.cookbook.v1` | declarative composition of skills |

`agentsam.work.v1` names the protocol family; it should not become a vague envelope that duplicates all member schemas.

## Task contract

```ts
interface SamTaskV1 {
  schema: "agentsam.task.v1";
  id: string;
  objective: string;
  context?: SamContextRef[];
  instructions?: string[];
  constraints?: SamConstraint[];
  expectedOutput?: SamOutputContract;
  acceptance?: SamAcceptanceContract;
  execution?: {
    strategy: "single" | "sequence" | "fanout" | "map_reduce" | "graph";
    budget?: SamWorkBudget;
  };
  feedback?: SamFeedbackPolicy;
  metadata?: Record<string, JsonValue>;
}
```

The contract stores intent. It must not store provider-specific message arrays as its authoritative form.

## Context and prompt compilation

```ts
interface SamContextRef {
  id: string;
  kind: "user" | "file" | "tool" | "web" | "memory" | "system";
  trust: "trusted" | "user_supplied" | "external" | "untrusted";
  contentRef: string;
}

interface SamPromptSpecV1 {
  schema: "agentsam.prompt.v1";
  objective: string;
  persona?: string;
  instructions?: string[];
  constraints?: string[];
  context?: SamContextRef[];
  examples?: SamExampleRef[];
  output?: SamOutputContract;
  recap?: string[];
}
```

Compilation flow:

```text
SamTask + selected node + explicit bindings
  -> PromptSpec
  -> trust-aware PromptCompiler
  -> provider/model request
  -> validated typed output
```

A compiler must isolate external material, label its provenance, and prohibit instructions embedded in that material from overriding task or system authority. Raw prompts may be retained for controlled diagnostics only; they are not the portable API.

## Typed work nodes

```ts
interface SamWorkNodeV1 {
  id: string;
  strategy: SamNodeStrategy;
  kind:
    | "analysis"
    | "research"
    | "code"
    | "transform"
    | "tool"
    | "test"
    | "review"
    | "approval"
    | "aggregate";
  objective: string;
  inputs: SamInputBinding[];
  output: SamOutputContract;
  acceptance?: SamAcceptanceContract;
  dependsOn?: string[];
  execution?: SamExecutionPolicy;
  feedback?: SamFeedbackPolicy;
}
```

Input bindings should point to task fields, artifacts, evidence, or named outputs. They should not imply that all prior conversation is inherited.

Fanout adds concurrency and failure semantics:

```ts
interface SamFanoutPolicy {
  concurrency?: number;
  failurePolicy?: "fail_fast" | "collect_all" | "minimum_success";
  minimumSuccess?: number;
}
```

Reduce adds explicit conflict handling:

```ts
interface SamReducePolicy {
  conflictPolicy: "surface" | "prefer_evidence" | "request_review";
}
```

`prefer_evidence` means prefer the claim with stronger admissible evidence, not the claim repeated by more workers.

## Feedback protocol

Feedback has four sources:

- **human** — operator reaction, annotation, correction, or approval;
- **machine** — tests, schemas, builds, probes, policies, and metrics;
- **review** — an agent's judgment against a named rubric;
- **outcome** — observed behavior after delivery or use.

```ts
interface SamFeedbackV1 {
  schema: "agentsam.feedback.v1";
  id: string;
  subject: {
    type: "run" | "node" | "artifact" | "output" | "decision";
    id: string;
  };
  source: "human" | "machine" | "review" | "outcome";
  verdict: "pass" | "pass_with_notes" | "revise" | "fail" | "unknown";
  findings: SamFinding[];
  evidence?: SamEvidenceRef[];
  scores?: SamScore[];
  recommendedActions?: SamActionSuggestion[];
  createdAt: string;
}

interface SamFinding {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  message: string;
  location?: SamLocation;
  evidence?: SamEvidenceRef[];
  confidence?: number;
}
```

Finding categories should be dotted, stable identifiers such as `test.failure`, `schema.invalid`, `requirement.missing`, `performance.regression`, `ui.accessibility`, `brand.naming`, or `license.risk`. Runtime errors continue to use `@inneranimalmedia/agentsam-errors`; findings reference applicable error codes rather than creating a competing error ontology.

## Evidence and acceptance

```ts
interface SamEvidenceV1 {
  schema: "agentsam.evidence.v1";
  id: string;
  kind:
    | "test"
    | "command"
    | "file"
    | "diff"
    | "screenshot"
    | "metric"
    | "http"
    | "user_confirmation";
  status?: "pass" | "fail" | "unknown";
  summary: string;
  ref?: string;
  data?: JsonValue;
  producedAt: string;
}

interface SamAcceptanceCriterion {
  id: string;
  description: string;
  evaluator:
    | { type: "command"; commandRef: string }
    | { type: "schema"; schemaRef: string }
    | { type: "review"; rubricRef: string }
    | { type: "human" };
  required: boolean;
  weight?: number;
}
```

Acceptance evaluation order:

1. evaluate required criteria;
2. mark any failed or unevaluated required criterion as blocking according to policy;
3. calculate advisory score if weights exist;
4. report both score and gate status;
5. accept only when every hard gate satisfies its contract.

A review statement is not automatically evidence. A machine result should include a command/schema/probe identity, bounded output, status, and artifact reference where available.

## Bounded revision

```ts
interface SamFeedbackPolicy {
  reviewers?: SamReviewerPolicy[];
  reviseOn?: Array<"warning" | "error" | "critical" | "acceptance_failure">;
  maxRevisions?: number;
  requireNewEvidenceAfterRevision?: boolean;
  stopOnRepeatedFailure?: boolean;
}
```

Every run ends with one explicit stop reason:

```ts
type SamStopReason =
  | "accepted"
  | "revision_limit"
  | "budget_exhausted"
  | "blocked"
  | "needs_human"
  | "cancelled"
  | "failed";
```

Repeated failure detection should compare criterion IDs, finding categories/locations, and relevant artifact identities rather than rely only on matching prose.

## Unified run state

```ts
interface SamRunStateV1 {
  schema: "agentsam.run-state.v1";
  runId: string;
  taskId: string;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "review"
    | "approval"
    | "completed"
    | "failed"
    | "cancelled";
  nodes: Record<string, SamNodeState>;
  artifacts: SamArtifactRef[];
  evidence: SamEvidenceRef[];
  feedback: SamFeedbackRef[];
  revision: number;
  budget: {
    modelCalls?: number;
    toolCalls?: number;
    elapsedMs?: number;
    cost?: number;
  };
  stopReason?: SamStopReason;
}
```

This state is the coordination seam for WorkGraph, queues, approvals, retries, model routing, and receipts. Implementations should extend existing state/receipt contracts rather than build a second scheduler.

## Skills, cookbooks, presets, rubrics, and receipts

| Artifact | Meaning | Example AgentSam ID |
|---|---|---|
| Protocol | stable machine-readable contract | `agentsam.feedback.v1` |
| Skill | reusable capability, required tools, and I/O | `package-quality` |
| Cookbook | proven declarative workflow | `build-feature` |
| Preset | tuned cookbook configuration | `npm-library-strict` |
| Rubric | named evaluation criteria | `package-quality.v1` |
| Receipt | record of what actually happened | run receipt |

A skill is not merely a long instruction file:

```yaml
schema: agentsam.skill.v1
id: package-quality
name: Package Quality Review
version: 1
objective: >
  Verify that a reusable package is independently buildable, tested,
  documented, and free of forbidden dependency leakage.
inputs:
  required: [package_path]
tools:
  required: [filesystem.read, terminal.exec]
outputs:
  schema: agentsam.feedback.v1
acceptance:
  rubric: package-quality.v1
constraints:
  - Do not modify source files.
  - Do not treat documentation claims as execution evidence.
  - Prefer executable evidence over reviewer judgment.
```

`SKILL.md` remains human-readable operating guidance for the manifest. The manifest is the machine contract.

A cookbook is declarative composition, not model code:

```yaml
schema: agentsam.cookbook.v1
id: build-feature
inputs: [request, workspace]
steps:
  - id: inspect
    skill: repo-audit
  - id: design
    skill: implementation-design
    depends_on: [inspect]
  - id: implement
    skill: implementation
    depends_on: [design]
  - id: verify
    skill: package-quality
    depends_on: [implement]
  - id: review
    skill: evidence-review
    depends_on: [verify]
acceptance:
  require: [build, tests, requirements]
```

## Initial AgentSam-owned catalog

Keep the first catalog narrow and prove it before expansion.

### Protocol schemas

- task, prompt, workgraph;
- feedback, evidence, rubric;
- run state and receipt;
- skill and cookbook.

### Skills

- `task-decompose` — produce a typed work plan from a task;
- `evidence-review` — evaluate evidence against acceptance criteria;
- `implementation-review` — inspect a change without modifying it;
- `package-quality` — build/test/boundary verification;
- `brand-compliance` — policy-driven naming, claims, licensing, and provenance findings;
- `dependency-audit` — dependency and package-boundary evidence;
- `regression-review` — compare candidate evidence to the promoted baseline.

### Cookbooks

- `build-feature`;
- `investigate-bug`;
- `package-release`;
- `ui-polish`;
- `repo-audit`;
- `migration-review`.

These IDs describe AgentSam capabilities and outcomes. Integration target names belong in adapter identifiers, configuration, or factual compatibility documentation—not in generic skill/cookbook product names.

## Brand compliance as a protocol participant

Brand compliance should produce the same `agentsam.feedback.v1` records as tests and other validators. It is a policy scanner and evidence producer, not a legal adjudicator.

Separate concerns into composable policy documents:

```text
brand/
  policy.json
  marks.json
  naming.json
  claims.json
  licensing.json
  provenance.json
```

```json
{
  "schema": "agentsam.brand-policy.v1",
  "project": "AgentSam",
  "includes": [
    "./marks.json",
    "./naming.json",
    "./claims.json",
    "./licensing.json",
    "./provenance.json"
  ]
}
```

Policy must distinguish factual references from product identity. Legitimate references include adapter IDs, environment variables, compatibility documentation, citations, and recorded provenance. Higher-scrutiny uses include package/product naming, logos and visual assets, affiliation claims, copied presentation systems, and unrecorded third-party material.

Example normalized result:

```json
{
  "schema": "agentsam.feedback.v1",
  "id": "feedback_brand_01",
  "subject": { "type": "artifact", "id": "package_manifest" },
  "source": "machine",
  "verdict": "revise",
  "findings": [
    {
      "id": "finding_brand_01",
      "severity": "error",
      "category": "brand.naming",
      "message": "The package identity contains a mark restricted by project naming policy."
    }
  ],
  "createdAt": "2026-10-04T00:00:00Z"
}
```

Generated trademark/attribution material should clearly mark generated ownership, allow deliberate manual takeover, state project independence, use factual compatibility language, preserve required attributions, and include an informational-not-legal-advice limitation. Project-specific marks and affiliations remain configuration, not hardcoded SDK policy.

## Package ownership proposal

Do not create these packages until at least one end-to-end cookbook proves the seams.

| Potential package | Owns | Does not own |
|---|---|---|
| `@inneranimalmedia/agentsam-prompt` | task/prompt contracts and compilation | scheduling or model registry |
| `@inneranimalmedia/agentsam-feedback` | feedback, findings, evidence, rubrics | runtime errors or orchestration |
| `@inneranimalmedia/agentsam-evals` | evaluators, scoring, acceptance gates | generic work graph |
| `@inneranimalmedia/agentsam-brand-compliance` | brand policy validation, reports, safe fix plans | legal conclusions or generic feedback |

Existing WorkGraph/GOAP/runtime remain orchestration authorities. `@inneranimalmedia/agentsam-errors` remains error authority. Execution primitives such as sequence, fanout, reducer, reviewer, or revision loop must not become standalone packages.

## Human-facing UI

The interface should display meaningful progress, not graph implementation details:

```text
Building package

✓ Inspect structure
✓ Define public API
● Implement
○ Tests
○ Review
○ Complete
```

Parallel review can show named areas and their status. Human feedback remains simple:

- **Looks good** -> `pass`
- **Needs changes** -> `revise`
- **Something is wrong** -> `fail`

A note, annotation, or screenshot becomes a finding/evidence attachment. Creative preference controls such as “keep this,” “more like this,” and “not this style” are outcome/preference observations scoped to the relevant project unless explicitly promoted.

## Feedback ledger and controlled learning

```text
feedback
  -> append-only feedback ledger
  -> periodic analysis
  -> candidate skill/preset/policy change
  -> evaluation against fixtures and prior failures
  -> human approval
  -> versioned promotion
```

```ts
interface SamFeedbackObservation {
  skillId?: string;
  cookbookId?: string;
  modelId?: string;
  criterion?: string;
  outcome: string;
  feedbackRef: string;
  runRef: string;
}
```

Raw run feedback must not mutate shared instructions, memory, or policy. Promotion requires traceable evaluation and a receipt.

## Proposed repository shape

This is a target layout, not a request to create empty directories:

```text
protocol/work/
  README.md
  schemas/
    agentsam.task.v1.schema.json
    agentsam.prompt.v1.schema.json
    agentsam.workgraph.v1.schema.json
    agentsam.feedback.v1.schema.json
    agentsam.evidence.v1.schema.json
    agentsam.rubric.v1.schema.json
    agentsam.run-state.v1.schema.json
    agentsam.receipt.v1.schema.json
    agentsam.cookbook.v1.schema.json
  rubrics/
  presets/

skills/
  task-decompose/
  evidence-review/
  package-quality/
  brand-compliance/

cookbooks/
  build-feature/
  investigate-bug/
  package-release/
  repo-audit/
```

Before adopting that shape, reconcile it with the current `protocol/sam`, `protocol/skills`, `protocol/presets`, `packages/agentsam-work`, and `packages/work-graph` authorities. Prefer extending canonical homes over parallel copies.

## Trial plan: prove before splitting

### Phase 0 — contract review

- inventory overlapping current schemas and runtime state;
- map each proposed field to an existing owner or identify a genuine gap;
- decide compatibility and migration rules;
- approve terminology and brand naming.

Deliverable: field/authority matrix. No new runtime.

### Phase 1 — one vertical trial

Use one internal, repeatable workflow such as package quality review:

1. accept one typed task;
2. compile a small inspect/verify/review graph;
3. gather command and file evidence;
4. evaluate required acceptance gates;
5. allow at most one revision;
6. emit feedback and a closeout receipt;
7. render human-readable progress.

Success requires that typed artifacts can be replayed and inspected without reading hidden model reasoning.

### Phase 2 — second shape

Trial one fanout/reduce workflow to test concurrency, partial failure, and conflict surfacing. Do not expand the schema solely to accommodate speculative cases.

### Phase 3 — extraction decision

Only split packages if the trials show independent ownership, consumers, and release cadence. Otherwise retain modules beside the current WorkGraph/runtime owners.

## Acceptance criteria for adopting the protocol

- one task runs through sequence, machine evidence, review, bounded revision, and receipt;
- one task runs through fanout/reduce and surfaces a genuine conflict;
- all required criteria enforce hard gates independent of weighted scores;
- context trust labels survive prompt compilation;
- no full-transcript dependency is required between nodes;
- existing WorkGraph and error authorities are reused rather than forked;
- UI progress can be rendered from run state alone;
- feedback can be recorded without changing shared behavior;
- brand findings use normalized feedback and retain informational scope;
- schemas validate fixtures and have explicit forward-compatibility rules.

## Open decisions

1. Should the canonical schemas extend current `protocol/sam/*` contracts or introduce a nested `protocol/work/` family?
2. Which current WorkGraph node/state fields can be adopted unchanged?
3. Is `map_reduce` useful in the task shorthand, or should it compile from `fanout` plus `reduce` only?
4. Which evidence data must be inline versus content-addressed?
5. What is the retention/redaction policy for prompt requests, tool logs, and screenshots?
6. Which acceptance evaluator registry owns command references and sandbox policy?
7. What compatibility promise applies to skill and cookbook manifests?
8. What one existing workflow is stable enough to serve as the first trial?

## Recommendation

Adopt the vocabulary and laws now as design guidance, but defer package creation and broad schema implementation. First map the proposal onto existing contracts, then prove one sequence/review loop and one fanout/reduce workflow. Promote only the fields and package boundaries demonstrated by those trials.
