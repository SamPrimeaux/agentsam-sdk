# Game identity delivery recipe

Inspect the real source art and typography; compose a card, favicon and any
needed ratio-specific derivatives. Verify resolution, palette, crop, legibility,
license/provenance, and that deployed URLs actually serve the assets.

If the application includes a compatible atomic handoff helper, use:

```bash
node scripts/write-atomic.mjs .agentsam/staging/og.jpg public/og.jpg
node scripts/write-atomic.mjs .agentsam/staging/social-banner.jpg public/social-banner.jpg
node scripts/write-atomic.mjs .agentsam/staging/site.json src/lib/og/site.json
```

Use the actual host's file paths and supported equivalent when these optional
scripts are absent. The example does not require any specific hosting service.
Validate the built page, not only the local file, before claiming completion.
