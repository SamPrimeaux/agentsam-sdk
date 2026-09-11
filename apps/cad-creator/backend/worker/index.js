/**
 * Canonical Cloudflare Worker boundary for CAD Creator.
 *
 * The current application backend is not yet Worker-native. This checked-in
 * shell reserves the runtime boundary without silently pretending the Node or
 * library backend has been ported. Wire application routes here as that work lands.
 */
const APP = "agentsam-cad-creator";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return json({ ok: true, app: APP, runtime: "cloudflare-worker-scaffold" });
    }
    return json({
      ok: false,
      error: "worker_routes_not_wired",
      app: APP,
      note: "Canonical Worker boundary exists; application routes are not ported yet.",
    }, 501);
  },
};
