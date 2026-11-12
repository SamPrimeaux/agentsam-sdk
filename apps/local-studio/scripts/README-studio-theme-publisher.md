# Studio UI theme packaging (D1 to R2)

This pipeline is for account/dashboard CMS appearance themes in the existing cms_themes table. It does not replace the installed website-theme system under theme-packages/ or create a second registry.

The D1 row is canonical. Every eligible non-archived UI theme with valid CSS variables is compiled into a content-addressed package in the theme-store R2 bucket, using the prefix:

cms/ui-themes/v1/<slug>/<sha256-prefix>/

Each package contains theme.css (scoped CSS variables), theme.json (complete configuration), monaco.json (editor colors), preview.svg (UI-layout preview), and manifest.json (file SHA-256 hashes and bytes). No model or provider information is stored.

Commands (run with authenticated Wrangler):

node apps/local-studio/scripts/publish-studio-themes.mjs
node apps/local-studio/scripts/publish-studio-themes.mjs --execute --update-db --verify
node apps/local-studio/scripts/publish-studio-themes.mjs --all
node apps/local-studio/scripts/publish-studio-themes.mjs --all --execute --update-db

The default command is a dry run of IAM Studio Light and IAM Studio Dark. --execute uploads. --update-db only writes D1 pointers after successful R2 uploads. --verify roundtrip-checks CSS bytes. --all includes all non-archived themes, skipping records without any usable UI CSS variables.

Older objects in the inneranimalmedia bucket are retained unchanged for rollback. Failed uploads do not update D1. Repeat uploads use immutable content-addressed keys. The script emits a JSON migration report in the temporary directory.

Private themes are NOT automatically public. The Theme Store Worker read endpoint validates the D1 current hash and authenticates private account ownership. Do not set css_url or preview_image_url to raw public R2 links without verified access. The previous assets.inneranimalmedia.com links are retained as compatibility sources. Keep site-theme installation separate from account appearance selection.

Next acceptance checks: serving Worker route, private-owner authenticated smoke, public CSS and preview rendering, curated favorites and archives without deleting historical assets.

