# Host permission registry contract

The Cloudflare connector does not own provider permission-pack configuration and does not read host database tables.

When mounting handleCloudflareConnectionRequest, the host supplies an options object with a permissionRegistry adapter. The adapter exposes:

    {
      async getOAuthPermissionCatalog(providerKey) {
        return {
          providerKey,
          baselineScopes: [],
          defaultPacks: [],
          aliases: {},
          packs: [
            { id: "read", label: "Read", description: "Read provider resources", scopes: ["resource.read"] }
          ],
          capabilities: [
            { id: "provider.resource", label: "Resource", scopes: ["resource.read"] }
          ],
          availablePermissions: [
            { scope: "resource.read", label: "Read resource", category: "resources" }
          ]
        };
      }
    }

The normalized catalog fields are:

- baselineScopes: identity and refresh scopes required for this provider connection.
- defaultPacks: packs requested when the user starts a connection without explicit pack or capability IDs.
- defaultCapabilities: capability IDs requested by default when no explicit pack or capability selection is supplied.
- allowFullCatalogOptIn: an explicit opt-in switch for the special all pack; disabled unless the host enables it.
- aliases: optional compatibility aliases, each expanding to one or more canonical pack IDs.
- packs: provider-specific permission profiles; each profile owns its scopes and associated capability IDs.
- capabilities: optional fine-grained capability-to-scope mappings.
- availablePermissions: optional picker metadata. If omitted, the connector derives the inventory from baseline, pack and capability scopes.

The connector validates every requested pack and capability against the injected catalog and fails closed when the adapter is absent or the selection is unknown. Offerable permissions are never represented as granted permissions; actual grants come from the selected account token.

The host adapter may use D1, Postgres, a remote registry, a static config file, or another source. That storage choice is intentionally outside this package.

