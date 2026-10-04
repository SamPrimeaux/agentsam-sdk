import { existsSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { agentsamPwaPlugin } from "./scripts/agentsam-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { themeSurfacesPlugin } from "./scripts/theme-surfaces-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

// The CMS frontend is linked from a sibling application. With
// `preserveSymlinks`, imports inside that linked source resolve from its real
// path, not Local Studio's node_modules. Keep its public Workbench dependency
// on the package boundary while giving source builds one deterministic target.
const loadingScenePackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-loading-scene", import.meta.url)),
);
const workPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-work", import.meta.url)),
);
const workbenchSource = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-workbench/src", import.meta.url)),
);
const navSource = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-nav/src", import.meta.url)),
);
const settingsSource = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-settings/src", import.meta.url)),
);
const analyticsPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-analytics", import.meta.url)),
);
const vaultPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-vault", import.meta.url)),
);
const iconRegistrySource = resolvePath(
  fileURLToPath(new URL("../../protocol/ui/icon-registry.mjs", import.meta.url)),
);
const databaseEditorRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-database-editor", import.meta.url)),
);
const databaseEditorManifest = resolvePath(databaseEditorRoot, "src/manifest.js");
const databaseEditorUi = resolvePath(databaseEditorRoot, "src/ui/index.ts");
const databaseEditorFrontend = resolvePath(databaseEditorRoot, "frontend/index.ts");
const contentPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-content", import.meta.url)),
);
const contentStudioPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-content-studio", import.meta.url)),
);
const scoringPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-scoring", import.meta.url)),
);
const assetsCorePackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-assets-core", import.meta.url)),
);
const cfImagesPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-cloudflare-images", import.meta.url)),
);
const keyManagerPackageRoot = resolvePath(
  fileURLToPath(new URL("../../packages/agentsam-key-manager", import.meta.url)),
);
const studioRoot = resolvePath(fileURLToPath(new URL(".", import.meta.url)));
const frontendNodeModules = resolvePath(studioRoot, "frontend", "node_modules");
const repoNodeModules = resolvePath(studioRoot, "..", "..", "node_modules");

const studioNm = (...segments: string[]) => {
  const frontend = resolvePath(frontendNodeModules, ...segments);
  if (existsSync(frontend)) return frontend;

  const local = resolvePath(studioRoot, "node_modules", ...segments);
  if (existsSync(local)) return local;

  return resolvePath(repoNodeModules, ...segments);
};

/**
 * When Vite aliases packages to /src, Rolldown resolves bare imports from that
 * package directory. Prefer a package-local install when present, but fall back
 * to the monorepo's hoisted node_modules for clean workspace builds.
 */
const navRuntimeAliases = [
  {
    find: "@radix-ui/react-dropdown-menu",
    replacement: studioNm("@radix-ui", "react-dropdown-menu"),
  },
  {
    find: "@radix-ui/react-dialog",
    replacement: studioNm("@radix-ui", "react-dialog"),
  },
  {
    find: "lucide-react",
    replacement: studioNm("lucide-react"),
  },
  {
    find: "recharts",
    replacement: studioNm("recharts"),
  },
];
const cmsProductSource = resolvePath(
  fileURLToPath(new URL("../ecommerce-cms-agentsam/frontend/cms", import.meta.url)),
);
const clientCmsEditorSource = resolvePath(
  fileURLToPath(new URL("../client-cms-editor/frontend/src", import.meta.url)),
);
const cmsFrontendSource = clientCmsEditorSource;
const cmsBackendSource = resolvePath(
  fileURLToPath(new URL("../client-cms-editor/backend/src", import.meta.url)),
);
const cmsSharedSource = resolvePath(
  fileURLToPath(new URL("../client-cms-editor/shared/cms/src", import.meta.url)),
);

/** The files `frontend/src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "backend/migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/frontend/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

/**
 * Live-preview OAuth popup — handled HERE so the agent never has to create a
 * `/auth/popup` route (and cannot break it by scaffolding a React page that
 * paints the full app shell in the popup).
 *
 * `signIn` (client.ts) opens `/auth/popup?providerId=…` in a top-level window.
 * This middleware runs before TanStack Start, calls `handleAuthPopupRequest`,
 * and returns the 302 / completion HTML. Deployed apps do not use the popup
 * (full-page OAuth redirect), so `apply: "serve"` is enough.
 */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      // Register immediately (not in a returned post-hook) so we run BEFORE
      // TanStack Start / the SPA HTML fallback. A model-authored
      // `frontend/src/routes/auth/popup.tsx` React page must never win this path.
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          if (pathOnly !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const host = String(
            req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080",
          );
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          // Ensure Host is the public preview host so Better Auth's dynamic
          // baseURL / redirect_uri match the popup origin.
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);

          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: "GET",
            headers: requestHeaders,
          });

          const mod = (await server.ssrLoadModule("/frontend/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          // Preserve multiple Set-Cookie headers (OAuth state + session).
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `frontend/src/router.tsx` and `frontend/src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  publicDir: "frontend/public",
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    // The live preview is served through a proxied *.e2b.app host, which Vite's
    // DNS-rebinding guard rejects by default. Allow that proxy family
    // explicitly — not `true`, which would admit arbitrary Host headers.
    allowedHosts: [".e2b.app"],
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    tsconfigPaths: true,
    preserveSymlinks: true,
    alias: [
      ...navRuntimeAliases,
      {
        find: "@agentsam/icon-registry",
        replacement: iconRegistrySource,
      },
      {
        find: /^@inneranimalmedia\/agentsam-database-editor\/manifest$/,
        replacement: databaseEditorManifest,
      },
      {
        find: /^@inneranimalmedia\/agentsam-database-editor\/frontend$/,
        replacement: databaseEditorFrontend,
      },
      {
        find: /^@inneranimalmedia\/agentsam-database-editor\/ui$/,
        replacement: databaseEditorUi,
      },
      {
        find: /^@inneranimalmedia\/agentsam-content$/,
        replacement: resolvePath(contentPackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-content-studio$/,
        replacement: resolvePath(contentStudioPackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-scoring$/,
        replacement: resolvePath(scoringPackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-assets-core$/,
        replacement: resolvePath(assetsCorePackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cloudflare-images$/,
        replacement: resolvePath(cfImagesPackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-loading-scene$/,
        replacement: resolvePath(loadingScenePackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-loading-scene\/react$/,
        replacement: resolvePath(loadingScenePackageRoot, "src/react/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-work$/,
        replacement: resolvePath(workPackageRoot, "src/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-work\/client$/,
        replacement: resolvePath(workPackageRoot, "src/client/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-work\/contracts$/,
        replacement: resolvePath(workPackageRoot, "src/contracts/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-work\/frontend$/,
        replacement: resolvePath(workPackageRoot, "src/frontend/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-work\/fixtures$/,
        replacement: resolvePath(workPackageRoot, "src/fixtures/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-work\/theme\.css$/,
        replacement: resolvePath(workPackageRoot, "src/frontend/theme.css"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-analytics\/frontend$/,
        replacement: resolvePath(analyticsPackageRoot, "src/frontend/index.tsx"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-analytics\/theme\.css$/,
        replacement: resolvePath(analyticsPackageRoot, "src/frontend/theme.css"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-analytics$/,
        replacement: resolvePath(analyticsPackageRoot, "src/index.ts"),
      },
      {
        find: "@inneranimalmedia/agentsam-workbench",
        replacement: workbenchSource,
      },
      {
        find: "@inneranimalmedia/agentsam-nav",
        replacement: navSource,
      },
      {
        find: /^@inneranimalmedia\/agentsam-settings$/,
        replacement: resolvePath(settingsSource, "index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-settings\/contracts$/,
        replacement: resolvePath(settingsSource, "contracts/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-settings\/frontend$/,
        replacement: resolvePath(settingsSource, "frontend/index.tsx"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-settings\/fixtures$/,
        replacement: resolvePath(settingsSource, "fixtures/index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-vault$/,
        replacement: resolvePath(vaultPackageRoot, "src/index.js"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-key-manager$/,
        replacement: resolvePath(keyManagerPackageRoot, "src/index.js"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-key-manager\/KeysPage$/,
        replacement: resolvePath(keyManagerPackageRoot, "src/pages/KeysPage.jsx"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-key-manager\/IntegrationsPage$/,
        replacement: resolvePath(
          keyManagerPackageRoot,
          "src/pages/IntegrationsPage.jsx",
        ),
      },
      {
        find: /^@inneranimalmedia\/agentsam-key-manager\/SensitiveInput$/,
        replacement: resolvePath(
          keyManagerPackageRoot,
          "src/components/SensitiveInput.jsx",
        ),
      },
      {
        find: /^@inneranimalmedia\/ecommerce-cms-agentsam\/cms$/,
        replacement: resolvePath(cmsProductSource, "index.mjs"),
      },
      {
        find: /^@inneranimalmedia\/ecommerce-cms-agentsam\/cms\/capabilities$/,
        replacement: resolvePath(cmsProductSource, "capabilities.mjs"),
      },
      {
        find: /^@inneranimalmedia\/ecommerce-cms-agentsam\/theme-editor\/(.*)$/,
        replacement: resolvePath(studioRoot, "../ecommerce-cms-agentsam/frontend/theme-editor") + "/$1.mjs",
      },
      {
        find: /^@inneranimalmedia\/client-cms-editor$/,
        replacement: resolvePath(clientCmsEditorSource, "index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-frontend$/,
        replacement: resolvePath(cmsFrontendSource, "index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-frontend\/(.*)$/,
        replacement: cmsFrontendSource + "/$1",
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-backend$/,
        replacement: resolvePath(cmsBackendSource, "index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-backend\/api$/,
        replacement: resolvePath(cmsBackendSource, "api/client.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-backend\/model$/,
        replacement: resolvePath(cmsBackendSource, "model.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-backend\/preview$/,
        replacement: resolvePath(cmsBackendSource, "preview/bridge.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-backend\/routing$/,
        replacement: resolvePath(cmsBackendSource, "routing/index.js"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-shared$/,
        replacement: resolvePath(cmsSharedSource, "index.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-shared\/publication$/,
        replacement: resolvePath(cmsSharedSource, "publication.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-shared\/bindings$/,
        replacement: resolvePath(cmsSharedSource, "cloudflare-bindings.ts"),
      },
      {
        find: /^@inneranimalmedia\/agentsam-cms-shared\/context$/,
        replacement: resolvePath(cmsSharedSource, "agent-context.ts"),
      },
    ],
  },
  build: {
    // Local Studio shell + nav + workbench legitimately exceeds the default 500 kB
    // advisory; keep the warning from masking real failures while Rolldown splits vendors.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-radix",
              test: /node_modules[\\/]@radix-ui[\\/]/,
              priority: 20,
            },
            {
              name: "vendor-lucide",
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  ssr: {
    noExternal: [/^@radix-ui\//],
  },
  plugins: [
    themeSurfacesPlugin(),
    pgliteBootstrapPlugin(),
    // Before tanstackStart so /auth/popup never falls through to the SPA.
    authPopupPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    agentsamPwaPlugin(),
    tailwindcss(),
    tanstackStart({ srcDirectory: "frontend/src", router: { routeFileIgnorePattern: '^_app(?:\\.tsx)?$' } }),
    ...(command === "build" || isPreview
      ? [
          nitro({
            // Pin generated Worker name — do not derive samprimeaux-* from path/user.
            // Live deploy still uses backend/wrangler.jsonc name "agentsam-sdk".
            name: "agentsam-sdk-apps-local-studio",
            preset: "cloudflare-module",
            cloudflare: {
              wrangler: {
                name: "agentsam-sdk-apps-local-studio",
              },
            },
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./backend/server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));

