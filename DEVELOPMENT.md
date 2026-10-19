Developing AgentSam
Canonical source: agentsam-sdk
Machinery: SAM — Systematic Autonomous Machinery
Distribution direction: private-first, reusable and commercially licensed where rights permit
Current release train: 2.6.13 (publication must be verified separately)
AgentSam is InnerAnimalMedia's development platform for turning substantial engineering work into reusable, versioned software: deterministic operations, SDKs, CLIs, packages, application shells, product modules and installable customer products.
The goal is not to duplicate an application for every customer. Build a capability once at its proper source, consume it through an explicit contract, and deliver a verified installation to the intended host. Complexity belongs in the machinery; the experience should remain straightforward.
Read [the ownership protocol](protocol/README.md), [SAM Kernel](docs/architecture/SAM_KERNEL.md), [application contract](docs/architecture/AGENTSAM_APPLICATION_CONTRACT.md) and [delivery closure standard](docs/standards/DELIVERY_CLOSURE.md) before changing a package or app boundary.
Source and ownership boundaries
Directory / authority	Owns
protocol/, src/sam/, src/	Portable contracts, normalized operations, SDK and CLI behavior
packages/	Reusable, separately identifiable packages with explicit public APIs; a directory does not determine licensing or publication status
apps/	Runnable products and hosts with canonical agentsam.app.json definitions
apps/*/apps/	Product-owned extension modules, not another independent Studio
.agentsam/	Local receipts and host/install state; not a duplicate product definition
apps/local-studio/	The existing Local Studio host, navigation, application discovery and launch surfaces
Customer installation	Its own Worker, database, object storage, providers, identity context and website


sam.invoke() is the normalized execution doorway. The registered operation, host adapter, authorization, tool executor, revision and evidence determine what actually runs. A declared capability is not proof that its provider or production host is connected.
There is one source of truth for each shared primitive. Preserve source and behavior before extraction, then replace duplicates with imports; do not mirror entire application trees. The portable cms_* contract governs editable public-facing sites, pages, themes, sections, blocks, assets, drafts and publications—not ecommerce orders, inventory, CAD geometry or other product-specific business records.
Applications and Local Studio
The complete @inneranimalmedia/ecommerce-cms-agentsam product supplies its real admin interface: Online Store, Theme Studio, pages and blocks, media, products, inventory, orders, growth, analytics and related application routes. Its first paying installation is Fuel & Free Time; no customer-specific data or configuration is a universal product default.
Local Studio discovers and hosts applications; it does not replace their business APIs with a generic CMS facade. The canonical site entry is /sites. A selected customer's Ecommerce Worker and resources remain authoritative for the installed application. CAD Creator and other products use the same app contract and installation pattern while keeping their own machinery and Workers.
included_apps is a build-time inclusion, not an installation record for a customer. Today agentsam app install <id> reports distribution instructions; it does not yet complete account-scoped installation and activation. Record build, installation, route launch and actual use as distinct delivery gates.
agentsam app list
agentsam app info cad-creator
agentsam app doctor cad-creator
Contributor setup and verification
Use Node.js 22.5+ and the repository's locked dependencies; Python 3.10+ is needed for the bundled Python tooling. Native engines and Docker are installed only for the operations that require them.
npm ci
npm run verify
npm run verify:registry
npm run verify:knowledge-package
npm run test:python
npm run security:release
npm run verify:release
verify:release is the aggregate release gate; running every command above separately is useful for diagnosis, not a second publication requirement. The suite includes SDK, CLI, identity, package, scaffold, knowledge, security and installed-tarball checks. Offline knowledge-package verification is available when required dependencies are cached:
npm run verify:knowledge-package -- --offline
Keep true engine tests separate from compilation or mock-free contract tests. For CAD, validate the native precision kernel, execution adapters, actual project revision roundtrip and produced artifacts on an equipped runner. Record pass, fail and skip honestly; skipped real-engine tests are not shipment evidence.
Work on a dedicated branch/worktree. Inspect existing branches and dirty state before touching a shared implementation:
git fetch origin --prune
git worktree list --porcelain
git status -sb
Never reset, rebase, force-push or delete unrelated work as a shortcut. Prefer a clean worktree based on origin/main when the primary checkout has diverged.
Consume and build locally
Within an authorized checkout, use the SDK's exact source or a pinned package version; do not confuse a development link with proof of a published installation.
# Existing repository
agentsam init . --yes --include src,docs

# New application
agentsam create my-agent --preset fullstack
Local package links can support contributor iteration. Release acceptance must install the actual intended npm tarballs and verify their exported contracts, executable, assets and launch behavior without relying on the monorepo checkout.
Private-first distribution and licensing
InnerAnimalMedia intends to keep original commercial application code and internal packages private by default. Private GitHub, npm package accessibility and intellectual-property licenses are different controls: none automatically grants or revokes the others.
- An internal workspace that must never be published uses "private": true.
- An installable product available only to authorized npm accounts uses "private": false and "publishConfig": { "access": "restricted" }, subject to registry access and billing support.
- Commercial applications require explicit, reviewed customer-use terms and rights notices.
- Existing MIT-licensed versions and third-party code retain their applicable permissions. Do not automatically relabel historical MIT code proprietary or imply those licenses are revoked. Audit code ownership and dependencies first.
- Keep npm read credentials in trusted CI or servers, never in browser JavaScript, customer site assets, committed .npmrc files or logs.
See [private-first release policy](docs/policy/PRIVATE_FIRST_RELEASE.md) once merged. Until that policy and all registry/release consumers are reconciled, treat private-first as a migration in progress, not as a finished distribution change.
Coordinated releases
SDK and Ecommerce CMS use the coordinated 2.6.13 release train, while remaining distinct npm artifacts with independent runtime/resource ownership. Supplier integrations and product-owned modules retain their legitimate dependency boundaries. A release version is not the same as a deployment or customer installation.
The canonical publication path is the protected, manually dispatched [stable release workflow](.github/workflows/publish-stable.yml), following source review, release-train validation, package/runtime tests, licensing checks, npm authorization and a clean release commit. Do not run npm publish --access public as an alternative release path. The target package must declare the approved access mode; publishing is blocked while any script or gate still assumes public distribution.
Required evidence:
1. All product and SDK manifests, dependency edges and lockfiles agree on the approved release versions.
2. The actual application and its embedded host build, with real source and assets; native functionality is exercised where required.
3. The appropriate package is published to its authorized registry scope and can be installed with read-only credentials.
4. Local Studio discovers and opens the intended app, with a verified selected installation and permissions.
5. Customer-owned APIs, persistence, publish operations and failure/recovery paths work in the target environment.
6. The deployed artifact, Git SHA, package integrity, installation and launch evidence are recorded before calling the delivery shipped.
Use [release receipts](docs/RELEASES.md) and [delivery closure](docs/standards/DELIVERY_CLOSURE.md). A merged PR, passing mock tests, or a preview is not a live release.
Current engineering boundaries
Hosted authorization, remote execution, storage/provider connections, customer installation activation and native CAD/BIM output must be verified in their actual runtime. Don't state that a declared API, scaffold, application or adapter is production-ready merely because its interface exists.
When work is incomplete, preserve its source, identify the owner and record the remaining acceptance gate. Do not replace a real product with a placeholder, duplicate Studio, or customer-specific hardcoding.
