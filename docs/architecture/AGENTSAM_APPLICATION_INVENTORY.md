# AgentSam application source inventory

- **Last audited:** 2026-11-25
- **Source:** checked-in agentsam.app.json, agentsam.package.json, and adjacent package.json files
- **Checkout command:** `npm run app:inventory`

This is the repository source inventory. It is not a production D1 catalog export, npm registry report, deployment report, or runtime health check.

## Classification rules

| Record | Meaning | Independently installable by default? |
|---|---|---|
| agentsam.app.json with schema agentsam.app.v1 and kind app | A canonical application identity recognized by agentsam app list | No. The manifest's install and distribution declarations must be checked separately |
| agentsam.package.json with kind module | A host-owned application module or capability | No |
| agentsam.package.json with kind provider | A provider integration owned by an application | No |
| Other agentsam.package.json | A supporting runtime or internal package | No |
| package.json alone | An npm package; it does not create an AgentSam application identity | No |

Application manifests are discovered under both apps/ and packages/. GoalGuru is the current package-owned application example. Do not limit discovery to apps/*.

owner_app_id identifies the application that owns the module's product/domain behavior. distribution.owner_host identifies the application that hosts/bundles its runtime. They can legitimately differ. For example, AgentSamForms is owned by Ecommerce + CMS but hosted by Local Studio.

## Canonical application identities

The following seven identities are returned by node bin/agentsam app list in this checkout. This is distinct from the source-boundary scan: npm run app:boundaries currently scans 13 non-underscore top-level app source directories, including directories that are not application manifests. The self-contained workspace contract test at test/apps-scaffold-contract.test.mjs currently covers only Local Studio and CAD Creator.

| App ID | Product name | Source directory | npm package | Runtime entry | Install declaration | Distribution declaration |
|---|---|---|---|---|---|---|
| local-studio | AgentSam / Local Studio | apps/local-studio | @inneranimalmedia/agentsam-local-studio | /admin/agentsam | External install declared | desktop-host; native release required |
| cad-creator | CAD Creator | apps/cad-creator | @inneranimalmedia/agentsam-cad-creator | /cad | npm install command declared | Release status not declared |
| ecommerce-cms-agentsam | AgentSam Ecommerce + CMS | apps/ecommerce-cms-agentsam | @inneranimalmedia/ecommerce-cms-agentsam | /admin/store | Not declared in app manifest | Release status not declared |
| design-canvas | AgentSam Design Canvas | apps/design-canvas | @inneranimalmedia/agentsam-design-canvas | /design-canvas | npm install command declared | source-release-verified-only |
| moviemode | MovieMode | apps/agentsam-copro-studio | @inneranimalmedia/agentsam-copro-studio | /admin/moviemode | Not declared in app manifest; npm package is private | bundled-source |
| samsketch | SamSketch | apps/samsketch | @inneranimalmedia/samsketch | /samsketch | Not declared; package is private | source-private |
| goalguru | GoalGuru | packages/agentsam-goalguru | @inneranimalmedia/agentsam-goalguru | /goalguru | install.supported: true | Release status not declared |

The manifest package names and adjacent npm package.json names match for all seven records in this checkout. That confirms local metadata consistency only; it does not prove that a matching version is currently published or deployable.

### Important interpretation

- agentsam app list means **manifest-registered application identities**, not "all installables".
- The app manifest is the source identity. The adjacent npm package is a distribution artifact. A package being public or having an install command does not prove the application has passed its complete install/release gates.
- local-studio is the AgentSam host application. There is no separate agentsam app ID in the current manifest inventory.
- GoalGuru is intentionally package-owned under packages/; moving it into apps/ is not required for discovery.

## Host-owned modules

| Module ID | Name | Manifest location | Domain owner (owner_app_id) | Runtime host | Installable | Current declaration |
|---|---|---|---|---|---|---|
| agentsamforms | AgentSamForms | apps/local-studio/apps/agentsamforms | ecommerce-cms-agentsam | local-studio (explicit distribution.owner_host) | No | bundled |
| growth | Growth | apps/ecommerce-cms-agentsam/apps/growth | ecommerce-cms-agentsam | Ecommerce + CMS | No | bundled |
| product-studio | Product Studio | apps/ecommerce-cms-agentsam/apps/product-studio | ecommerce-cms-agentsam | Ecommerce + CMS | No | bundled |
| samspeaks | SamSpeaks | apps/samspeaks | moviemode | MovieMode | No | module; role moviemode-voice-direction |

AgentSamForms is not an ownership contradiction: the manifest deliberately separates Ecommerce + CMS as domain owner from Local Studio as runtime host. Its declared frontend, backend, and migration paths resolve relative to the Local Studio source root.

Growth and Product Studio are Ecommerce + CMS modules, not separate application identities. SamSpeaks has its own package/source directory but its manifest says kind module, owner_app_id moviemode, and installable false; it is not an independent installable app today.

## Provider integrations

| Provider ID | Name | Manifest location | Owning app | Installable |
|---|---|---|---|---|
| completeful | Completeful | apps/ecommerce-cms-agentsam/apps/completeful | ecommerce-cms-agentsam | No |
| resend | Email / Resend | apps/ecommerce-cms-agentsam/apps/resend | ecommerce-cms-agentsam | No |

These are provider integrations consumed by Ecommerce + CMS, not standalone apps.

## Supporting runtime packages under apps/

| Package identity | Source | Classification |
|---|---|---|
| agentsam-go-worker | apps/agentsam-go-worker | Go runtime / Worker distribution artifact |
| agentsamd | apps/agentsamd | Local AgentSam daemon |
| agentsam-local-shared | apps/local-studio/shared/agentsam | Local Studio internal shared package |

They have package metadata but are not agentsam.app.json application identities.

## SDK implementation packages

The repository currently contains 54 package-owned agentsam.package.json manifests under packages/. These describe SDK packages, implementation modules, contracts and capabilities; they do not automatically become app identities.

Relevant families:

| Product/capability area | Source packages | Current application identity |
|---|---|---|
| CoPro | 10 packages/copro-* packages: editor, media, project, proof, provider-contracts, render, storage, templates, timeline, UI | No separate CoPro app manifest |
| SamScene | packages/iamscene | Engine/package only; no separate SamScene app manifest |
| Database Editor | packages/agentsam-database-editor | Capability package; no separate app manifest |
| Workbench | packages/agentsam-workbench | Shared workbench package; not an app identity |
| Desktop shell | packages/agentsam-desktop-shell | Shared host/runtime package; not an app identity |

## Product intentions not represented as independent app identities

This section distinguishes intended product names from what the repository currently registers. Absence of an app manifest does not mean there is no related code.

| Intended product | Current repository evidence | Current classification |
|---|---|---|
| AgentSam | apps/local-studio/agentsam.app.json | Local Studio host app; canonical ID local-studio |
| SamSpeaks | apps/samspeaks/agentsam.package.json | MovieMode-owned module |
| SamScene | packages/iamscene | Reusable scene engine/package; no app manifest |
| SamSculpt | No separate app manifest or app root found in the current apps/ and packages/ scan | Not registered as an app |
| MovieMode | apps/agentsam-copro-studio/agentsam.app.json | Registered app ID moviemode |
| CoPro | packages/copro-*; MovieMode manifest lists module ID copro | Implementation package family; no separate app identity |
| MeauxGames | No separate app manifest or app root found in the current apps/ and packages/ scan | Not registered as an app |

## Review flags and decisions

1. **MovieMode / CoPro package identity:** the MovieMode app lives in apps/agentsam-copro-studio, and its npm package is named agentsam-copro-studio. Its manifest also lists module ID copro using the same npm package as the host app. The CLI inventory flags both the directory-name exception and this self-package reference. Do not rename the app, package, or module until the intended boundary between MovieMode and CoPro is decided.
2. **SamSpeaks graduation:** keep it classified as a MovieMode-owned module until it has its own app identity, host/runtime contract, distribution artifact, install path and independent acceptance evidence.
3. **AgentSamForms ownership vocabulary:** retain the current owner/host split, but keep the distinction explicit in any future schema or UI. Do not collapse owner_app_id and distribution.owner_host into one field.
4. **Distribution declarations:** Ecommerce + CMS has no install declaration in its app manifest; CAD Creator has an npm install command but no release status declaration; Design Canvas explicitly says source-release-verified-only; SamSketch explicitly says source-private; MovieMode says bundled-source. These are not interchangeable readiness states.
5. **Database catalog reconciliation:** the seven source identities are not expected to equal every row in the production D1 apps catalog. Reconcile app manifests to D1 apps and agentsam_app_installations explicitly; never seed or delete rows merely because a directory or package exists.

## Commands

From the SDK repository root:

    # Existing app identity list (7 manifest records in this checkout)
    node bin/agentsam app list

    # Full source inventory
    npm run app:inventory

    # Machine-readable inventory
    node bin/agentsam app inventory --json

    # Include all 54 package-owned SDK package manifests
    node bin/agentsam app inventory --packages

    # Existing manifest and package gates
    npm run app:validate
    npm run app:packaging
    npm run app:boundaries

app inventory reads the checked-in repository only. It deliberately does not query npm, D1, Cloudflare deployments, or runtime health. The new subcommand is present in this checkout; the globally installed CLI will expose it only after a release containing this change.
