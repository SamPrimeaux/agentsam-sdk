# Portable Open Graph contract

Use standard page metadata: `og:type=website`, `og:title`, `og:description`,
`og:url` (canonical page URL), and `og:image` (absolute public image URL).
Render and verify the tags in deployed HTML and ensure the image loads
without cookies, authentication, or signed private asset URLs.

Do not invent network-specific game-card types or couple game identity
to a social provider. Specialized distribution metadata, if ever required,
belongs in a separately reviewed adapter, not the portable game cookbook.
