import { getRoboticsPerceptionCapabilities, runRoboticsPerception } from '../src/robotics/perception.ts';
import appManifest from '../../agentsam.app.json';

/**
 * Canonical Cloudflare Worker boundary for CAD Creator.
 *
 * The current application backend is not yet Worker-native. This checked-in
 * shell reserves the runtime boundary without silently pretending the Node or
 * library backend has been ported. Wire application routes here as that work lands.
 *
 * Worker deployment name (wrangler) may differ from APP.id — never conflate them.
 */
const APP = Object.freeze(appManifest);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return json({ ok: true, app: APP.id, runtime: "cloudflare-worker-scaffold" });
    }
    if (request.method === "GET" && url.pathname === "/api/robotics/capabilities") {
      return json(getRoboticsPerceptionCapabilities(env));
    }
    if (request.method === "POST" && url.pathname === "/api/robotics/perception/detect") {
      try {
        const body = await request.json();
        return json(await runRoboticsPerception(body, env));
      } catch (error) {
        const status = Number(error?.statusCode) || 500;
        return json({
          error: {
            code: error?.code || "robotics_perception_failed",
            message: error?.message || "Robotics perception failed",
          },
        }, status);
      }
    }
    return json({
      ok: false,
      error: "worker_routes_not_wired",
      app: APP.id,
      note: "Canonical Worker boundary exists; application routes are not ported yet.",
    }, 501);
  },
};
