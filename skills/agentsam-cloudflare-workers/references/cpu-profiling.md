# Worker CPU profiling

A deployed Worker's `performance.now()` and `Date.now()` do not measure pure CPU loops reliably because the clock advances around I/O rather than ordinary CPU execution. Never create fake production CPU timings from those APIs.

For CPU work:

1. Reproduce with `wrangler dev`/workerd using production-like routes, request volume, and data/bindings where safe.
2. Open DevTools from the Wrangler session and record a CPU profile.
3. Export the `.cpuprofile` and run `agentsam cloudflare cpu analyze <profile.cpuprofile>`.
4. Use the ranked self-time frames to select a small source slice.
5. Optionally hand the bounded profile + selected source packet to a high-reasoning model through `cloudflare.cpu.audit`.
6. Verify the fix locally, then compare production CPU metrics/error rate after normal deployment gates.

Pay attention to garbage collection as well as application frames. Large allocation churn can be the hotspot even when no single application function looks dominant.

Use native implementations when they remove JavaScript CPU work. For example, Worker Web Crypto operations are preferable to CPU-heavy pure-JavaScript cryptography when compatible with the required algorithm and contract.
