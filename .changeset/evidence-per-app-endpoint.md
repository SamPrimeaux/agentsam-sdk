---
"@inneranimalmedia/agentsam-sdk": patch
---

Any app can declare its own evidence endpoint, R2 bucket, binding and scopes in `agentsam.app.json` (`storage.evidenceEndpoint`); the hosted evidence store no longer accepts only CAD's route, and `agentsam app validate` checks the block.
