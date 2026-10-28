# AgentSam / InnerAnimalMedia — Iconography WIP preservation (2026-10-22)

This work belongs in the **AgentSam SDK Brand tooling**, not the DreamHouse Blender/IFC repository.

## Production source / ownership

- Active SDK worktree: /Users/samprimeaux/agent-worktrees/brand-iconography-kit-20261022
- Branch: feat/brand-iconography-kit-20261022
- Starting HEAD at inspection: 2a80dc51261231869b28df2b9b26443ed517b8fb
- Core package: packages/agentsam-brand/
- Source manifest: packages/agentsam-brand/assets/iconography/v1/iconography.manifest.json
- Source manifest kit ID: inneranimalmedia-agentsam-iconography
- Manifest revision when inspected: r03
- Related vector/merch code: packages/agentsam-merch/
- Canonical desktop icon upstream: packages/agentsam-desktop-shell/src-tauri/icons/icon-1024-master.png
- Canonical InnerAnimalMedia PWA icon upstream: app/dashboard/public/pwa/icon-512.png (inneranimalmedia repo)

## Work to preserve and integrate

The inspected worktree contains a complete-in-progress source set, including canonical icon sources, SVG system icons, colorway config, Blender clay renderer presentation contracts, an import-lucide-icons tool, Brand CLI controllers, preview logic, and tests. It also extends the agentsam-merch SVG normalization path.

**Do not reset, clean, prune or delete this worktree, or discard any untracked files.** The modified tracked files and untracked source-set must be reviewed, tested, committed and merged together. A separate SHA-verified snapshot is stored on the Expansion external drive in the AgentSam/Brand/Iconography area (not DreamHouse).

The source manifest explicitly treats the canonical desktop and PWA source pixels as immutable inputs; cobalt, frost and graphite variants are derivatives. Do not replace or blur the masters while polishing 3D app icon output.

## Acceptance to close this item

1. Independently verify the exact source assets and manifest references.
2. Ensure Brand CLI can ingest, inspect, generate previews, optimize and pack while preserving source hashes and source/derivative distinctions.
3. Run and repair agentsam-brand source-set and brand tests plus agentsam-merch SVG normalization tests.
4. Verify PNG / ICO / ICNS variants and icon surface sizes, dark/light/cobalt/frost/graphite presets and normalized semantic icon exports.
5. Perform a human visual QA of app icons in macOS Dock, Finder, Local Studio, and web surfaces.
6. Integrate the approved kit into existing SDK branch lineage without erasing unrelated dirty work.
7. Merge only after validation; report real Git commit and generated artifact receipts.

The reference image shared in chat on 2026-10-22 shows a blue rounded-square AgentSam app icon; do not assume this screenshot changes the manifest's canonical source authority.
