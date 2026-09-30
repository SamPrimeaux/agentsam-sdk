import { createFileRoute } from "@tanstack/react-router";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dev/local-only SQLite bridge.
 * Hosted Cloudflare Workers MUST hard-fail — comments alone are insufficient.
 * Tauri desktop uses invoke(`local_sqlite_bridge`) instead.
 */
function isHostedWorkerRuntime(): boolean {
  // Cloudflare Workers expose WebSocketPair; nodejs_compat may still present process.
  try {
    if (typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair === "function") {
      return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof process !== "undefined") {
    const env = process.env || {};
    if (env.AGENTSAM_HOSTED_WORKER === "1" || env.CF_WORKER === "1") return true;
  }
  return false;
}

export const Route = createFileRoute("/api/database/local/bridge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (isHostedWorkerRuntime()) {
          return Response.json(
            {
              ok: false,
              error: "requires_local_runtime",
              message:
                "Local SQLite cannot run inside the hosted Worker. Open AgentSam Local Studio or attach a local runtime.",
            },
            { status: 501 },
          );
        }

        const body = await request.json().catch(() => ({}));
        const repoRoot = path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../../../",
        );
        const script = path.join(
          repoRoot,
          "packages/agentsam-database-editor/scripts/local-sqlite-bridge.mjs",
        );
        const payload = JSON.stringify({
          ...body,
          cwd: body.cwd || repoRoot,
        });

        const result = await new Promise<{ ok: boolean; raw: string; status: number }>((resolve) => {
          const child = spawn("node", [script], {
            cwd: repoRoot,
            stdio: ["pipe", "pipe", "pipe"],
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (chunk) => {
            stdout += String(chunk);
          });
          child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
          });
          child.on("close", (code) => {
            const raw = stdout.trim() || stderr.trim();
            resolve({
              ok: code === 0,
              raw,
              status: code === 0 ? 200 : 400,
            });
          });
          child.stdin.write(payload);
          child.stdin.end();
        });

        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(result.raw || "{}");
        } catch {
          json = { ok: false, error: result.raw || "local_bridge_parse_failed" };
        }
        return Response.json(json, { status: result.ok || json.ok ? 200 : result.status });
      },
    },
  },
});
