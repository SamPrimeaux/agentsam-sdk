# Typography source audit

Baseline: 6744 occurrences across 274 tracked files (tracked source only; excluding generated dist, public and donor reference).

[Full per-file counts](typography-repository-audit-20261021.tsv).

Migration currently gates the CAD Creator and shared AgentSam navigation authored source. Other independent apps and theme packages are reported, not silently rewritten under the CAD release; each must read its own installed app manifest and reuse the same generator before enabling the repository-wide gate.
