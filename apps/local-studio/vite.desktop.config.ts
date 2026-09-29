import { resolve } from "node:path";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import baseExport from "./vite.config.ts";

function desktopApiRouteStubs(): Plugin {
  const prefix = "\0agentsam-desktop-api-route:";

  return {
    name: "agentsam-desktop-api-route-stubs",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        importer?.endsWith("/frontend/src/routeTree.gen.ts") &&
        source.startsWith("./routes/api/")
      ) {
        return prefix + source.slice("./routes/".length);
      }
      return null;
    },
    load(id) {
      if (!id.startsWith(prefix)) return null;
      const routeKey = id.slice(prefix.length).replaceAll("\\\\", "/");
      const safeRouteKey = routeKey.replace(/[^A-Za-z0-9/_-]/g, "_");
      return [
        'import { createFileRoute } from "@tanstack/react-router";',
        'export const Route = createFileRoute("/__desktop_api_stub__/' + safeRouteKey + '")({});',
      ].join("\n");
    },
  };
}

function forbidDesktopNodeBuiltins(): Plugin {
  return {
    name: "agentsam-desktop-forbid-node-builtins",
    enforce: "pre",
    resolveId(source, importer) {
      if (source.startsWith("node:")) {
        this.error(
          "Desktop SPA imported Node builtin " + source + " from " + (importer || "unknown importer") + ". " +
            "Move server/runtime work behind a Tauri command or Worker API instead of bundling it into the WebView.",
        );
      }
      return null;
    },
  };
}

const studioRoot = resolve(import.meta.dirname);
const baseFactory = baseExport as unknown as (env: Record<string, unknown>) => UserConfig;
const shared = baseFactory({ command: "build", mode: "production", isPreview: false });

export default defineConfig({
  root: resolve(studioRoot, "frontend/desktop"),
  base: "./",
  publicDir: resolve(studioRoot, "frontend/public"),
  resolve: shared.resolve,
  plugins: [desktopApiRouteStubs(), forbidDesktopNodeBuiltins(), tailwindcss(), viteReact()],
  build: {
    ...(shared.build || {}),
    outDir: resolve(studioRoot, "desktop-dist"),
    emptyOutDir: true,
  },
});
