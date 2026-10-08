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
