# Developing AgentSam SDK

This is the canonical repository for portable AgentSam kits. Read
[protocol/README.md](protocol/README.md) for ownership and host-adapter boundaries.

## Local verification

```sh
npm ci
npm run verify
npm run verify:knowledge-package
npm run test:python
npm run security:check
```

`npm run verify:release` combines all four verification commands. The `prepublishOnly`
hook runs it automatically before npm publication. `verify` covers SDK and identity
tests, package invariants, scaffold/bootstrap checks, and a pack dry-run.

The installed-tarball proof generates and runs a fresh app, then initializes, indexes,
searches, snapshots, and stages the Docker knowledge service in two unrelated repositories.
It installs the candidate tarball so a release never accidentally tests an older registry
version. Use `npm run verify:knowledge-package -- --offline` when dependencies are cached.

The Python suite uses unittest and bundled standard-library tooling. Rich is optional.
Postgres/pgvector checks use development-only PGlite; no production database or embedding
API call is required by the tests. Dependency scanning requires access to OSV.

## Use in a consumer

```sh
npm link
cd /path/to/consumer
npm link @inneranimalmedia/agentsam-sdk
agentsam context --json
```

Git context is derived from the checkout. Host authorization and credentials are supplied
through explicit adapters. See [portable context](docs/PORTABLE_CONTEXT.md).

For a new local application:

```sh
agentsam init --name my-agent --lane fullstack --run-target local --yes
```

For an existing repository:

```sh
agentsam init . --yes --include src,docs
```

## Publish

Use [the stable 2.0 release guide](docs/sdk-2.0-release.md). The root package is the only
npm publication; identity and shell-kit workspaces remain private. Versions in the root
manifest, lockfile and identity workspace must match. All export targets and the shipped
knowledge-service runtime assets are checked before publication.

`scripts/npm-publish-preflight.sh` checks package invariants and npm login. Package
publishing rights are enforced by npm, not a hardcoded local username. Scoped public
publication uses `--access public`.

Stable publishing is manual:

```sh
npm publish --tag latest --access public
```

Legacy `publish:identity-alpha` commands and the manual alpha workflow only accept alpha
versions. They do not publish a stable version under the alpha tag.

## Remaining integration work

The local status command is implemented. Hosted execution/orchestration, production
knowledge-service routing, additional embedding adapters, scheduled indexing, and retention
are separate host or feature work. The archived execution branch is mapped in
[branch archive](docs/branch-archive-2026-09-02.md); it is not an implemented API surface.

Gorilla remains a visual experiment. It is not the default scaffold or a production shell.
