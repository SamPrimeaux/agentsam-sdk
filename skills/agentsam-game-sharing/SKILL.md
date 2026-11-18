---
name: agentsam-game-sharing
description: >
  Create portable game identity, sharing previews, favicons and optional
  installable-game icons using standard Open Graph metadata. No dependency on
  a particular social network, deployment domain, game engine or image provider.
metadata:
  short-description: "Game identity, Open Graph previews, favicons and installable icons"
user-invocable: false
---

# Game Sharing & Identity

Use this cookbook when a game needs a title, share preview, browser icon,
installable icon set, or page metadata. Treat public images as derivatives of
approved game art; never replace original masters with marketing crops.

## Outputs

- `public/og.jpg`: usually 1200×630, readable game title and recognizably real art.
- `public/favicon.svg`: simplified scalable icon legible at 16px and 32px.
- `public/social-banner.jpg`: optional ratio-specific export only when required.
- Optional installable icons and web manifest when a PWA is actually implemented.
- Rendered HTML: `og:title`, `og:description`, `og:image`, `og:url`, `og:type=website`, and an appropriate page title.

## Procedure

1. Inspect the game's title, approved art, scene and existing design tokens.
2. Compose and inspect a real preview card; avoid stock placeholders.
3. Verify cropping, contrast, visual quality and small-thumbnail readability.
4. Keep source and derivative assets separate. Stage generated outputs atomically.
5. Supply absolute public image URLs and validate deployed HTML and image responses.
6. Rebuild/redeploy assets when the identity or design changes.

References: `references/brand-pass.md`, `references/custom-card.md`,
`references/open-graph-contract.md`, `references/social-banner.md`,
`references/favicon-and-icons.md`, and `references/placeholder-card.md`.

If the host provides the optional checker, run `node scripts/brand-check.mjs --game`.
Otherwise use the host's equivalent. Never assume an injector, image generator,
background task runner, or special social-card metadata exists.
