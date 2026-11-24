#!/usr/bin/env node
/**
 * Build the host navigation projection from the included app manifests.
 * Account installations and user overrides are applied by the Worker; this
 * build step only publishes trusted screen declarations and host-owned routes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listAppManifests } from "../../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs";

const LOCAL_STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(LOCAL_STUDIO, "../..");
const DEFAULT_MANIFEST = path.join(ROOT, "packages/agentsam-desktop-shell/manifests/local-studio.json");

function projectScreen(app, screen) {
  const navigation = screen.navigation || {};
  return {
    id: String(navigation.key || screen.id),
    app_id: String(screen.app_id || app.id),
    screen_id: String(screen.id),
    label: String(navigation.label || screen.label || app.name || screen.id),
    href: String(screen.route),
    icon: String(navigation.icon || "app-window"),
    host_core: screen.host_core === true,
    installation_required: screen.installation_required !== false,
    aliases: Array.isArray(navigation.aliases) ? navigation.aliases : [],
    screen: {
      route: screen.route,
      module: screen.module || null,
      export: screen.export || null,
      mount: screen.mount || { type: "document", path: screen.route },
      capabilities: Array.isArray(screen.capabilities) ? screen.capabilities : [],
    },
  };
}

function byNavigationOrder(left, right) {
  const a = Number(left.screen?.navigation?.order ?? 1000);
  const b = Number(right.screen?.navigation?.order ?? 1000);
  return a - b || String(left.projected.label).localeCompare(String(right.projected.label));
}

function buildManifestNavigation(apps) {
  const appScreens = [];
  const channelScreens = [];
  const utilityScreens = [];
  for (const app of apps) {
    for (const screen of Array.isArray(app.manifest.screens) ? app.manifest.screens : []) {
      const surface = screen.navigation?.surface;
      const projected = projectScreen(app, screen);
      if (surface === "admin-nav") appScreens.push(projected);
      if (surface === "channels") channelScreens.push({ app, screen, projected });
      if (surface === "utilities") utilityScreens.push(projected);
    }
  }

  const channels = [];
  const channelByKey = new Map();
  for (const entry of channelScreens.filter(item => item.screen.navigation?.root === true).sort(byNavigationOrder)) {
    const key = String(entry.screen.navigation.key || entry.screen.id);
    const root = { ...entry.projected, id: key, children: [] };
    channels.push(root);
    channelByKey.set(key, root);
  }
  for (const entry of channelScreens.filter(item => item.screen.navigation?.parent).sort(byNavigationOrder)) {
    const parent = String(entry.screen.navigation.parent);
    const root = channelByKey.get(parent);
    if (root) root.children.push(entry.projected);
  }

  return { apps: appScreens, channels, utilities: utilityScreens };
}

/** Rebuildable navigation projection; included_apps and app manifests stay authoritative. */
export function studioNavigationProjection({ repoRoot = ROOT, manifestPath = path.join(repoRoot, "packages/agentsam-desktop-shell/manifests/local-studio.json") } = {}) {
  const host = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const ids = [...new Set([host.app_id || "local-studio", ...(host.included_apps || [])])];
  const discovered = new Map(listAppManifests(repoRoot).map(app => [app.id, app]));
  const included = ids.map(id => {
    const app = discovered.get(id);
    if (!app) throw new Error("Included application has no manifest: " + id);
    return app;
  });
  const appManifests = included.map(app => ({
    id: app.id,
    name: app.name,
    version: app.manifest.version || null,
    routes: { mounts: app.manifest.routes?.mounts || [] },
    screens: app.manifest.screens || [],
  }));
  const projected = buildManifestNavigation(included);

  return {
    schema: "agentsam.host-navigation.v1",
    generated_at: new Date().toISOString(),
    hostAppId: host.app_id || "local-studio",
    source: "included_apps_and_screen_manifests",
    primary: [
      { id: "home", label: "Home", href: "/admin/home", icon: "home" },
      { id: "library", label: "Library", href: "/media", icon: "library", children: [
        { id: "images", label: "Images", href: "/media/images" },
        { id: "videos", label: "Videos", href: "/media/videos" },
        { id: "models", label: "Models", href: "/media/models" },
        { id: "files", label: "All files", href: "/media/files" },
      ] },
      { id: "analytics", label: "Analytics", href: "/admin/analytics/overview", icon: "chart-no-axes-combined", children: [
        { id: "finance", label: "Finance", href: "/admin/analytics/finance" },
        { id: "health", label: "Health", href: "/admin/analytics/health" },
      ] },
    ],
    work: [
      { id: "projects", label: "Projects", href: "/admin/projects", icon: "folder-kanban" },
      { id: "tickets", label: "Tickets", href: "/admin/tickets", icon: "ticket" },
    ],
    channels: projected.channels,
    apps: projected.apps,
    utilities: projected.utilities,
    appManifests,
  };
}

export function buildStudioNavigation(root = ROOT) {
  return studioNavigationProjection({ repoRoot: root });
}

export function writeStudioNavigation(options = {}) {
  const projection = studioNavigationProjection(options);
  const localStudio = options.localStudio || (options.repoRoot ? path.join(options.repoRoot, "apps/local-studio") : LOCAL_STUDIO);
  const target = path.join(localStudio, "frontend/public/admin/data/navigation.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(projection, null, 2) + "\n");
  return projection;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = writeStudioNavigation();
  console.log("Projected " + result.apps.length + " app screens and " + result.channels.length + " channels from " + result.source);
}
