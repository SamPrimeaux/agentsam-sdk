# Read this first

Target: the AgentSam theme editor (route /admin/theme-editor?slug=home) in the Ecommerce CMS app. Build what AgentSam already has and extend it in place.

The control inventory is a reference spec of another editor's controls. It is not a product to copy or link to.

- Never link to, name, or send users to Shopify. Use translations.md. Sidekick means AgentSam and miniAgentSam.
- Extend the existing owners named in each panel file. No new registries, tables or parallel directories.
- Every control needs a purpose and a working effect on the draft or preview. No placeholder panels, no "coming soon" labels.
- Range bounds come from ranges.md. Segmented selected states come from gaps.md and the evidence screenshot.
- Original copy only: write your own helper text and help articles.
- Take one package from swarm/packages.json, finish it, prove it, merge your own PR to main, prune your branch and worktree.
- Handoff to Sam is the route plus the exact clicks to try. Do not run automated browser tests.
- Do not recommend or write specific AI model names into any file.
- Where the reference and current AgentSam code disagree, the reference wins. Upgrade AgentSam to match.
- Work only in your package's worktree on your package's port (swarm/packages.json). Start the app's existing dev server on that port and verify your panel there.
- Rebase onto main right before merging. Keep the PR to your package's touches.
