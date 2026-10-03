/**
 * @inneranimalmedia/agentsam-content
 *
 * Peer domain over shared Asset Core (`@inneranimalmedia/agentsam-assets-core`).
 * BrandPack owns brand-scoped assets; Content owns library/lifecycle/usage.
 * Providers own representations only. Hosts inject capabilities + knowledge.
 *
 * Layers:
 *   contracts     — BrandResolver, KnowledgeAdapter, LocalContentHost, capabilities
 *   core          — ContentAsset library state (references Asset Core ids)
 *   providers     — legacy adapters (capability-split contracts preferred)
 *   processors    — deterministic byte probes
 *   intelligence  — machine pass first; knowledge via host adapter
 *   runtime       — createContentRuntime() + runtime.capabilities()
 *
 * SSOT: docs/content-studio/REVISION_GATE_2026-09-27.md
 */
export * from "./contracts/index.js";
export * from "./core/index.js";
export * from "./providers/index.js";
export * from "./processors/index.js";
export * from "./intelligence/index.js";
export * from "./runtime/index.js";
export * from "./local/index.js";
export * from "./storage/index.js";
