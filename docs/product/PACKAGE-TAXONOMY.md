# AgentSam Package and App Taxonomy

This is the exhaustive current package/app placement map for `agentsam-sdk`. It complements `OFFER-PORTFOLIO.md`.

## Packages

| Package | Portfolio role | Primary offer(s) | Current description |
| --- | --- | --- | --- |
| `@inneranimalmedia/agentsam-abs` | Product engine | AgentSam Browser | AgentSam Auto Browser Shell: dual-mode Explore/Build browser surface with provider-agnostic generative navigation, sandboxed previews, deterministic history, and packaged runtime scenes. |
| `@inneranimalmedia/agentsam-analytics` | Product engine | AgentSam Analytics | Portable AgentSam analytics read models and operational analytics surfaces. |
| `@inneranimalmedia/agentsam-assets-core` | Shared primitive | Brand, Content Studio, Merch, Commerce Studio | Shared Asset Core: canonical ast_* identity, machine facts, provenance, and provider representations. Peer BrandPack and Content domains build on this — neither owns the other. |
| `@inneranimalmedia/agentsam-brand` | Product engine | AgentSam Brand | Deterministic Brand Intelligence + portable brand-asset promotion SDK for AgentSam (inspect, derive, plan, promote, publish, verify). |
| `@inneranimalmedia/agentsam-browser-surface` | Product engine | AgentSam Browser, Local Studio | AgentSamBrowserSurface: a portable Browse/Build browser capability with a provider registry so the lightweight Local Studio browser and the AgentSam Browser Shell can be swapped behind one stable host composition. |
| `@inneranimalmedia/agentsam-campaign` | Product engine | AgentSam Campaign | Portable AgentSam campaign intelligence for promotional planning, product launches, SEO/content strategy, merchandising, audience targeting, conversion, brand consistency, and evidence-backed campaign evaluation. |
| `@inneranimalmedia/agentsam-cloudflare-images` | Provider adapter | Content Studio, Brand | Shared Cloudflare Images transport: credentials, delivery URLs, and HTTP client. Content and Brand consume this — duplicate clients are not allowed. Independent project; not affiliated with Cloudflare, Inc.. |
| `@inneranimalmedia/agentsam-content` | Product engine | AgentSam Content Studio, Site Studio, Commerce Studio | Portable content/library peer domain over Asset Core: lifecycle, usage, providers, intelligence, and createContentRuntime(). BrandPack remains peer brand authority. |
| `@inneranimalmedia/agentsam-content-studio` | Product UI | AgentSam Content Studio | Canonical React UI for AgentSam Content Studio: library, inspectors, assistant rail. Host apps provide a ContentRuntime; the UI never knows their names. |
| `@inneranimalmedia/agentsam-contracts` | Shared primitive | All AgentSam offers | Framework-neutral AgentSam contracts for workbench, tools, providers, events, hooks, execution, identity and repository context. |
| `@inneranimalmedia/agentsam-database-editor` | Product engine/UI | AgentSam Database Studio | Portable AgentSam Database Editor — adapters for SQLite/D1/Postgres/Supabase + vectors surface. Donor: IAM /dashboard/database. Independent project; not affiliated with Supabase. |
| `@inneranimalmedia/agentsam-desktop-shell` | Host/packaging primitive | Local Studio and packaged apps | Tauri desktop shell for AgentSam-powered brand dashboards — manifest-driven, multi-brand installs. Independent project; not affiliated with Tauri. |
| `@inneranimalmedia/agentsam-docs-theme` | Presentation primitive | Public documentation | Violet docs skin tokens for AgentSam public guides (Systematic Autonomous Machinery). |
| `@inneranimalmedia/agentsam-errors` | Shared primitive | All AgentSam offers | Canonical AgentSam runtime error normalization, classification, transport, remediation and rendering. |
| `@inneranimalmedia/agentsam-goap` | Shared orchestration primitive | Work, Hosted Runtime, long-running workflows | Portable AgentSam GOAP control-plane contracts and adapters over existing blackboard, ticket, workflow, execution, approval, queue, runtime, and evidence stores. |
| `@inneranimalmedia/agentsam-hooks` | Shared primitive | All extensible AgentSam offers | Provider-neutral, language-agnostic AgentSam lifecycle hooks with callback, command, HTTP, model, tool, MCP, LSP, and sub-agent adapters. |
| `@inneranimalmedia/agentsam-ide` | Product engine/UI | Developer Studio, Local Studio | AgentSam IDE packages — Monaco, file tree, xterm, LSP client, first-login onboarding. Rapidly deployable into Local Studio / desktop. |
| `@inneranimalmedia/agentsam-key-manager` | Shared product surface | Local Studio, provider setup | AgentSam settings UI for keys + integrations. Uses agentsam-vault contracts; Kumo-style SensitiveInput primitives. |
| `@inneranimalmedia/agentsam-knowledge` | Product engine | AgentSam Knowledge | Portable AutoRAG discovery, adapter registries, probes, and company routing contracts for AgentSam. |
| `@inneranimalmedia/agentsam-loading-scene` | Presentation/runtime primitive | Local Studio, Browser, packaged apps | Provider-agnostic runtime visualization with six seamless full-frame Computational Hyperspace studies driven by real AgentSam runtime semantics. |
| `@inneranimalmedia/agentsam-merch` | Product engine | AgentSam Merch, Commerce Studio | Provider-neutral manufacturing profiles, preflight, derivative planning, and collection-lab primitives for AgentSam. |
| `@inneranimalmedia/agentsam-nav` | UI primitive | Dashboard-family apps | Reusable responsive navigation primitives for AgentSam dashboard-family applications. |
| `@inneranimalmedia/agentsam-queue-control` | Shared orchestration primitive | Work, Hosted Runtime | Portable AgentSam queue, job-routing, retry, scheduling, and execution-control primitives with provider adapters. |
| `@inneranimalmedia/agentsam-repository` | Shared/domain primitive | Knowledge, Developer Studio, Local Studio | Portable AgentSam repository identity, Merkle, semantic file metadata, persistence, and repository graph runtime contracts. |
| `@inneranimalmedia/agentsam-scoring` | Shared decision primitive | Campaign, Work, GOAP, quality systems | Generic ScoreCard contract and versioned weight formulas. Raw evidence is SSOT; scores are recomputable derived views — never a grand similarity_score. |
| `@inneranimalmedia/agentsam-sections` | Product/design primitive | Site Studio, Browser generated sites | Reusable mxs-* page kit: global header/footer, scroll-driven split sections, and a media slot for image, gif, video, glb and sandboxed app previews. |
| `@inneranimalmedia/agentsam-settings` | UI primitive | Local Studio and packaged apps | Portable AgentSam Settings shell, contracts, fixtures, and host adapter surface for desktop and hosted applications. |
| `@inneranimalmedia/agentsam-shell-kit` | UI/host primitive | Local Studio and packaged apps | Compatibility facade for the AgentSam workbench shell. New code uses @inneranimalmedia/agentsam-workbench. |
| `@inneranimalmedia/agentsam-vault` | Security primitive | All credentialed AgentSam offers | AgentSam credential vault core — contracts, AES-GCM crypto, provider registry, resolver. UI lives in agentsam-key-manager. |
| `@inneranimalmedia/agentsam-work` | Product engine | AgentSam Work | Portable AgentSam Work product surface: shared work contracts, fixture and HTTP hosts, project/ticket/mail/calendar/artifact views, and host-neutral React UI. |
| `@inneranimalmedia/agentsam-workbench` | Shared product UI primitive | Local Studio and AgentSam apps | Reusable AgentSam workbench primitives for agent threads, composer, browser, terminal and resizable work surfaces. |
| `@inneranimalmedia/analytics-ui` | Product UI | AgentSam Analytics, Commerce Studio | Domain-neutral analytics presentation primitives for Inner Animal Media products. |
| `@inneranimalmedia/cms-runtime` | Product engine | Site Studio, Commerce Studio | Portable self-describing local CMS runtime with SQLite schema, tool/skill catalogs, and provider-neutral package contracts. |
| `@inneranimalmedia/theme-heuristic` | Theme/prebuild | Site Studio | Stock AgentSam CMS storefront shell theme contract (heuristic-theme). |
| `@inneranimalmedia/agentsam-identity` | Platform capability | Public/local identity implementations | Identity module for @inneranimalmedia/agentsam-sdk (workspace — publish via root SDK) |
| `@inneranimalmedia/theme-cypress` | Theme/prebuild | Site Studio | A welcoming community prebuild for organizations that need events, groups, giving, visits, and mission-driven storytelling without looking like a generic nonprofit template. |
| `@inneranimalmedia/theme-ember` | Theme/prebuild | Site Studio | An editorial commerce prebuild that mixes product discovery, brand story, collections, community, and launch moments without collapsing into another tiled product grid. |
| `@inneranimalmedia/theme-forge` | Theme/prebuild | Site Studio | A mobile-first local-services prebuild with estimate capture, service-area confidence, project proof, reviews, and practical trust signals that stay sharp on the smallest screen. |
| `@inneranimalmedia/theme-grove` | Theme/prebuild | Site Studio | A visual service-business prebuild centered on project galleries, material detail, process, reviews, and estimate conversion — polished enough for a studio, practical enough for a crew. |
| `@inneranimalmedia/theme-harbor` | Theme/prebuild | Site Studio | A professional-services prebuild for trust-heavy businesses: clear service storytelling, proof, resources, and lead capture with enough editorial polish to avoid the usual corporate-blue template look. |
| `@inneranimalmedia/theme-iasf` | Theme/prebuild | Site Studio / Commerce Studio | IASF — stock Inner Animal Storefront theme pack (normalized from studio-cms-editor harvest). |
| `@inneranimalmedia/theme-resolve` | Theme/prebuild | Site Studio / Commerce Studio | A high-fashion commerce prebuild built around cinematic scroll, shoppable editorial, sticky purchase rails, lookbooks, stories, bundles, and micro-interactions that make the storefront feel directed instead of assembled. |
| `@inneranimalmedia/theme-scenes` | Composition primitive | Site Studio, branded experiences | Reusable scene / shell / block vocabulary for branded website experiences. BrandPack owns look; theme-scenes owns composition. |
| `@inneranimalmedia/theme-summit` | Theme/prebuild | Site Studio | A restrained consulting and portfolio prebuild with editorial services, case studies, multilingual-ready structure, media, and thoughtful spacing that lets expertise do the talking. |
| `@inneranimalmedia/theme-violet` | Theme/prebuild | Site Studio | A campaign-forward prebuild with bold calls to action, impact proof, stories, donation moments, and participation paths designed to turn attention into action. |
| `@inneranimalmedia/agentsam-work-graph` | Shared/domain primitive | AgentSam Work, Hosted Runtime | Core AgentSam work-graph primitive: one graph model (WorkItem, Dependency, TimelineEvent, Artifact, Evidence, Actor) powering an engineering adapter (git/MCP/tests/deploys) and a business adapter (projects/clients/approvals/milestones), with Gantt/timeline rendering as a pure projection over the graph rather than its own source of truth. |
| `@inneranimalmedia/agentsam-provider-completeful` | Provider adapter | Commerce Studio, Merch | Portable Completeful provider adapter and AgentSam tool definitions. |
| `@inneranimalmedia/agentsam-connector-cloudflare` | Provider connector | Platform/runtime/storage consumers | Portable Cloudflare capability connector for AgentSam applications and SDK consumers. Independent project; not affiliated with Cloudflare, Inc.. |

## Apps

| App | Portfolio role | Primary offer | Current description |
| --- | --- | --- | --- |
| `@inneranimalmedia/agentsam-browser-site` | Product/public surface | AgentSam Browser | Public site for AgentSam Browser. Consumes the real ABS and sections packages. |
| `@inneranimalmedia/agentsam-go-worker` | Deployable runtime | AgentSam Hosted Runtime | Deployable AgentSam Go runtime service artifact for Cloudflare Worker + Container self-hosting and official InnerAnimalMedia releases. Independent project; not affiliated with Cloudflare, Inc.. |
| `@inneranimalmedia/agentsam-cad-creator` | Packaged app | AgentSam CAD Studio | Prepackaged AgentSam CAD, spatial design, and robotics application kit. |
| `@inneranimalmedia/client-cms-editor` | Donor/reference app | AgentSam Site Studio | Reusable full-stack website + CMS kit with multi-page public sites, a protected authoring dashboard, local SQLite, starter/theme import, and pluggable auth, storage, and deployment adapters. |
| `@inneranimalmedia/ecommerce-cms-agentsam` | Packaged app/runtime | AgentSam Commerce Studio | Portable AgentSam ecommerce CMS runtime, scaffolding, media, analytics, and admin application package. |
| `@inneranimalmedia/agentsam-local-studio` | Primary product app | AgentSam Local Studio | Portable AgentSam Local Studio desktop and hosted workbench for local-first projects, terminals, providers, and packaged apps. |
| `@inneranimalmedia/agentsam-work-app` | Packaged/reference app | AgentSam Work |  |

## Interpretation

- **Product engine/UI** may be marketed through the named offer, but package identity and product identity are not automatically the same.
- **Shared primitive** exists to make multiple products stronger and should not be forced into a standalone offer without separate product evidence.
- **Provider adapter/connector** stays beneath provider-neutral product operations.
- **Theme/prebuild** can be sold or bundled as a design asset while remaining subordinate to Site Studio/Commerce Studio domain authority.
- **Donor/reference app** is implementation evidence, not necessarily the long-term product identity.

Any new package should be added here when introduced.
