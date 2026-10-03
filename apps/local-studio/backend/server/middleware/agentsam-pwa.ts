/**
 * Deployed-app (Nitro) half of the PWA chrome. Auto-registered as global h3
 * middleware because vite.config.ts sets `serverDir: "./backend/server"`;
 * without that option Nitro never scans this directory.
 *
 * - `?install=1&platform=ios` on a document path serves the Home Screen
 *   tutorial, bundled into the server build via `?raw`.
 * - `/__agentsam/pwa/manifest.webmanifest` serves the app manifest (kept out
 *   of public/ so this dynamic response is the only one).
 * - Other HTML documents get missing PWA head tags stream-injected at
 *   `</head>`. The app identity is baked at `vite build` through
 *   `virtual:agentsam-pwa-identity` because the server bundle has no
 *   workspace filesystem.
 *
 * This must be a middleware transforming `next()`: h3 discards the `response`
 * runtime hook's return value, and `render:html` does not exist in Nitro v3.
 */
import installPageTemplate from "../../../scripts/install-page.html?raw";
import { pwaIdentity } from "virtual:agentsam-pwa-identity";
import {
  PWA_MANIFEST_PATH,
  acceptsHtml,
  createHeadInjector,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
} from "../../../scripts/agentsam-pwa-shared.mjs";

interface PwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function injectHeadStreaming(response: Response): Response {
  const injector = createHeadInjector(pwaIdentity);
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const out of injector.push(chunk)) controller.enqueue(out as Uint8Array);
      },
      flush(controller) {
        for (const out of injector.flush()) controller.enqueue(out);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function agentsamPwaMiddleware(
  event: PwaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET") return next();

  const path = event.url.pathname;
  const urlWithQuery = path + event.url.search;

  if (path === PWA_MANIFEST_PATH || path === PWA_MANIFEST_PATH.replace(/\.webmanifest$/, ".json")) {
    return new Response(renderWebManifest(pwaIdentity), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (
    isInstallQuery(urlWithQuery) &&
    isDocumentPath(path) &&
    acceptsHtml(event.req.headers.get("accept"))
  ) {
    const html = renderInstallPageHtml(installPageTemplate, {
      identity: pwaIdentity,
      url: urlWithQuery,
    });
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (!isDocumentPath(path)) return next();

  const result = await next();
  if (
    result instanceof Response &&
    result.body &&
    String(result.headers.get("content-type") ?? "").includes("text/html") &&
    !result.headers.get("content-encoding")
  ) {
    return injectHeadStreaming(result);
  }
  return result;
}
