# Harvest evidence (read-only)

Copied from `~/.agentsam/harvest/studio-cms-editor-20260929` for in-tree acceptance.

- Donor behavioral authority remains `local-donor://studio-cms-editor` (not modified by this lane).
- Plans under `plans/` define what to keep, adapt, and drop.
- Do not treat this folder as a runtime dependency of the published editor UI.
- Forbidden-string scanners skip this directory so historical donor docs can mention deployment names without becoming product code.
