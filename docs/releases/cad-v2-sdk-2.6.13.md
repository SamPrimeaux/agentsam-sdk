# AgentSam SDK 2.6.13 — CAD project contract and native machinery

Release authority: the fixed first-party `2.6.13` train on GitHub `main`.

The SDK publishes `cad.project.v2` schema and TypeScript/runtime adapters, SAM production-operation ports and output/deliverable profiles. The package includes `services/cad/occt` C++ sources and their CMake definition for reproducible host builds.

## Release

1. Review this PR and require green GitHub CI (including the deterministic release-plan check).
2. Merge into `main`, keeping unrelated application and Cloudflare Workers intact.
3. In GitHub Actions manually run **Publish AgentSam SDK stable release** on `main`, with input `2.6.13`.
4. The action checks clean main, the fixed train, package validations, then publishes all public first-party packages in dependency order and installs the root SDK into a new npm consumer directory.
5. It requires the repository secret `NPM_TOKEN` authorized for `@inneranimalmedia` and npm trusted/provenance permissions. Existing published packages at the exact version are skipped for safe restart.

Run `node scripts/sdk-release-publish.mjs --plan` for a read-only release plan; never call `--publish` outside the verified GitHub main workflow.

## What v2 means

`cad.project.v2` is the reusable project **contract version**, not a request to publish `@inneranimalmedia/agentsam-sdk@2.0.0`. The SDK package version is `2.6.13`.

CAD Creator's current React editor still uses the legacy v1 `DesignProject` representation internally; v2 compatibility adapters keep that existing functionality. The new npm version provides the canonical contract and provider APIs but **does not falsely claim** complete BIM, architectural details, cost engineering or cinematic engines are wired through v2 yet.

The native OCCT C++ program was clean-built with AppleClang and passed doctor/STEP volume roundtrip tests. Native executables require host-specific installation/compilation; npm ships sources, not a universal binary.

The dedicated CAD Worker remains independent. This release workflow does not modify or deploy either Worker.
