import { createStorefrontShellTheme } from "./theme.js";

/**
 * Durable agentsam_products payload for the stock heuristic theme.
 * Caller resolves repository_id against live code_repositories before UPSERT.
 */
export function createHeuristicThemeProductRow({ accountId, repositoryId = null } = {}) {
  const theme = createStorefrontShellTheme();
  return {
    account_id: accountId || null,
    slug: theme.slug,
    name: theme.displayName,
    kind: "theme",
    status: "wired",
    repository_id: repositoryId,
    canonical_path: "packages/heuristic-theme",
    package_name: "@inneranimalmedia/heuristic-theme",
    metadata: {
      origin: "gallery_mount",
      normalization_state: "wired",
      package: "@inneranimalmedia/heuristic-theme",
      preview_kind: "live",
      capabilities: ["theme.storefront.shell"],
      app_manifest: null,
      help_root: "docs/",
    },
    capability: "theme.storefront.shell",
    relationships: [
      {
        relationship_type: "packaged_as",
        target_type: "sdk-package",
        target_slug: "heuristic-theme",
      },
    ],
  };
}
