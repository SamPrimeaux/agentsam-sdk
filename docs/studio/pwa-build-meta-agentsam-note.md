# `pwa-build-meta.json` and AgentSam Local Studio

`https://inneranimalmedia.com/pwa-build-meta.json` is an **InnerAnimalMedia dashboard / PWA ship fingerprint**, not a Local Studio runtime dependency.

- AgentSam Local Studio (`agentsam.inneranimalmedia.com`) does **not** fetch or require `pwa-build-meta.json`.
- A 404 for that path against the Studio host is **noise**, not evidence of a broken Studio deploy.
- Studio deploy proof uses Worker version metadata / `git_sha` from the Local Studio deploy receipt instead.

Do not treat Studio health checks as failed solely because `pwa-build-meta.json` is missing on the Studio origin.
