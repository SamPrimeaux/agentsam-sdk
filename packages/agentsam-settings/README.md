# @inneranimalmedia/agentsam-settings

Portable Settings contracts and React UI for AgentSam applications. Hosts supply runtime/account/provider state through `SettingsHost`; the package does not own a parallel settings database.

## Publisher and plugin icons

`SettingsDiscoveredPlugin.iconUrl` is the product's own packaged PNG icon.
`publisherIconUrl` is an optional, catalog-owned SVG publisher mark, validated to the same
HTTPS origin and `/catalog/icons/*.svg` path as the discovered catalog (without query strings).
The UI renders the publisher mark via CSS masks and `currentColor`, so one vector
is readable in light and dark host themes. It does not override the plugin's own icon.
The OAuth broker passes only this validated publisher mark to IAM dynamic OAuth client
registration for AgentSam Studio branding; plugin identity and OAuth client identity
are separate. Never treat untrusted catalog artwork as authorization evidence.

## Exports

- `@inneranimalmedia/agentsam-settings` — public shell and contracts
- `@inneranimalmedia/agentsam-settings/contracts` — host/snapshot contracts
- `@inneranimalmedia/agentsam-settings/frontend` — React settings product UI
- `@inneranimalmedia/agentsam-settings/fixtures` — deterministic fixture hosts for tests/previews


## UI quality release gate

The host and desktop share the same component implementation. Run
`npm run quality:ui` from the SDK root before releasing Settings changes.
This runs changed-source accessibility/style checks, the desktop stylesheet
build and seven-width real-browser checks. The machine-readable v1 quality
receipt contract is in `protocol/ui/agentsam.ui-quality.v1.schema.json` and
its acceptance/limitations are in `docs/product/AGENTSAM-UI-QUALITY-GATE.md`.
A passing Settings receipt does not certify unrelated CMS themes.
