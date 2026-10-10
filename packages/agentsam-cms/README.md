# AgentSam CMS machine

The @inneranimalmedia/agentsam-cms package is a portable, versioned CMS
operations engine with no FuelNFreetime checkout, D1, MCP, ExecOS, or UI dependency.

This package provides:
- 13 canonical operations for definition discovery, page/section/block CRUD,
  duplicate/move/visibility, revision history/restore, private preview, and
  explicitly approved live publication.
- 12 compatibility aliases preserving legacy cms.section.* and cms.block.*
  callers; new models should discover the canonical component operations.
- Typed input and output schemas, definition-specific settings validation,
  atomic version checks, revision recovery and idempotent create operations.
- Trusted host actor/account/installation identity, permission and explicit
  publication approval, never delegated to model-authored parameters.
- Optional durable SQLite Node adapter, with separate live snapshots and
  revision history. Node SQLite is experimental on the currently used Node 22.

Portable entrypoint: @inneranimalmedia/agentsam-cms
Node adapter entrypoint: @inneranimalmedia/agentsam-cms/node

createCmsOperations needs a defineSamOperation callback from the installed
SAM SDK, a repository implementing the documented CmsRepository interface,
definitions containing settings_schema, resolveTrustedContext, and authorize.
It returns executable operation definitions, not inactive catalog placeholders.

The Node adapter createNodeSqliteCmsRepository({filename}) provides
transactional compare-and-swap, account/installation scoping, versions,
revival from historical snapshots, and durable publication snapshots.

Publish operations require BOTH explicit requested confirmation and a host
authorization response {allow:true, publicationApproved:true}. A model
cannot grant itself a publish permission.

The storefront or Worker supplies its own repository mapping the existing
authoritative CMS D1/R2 storage contracts. Do not add a competing family
of hosted CMS tables or import source from another repository.
The SQLite schema is a copied, pinned snapshot of the authoritative cms-runtime
schema, not a new family of tables. The SDK verifies it has not drifted.
Worker/D1 adapters must implement mutate with durable atomic revision CAS.

The package can be packed and installed independently. A release is not
hosted-production-ready until the consuming app implements and tests its
authorized repository and publish path with real resources.

Example (when installed as an application dependency):

  import {createCmsOperations} from '@inneranimalmedia/agentsam-cms';
  const installed = createCmsOperations({
    defineSamOperation, repository, definitions,
    resolveTrustedContext, authorize
  });
  // Register installed in the host SAM runtime after verifying its adapter.

The SDK also supports createSamOS({cms:{repository,definitions,
resolveTrustedContext,authorize}}), which installs the same operations.
