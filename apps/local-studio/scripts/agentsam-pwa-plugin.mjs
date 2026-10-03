/**
 * Dev/preview (Vite) half of the PWA chrome: serves the ?install=1 tutorial
 * and the app manifest, and injects missing PWA head tags into app documents.
 * The deployed-app half lives in backend/server/middleware/agentsam-pwa.ts;
 * both share scripts/agentsam-pwa-shared.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PWA_MANIFEST_PATH,
  acceptsHtml,
  createHeadInjector,
  injectPwaHead,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
  snapshotPwaIdentity,
} from "./agentsam-pwa-shared.mjs";

export const PWA_IDENTITY_ID = "virtual:agentsam-pwa-identity";

const INSTALL_PAGE_PATH = join(dirname(fileURLToPath(import.meta.url)), "install-page.html");

export function renderInstallPage(identity, url = "/") {
  const template = readFileSync(INSTALL_PAGE_PATH, "utf8");
  return renderInstallPageHtml(template, { identity, url });
}

function sendHtml(res, html) {
  const body = Buffer.from(html, "utf8");
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("content-length", String(body.byteLength));
  res.end(body);
}

function servePwa(middlewares, identity) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url ?? "";
    const pathOnly = rawUrl.split("?", 1)[0] ?? "";
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      next();
      return;
    }

    if (pathOnly === PWA_MANIFEST_PATH || pathOnly === PWA_MANIFEST_PATH.replace(/\.webmanifest$/, ".json")) {
      const body = Buffer.from(renderWebManifest(identity), "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/manifest+json; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("content-length", String(body.byteLength));
      res.end(body);
      return;
    }

    if (isInstallQuery(rawUrl) && isDocumentPath(pathOnly) && acceptsHtml(req.headers.accept)) {
      try {
        sendHtml(res, renderInstallPage(identity, rawUrl));
      } catch (err) {
        console.error("[agentsam] install page missing:", err);
        res.statusCode = 500;
        res.end("install page unavailable");
      }
      return;
    }

    next();
  });
}

/**
 * Wrap res.write/res.end on app-document requests to inject missing PWA head
 * tags at the `</head>` boundary as chunks stream through (no full-document
 * buffering, so streaming SSR keeps its early flush). Skips anything already
 * content-encoded: under `vite preview` the compression middleware can hand
 * this wrapper gzipped bytes, which must pass through untouched.
 */
function wrapHtmlResponses(middlewares, identity) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url ?? "";
    const pathOnly = rawUrl.split("?", 1)[0] ?? "";
    const method = (req.method ?? "GET").toUpperCase();
    const looksLikeDocument =
      method === "GET" &&
      String(req.headers.accept ?? "").includes("text/html") &&
      !isInstallQuery(rawUrl) &&
      isDocumentPath(pathOnly);
    if (!looksLikeDocument) {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const injector = createHeadInjector(identity);
    let mode = null; // null = undecided, "inject" | "passthrough"

    const decideMode = () => {
      if (mode) return mode;
      const isHtml = String(res.getHeader("content-type") ?? "").includes("text/html");
      const encoded = Boolean(res.getHeader("content-encoding"));
      mode = isHtml && !encoded ? "inject" : "passthrough";
      // Streaming SSR flushes headers before the first body chunk, so the
      // header may no longer be removable — chunked responses don't carry one.
      if (mode === "inject" && !res.headersSent) res.removeHeader("content-length");
      return mode;
    };

    const toBuffer = (chunk, encoding) => {
      if (Buffer.isBuffer(chunk)) return chunk;
      if (typeof chunk === "string") {
        return Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
      }
      return Buffer.from(chunk);
    };

    res.write = (chunk, encoding, cb) => {
      if (decideMode() === "passthrough") return originalWrite(chunk, encoding, cb);
      const done = typeof encoding === "function" ? encoding : cb;
      if (chunk) {
        for (const out of injector.push(toBuffer(chunk, encoding))) originalWrite(out);
      }
      if (typeof done === "function") done();
      return true;
    };

    res.end = (chunk, encoding, cb) => {
      const done = typeof encoding === "function" ? encoding : cb;
      if (decideMode() === "passthrough") return originalEnd(chunk, encoding, cb);
      if (chunk) {
        for (const out of injector.push(toBuffer(chunk, encoding))) originalWrite(out);
      }
      for (const out of injector.flush()) originalWrite(out);
      return originalEnd(undefined, undefined, done);
    };

    next();
  });
}

export function agentsamPwaPlugin() {
  let root = process.cwd();
  let identity = snapshotPwaIdentity(root);
  return {
    name: "agentsam:pwa",
    configResolved(config) {
      root = config.root;
      identity = snapshotPwaIdentity(root);
    },
    resolveId(id) {
      if (id === PWA_IDENTITY_ID) return `\0${PWA_IDENTITY_ID}`;
    },
    load(id) {
      if (id !== `\0${PWA_IDENTITY_ID}`) return;
      return `export const pwaIdentity = ${JSON.stringify(identity)};`;
    },
    transformIndexHtml(html) {
      return injectPwaHead(html, identity);
    },
    generateBundle() {
      // The deployed Worker serves static assets only (no Nitro middleware),
      // so ship the manifest as a real file in the client build.
      const env = this.environment?.name;
      if (env && env !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: PWA_MANIFEST_PATH.slice(1),
        source: renderWebManifest(identity),
      });
    },
    configureServer(server) {
      // Registered directly (not in a returned post-hook) so both run BEFORE
      // TanStack Start's SSR middleware, like the auth-popup plugin.
      servePwa(server.middlewares, identity);
      wrapHtmlResponses(server.middlewares, identity);
    },
    configurePreviewServer(server) {
      servePwa(server.middlewares, identity);
      // Post-hook: preview registers compression between the direct hooks and
      // the post-hooks, and the injector must wrap AFTER compression so it
      // sees plaintext HTML (compression then compresses the injected output).
      return () => {
        wrapHtmlResponses(server.middlewares, identity);
      };
    },
  };
}
