# Portable Theme Studio

Theme Studio is the existing ecommerce CMS editor. The imperative UI remains in
`frontend/static/js/theme-editor.js`; Local Studio mounts that same runtime.
There is no desktop editor implementation.

The package exports `theme-editor/mount`, `theme-editor/bridge`,
`theme-editor/project`, and `theme-editor/cms-adapter`.

`mountThemeEditor(iframe, host, { assetsBase })` loads `shared.js` followed by
`runtime.js`. The consumer stages these files and `editor.css` from the package's
`frontend/static` directory. Mount only trusted editor chrome in this iframe.
Customer HTML belongs in the nested preview iframe with `sandbox="allow-scripts"`.

The host provides `page`, `adapter`, optional `pageRoutes`, and optional
`onPageSettings(slug)`. Chrome consumes `--color-background`, `--color-card`,
`--color-border`, `--color-foreground`, `--color-muted`, `--color-muted-foreground`,
`--color-accent`, `--color-accent-foreground`, and `--font-sans`.
Selected theme tokens are applied only in the customer preview.

`createThemeEditorBridge(adapter)` translates the original editor requests into:

- `listPages`, `getPage`, `getRegistry`, `resolvePreview`
- `saveDraft`, `publish`
- `addSection`, `duplicateSection`, `removeSection`, `moveSection`, `setSectionVisibility`
- `addBlock`, `duplicateBlock`, `removeBlock`, `moveBlock`
- `listMedia`, `uploadMedia`

Missing operations raise `ThemeEditorCapabilityError`. Set
`capabilities.publish = false` when publishing is unavailable. The editor does
not fabricate a publication or select a deployment account.

`extractThemePage` creates editable bindings from real HTML while retaining its
markup, styles, scripts and asset base. Articles, list items, cards and explicitly
marked blocks become editable blocks. Section fields cover text, media, links
and layout. `renderThemePage` renders the saved bindings into that same template.

`createThemeProjectAdapter(project, store, { publish })` uses an injected store
with `get(id)` and `save(project)`. Local Studio supplies IndexedDB. Another
consumer may supply HTTP, SQLite or a filesystem store. Section draft saves
check the supplied version; the store must supply atomic compare-and-write for
cross-process concurrency. Structural operations currently assume one author.

The import/export format is `agentsam.theme-project.v1` JSON. It contains theme
identity, design tokens, page templates, section/block schemas and content,
optional media, and source-package metadata. Importing creates a new draft ID.

Local Studio links this existing workspace package while the new exports are
unreleased. A coordinated package release must replace that workspace link with
the published version; a clean standalone npm installation is not yet a release
acceptance result.
