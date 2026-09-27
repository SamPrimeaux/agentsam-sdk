# Scoring protocol

`ScoreCard` is a **versioned derived view** over raw evidence.

- Raw evidence (hashes, OBSERVED tokens, usage rows, known-asset ids) is SSOT.
- Scores are recomputable from evidence + `weights/*.vN.json`.
- Score families stay independent — never collapse into one `similarity_score`.
- Human accept/reject calibrates recommendations (Beta / outcome receipts); it does **not** mutate deterministic evidence.

See `@inneranimalmedia/agentsam-scoring` and `docs/content-studio/REVISION_GATE_2026-09-27.md`.
