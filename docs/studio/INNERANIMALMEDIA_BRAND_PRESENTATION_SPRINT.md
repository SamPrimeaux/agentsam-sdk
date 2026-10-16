# InnerAnimalMedia — Brand Presentation Sprint 01
**Status:** real installed AgentSam role set; execution/published-copy review pending.
**Registered:** 12 active account-owned profiles in existing `agentsam_subagent_profile` D1, scoped to `ws_inneranimalmedia`.
**Source manifest:** `config/studio/inneranimalmedia-specialists.v1.json`.
**Remote backup:** `brand/studio/agentsam/profiles/2026-10-16/inneranimalmedia-specialists.v1.json`.
**Authority:** founder-approved living charter/decision records supersede this workflow, proposals and competitor research.

## The north star
InnerAnimalMedia is NOT another generic software development agency, AI startup or portfolio of unrelated apps. Present the THREE practices in an elegantly designed, compelling experience: Brand & Identity; Digital Experiences; Software & Intelligent Systems. Make work and human benefit visible first. Reveal engineering depth only where useful. Don't turn the site into an architecture studio, 3D showroom, or overstuffed SDK landing page.

Original motivation: a creative founder who struggled with restrictions, expenses and technical gatekeeping gradually built his own creative/engineering tools so others might have more agency. That history informs tone and experience, not unverified proof of commercial impact or an endless first-person autobiography. Maintain AgentSam's independent product identity, InnerAnimal's original brand, the reusable CMS's neutral tenant scope, FNF's first-tenant status and Meauxbility's independent mission.

## First live assignment — Copy Audit / Proposal Only
**Input:** current InnerAnimalMedia homepage, Work, About, practice/service pages, contact, navigation; current published CMS sections; current authentic screenshots; founder charter and existing design/motion source audit. If any source can't be accessed, make a blocked/source-missing record, not a fictional audit.

**Goal:** within three meaningful interactions a nontechnical visitor should recognize what the company does, how it could help them, and why the work is distinct; a developer should be able to explore real technical evidence without controlling the homepage's narrative.

### Deliberate sequence
1. **Brand Strategist** — identifies invariant mission, audience/positioning assumptions, claim support and what NOT to change; produces `BPS-001-positioning-brief`.
2. **UX Researcher** — specifies comprehension hypotheses, realistic first-click tasks and how to test them; NEVER invents users, survey findings or interview evidence.
3. **Content Strategist** — audits the real page inventory and makes a message/job-to-be-done map; each page/section has one purpose, supporting proof and next action. Proposed `BPS-001-content-map`.
4. **Brand Copywriter** — proposes three distinct headline/story directions, *not* three synonyms; writes one recommended source-grounded page skeleton (hero, practice summary, curated work intro, owned products, short founder thread and CTA), with mobile versions. Proposed `BPS-001-copy-deck`.
5. **Case Study Editor** — drafts one truthful, visually sequenced case-study outline using actual FNF, InnerAnimal, or AgentSam artifacts; labels project relationship and stage accurately. Proposed `BPS-001-case-outline`.
6. **UX Writer** — refines navigation, buttons, form fields, empty, loading, confirm/error and draft/preview/publish language with precise state references. Proposed `BPS-001-microcopy`.
7. **Information Architect + UX Designer** — verify content order and navigation on 375/430/768/1440 layouts; no invented pages or mocked functionality masquerading as shipped.
8. **Art Director + Motion Director** — show how copy lives in actual scene composition and transitions; study original WebP/scene JSON and authentic product screenshots; do not use generic mountains/sculptures or re-create Marqeta card graphics.
9. **Usability Evaluator + Design QA** — critique actual runtime evidence and alignment of approved concept to real screen; exact viewport comparisons, observed task steps and source URLs required. No browser proof means **not tested**, not a pass.

### Founder review gates
Gate A — **Meaning**: approve/reject positioning without silently changing brand charter. Gate B — **Story**: accept specific copy and case-study content. Gate C — **Experience**: accept a high-fidelity scene target and actual interaction states. Gate D — **Production**: approve CMS draft publication after real browser/QA evidence.
Each gate records revision, source IDs, reviewer decision, date and outstanding evidence. Rejected or competing directions remain archived, not silently overwritten.

### Handoff payload (each role)
```json
{
  "artifact_id": "BPS-001-...",
  "brand": "inner-animal-media",
  "workspace": "ws_inneranimalmedia",
  "revision": "v01",
  "status": "proposed",
  "sources": [{"source": "...", "observation": "...", "confidence": "verified|inferred|unknown"}],
  "audience_job": "...",
  "recommendation": "...",
  "copy_or_scene": {},
  "claims": [{"text": "...", "state": "VERIFIED|NEEDS_SOURCE|PROPOSAL", "source": "..."}],
  "decisions_needed": ["..."],
  "acceptance": ["..."],
  "next_role": "..."
}
```
Persist each accepted or proposed artifact via existing AgentSam Work/Plan/Content/CMS draft conventions and immutable versioned R2 sources where appropriate. Role prompts are **read-only** by design: they prepare reviewable copy/decisions; an authorized workflow persists or publishes them. Do not create a second CMS, second brand DB, or new SDK package.

## Ready-to-send first assignment
> Use the InnerAnimalMedia Brand Strategist, Content Strategist and Brand Copywriter profiles in sequence, using the existing founder-approved charter, actual current site routes and authentic project evidence. Audit the homepage's first three interactions and the Work / About / Services narrative. Identify where we sound like generic website developers, an architecture company, or an AI-app vendor. Distinguish verified claims from strategic inference. Propose three editorial directions that make distinctive design and operating software part of one story, then recommend one. Draft mobile-first homepage headlines, section copy and calls to action with a claim ledger. Do not publish or redefine the company; return artifacts for founder review. Do not invoke an unbudgeted multi-agent run without approval.

## Scope and restrictions
- Installed in D1 means profiles are available for assignment; no end-to-end autonomous brand workflow has been proven.
- The D1 subagent record `access_mode=read_write` means you may *edit profile definitions*, not that the role may write project files. `sandbox_mode=read-only` and explicit read/search tool list control execution permissions.
- `default_model_id=null` intentionally leaves runtime model routing to account policy; no unsupported model ID is hardcoded.
- The 12 roles do not automatically consume AgentSam Brand/Campaign/Content modules unless their actual runtime tools are authorized and bound. Ask for actual observed tool receipts.
- No unattended fanout or live CMS publication is performed in this first registration.
- Source of truth is the approved founder charter. Git manifest and live D1 should be reconciled when editing profile instructions; never overwrite one silently.
- Client branding, account/tenant configuration and commerce reusable product identity remain separate.

## What to verify next
1. Open AgentSam's existing Agents Settings in Local Studio; confirm the twelve profiles appear and are editable.
2. Select Brand Copywriter; supply authenticated source pages or verified source excerpts; inspect claim labels, tone and output.
3. Exercise a two-role handoff on an explicitly budgeted run; verify role slug resolution, real tool allowlist and source retrieval.
4. Only after demonstrated utility, connect content draft persistence and approved publish workflow.
