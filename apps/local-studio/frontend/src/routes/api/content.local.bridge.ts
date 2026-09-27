import { createFileRoute } from "@tanstack/react-router";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dev/local-only content FS bridge. Cloudflare Worker never serves this —
 * Tauri desktop uses invoke(`local_content_bridge`) instead.
 */
export const Route = createFileRoute("/api/content/local/bridge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const repoRoot = path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../../../",
        );
        const script = path.join(
          repoRoot,
          "packages/agentsam-content/scripts/local-content-bridge.mjs",
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
          json = { ok: false, error: result.raw || "local_content_bridge_parse_failed" };
        }
        return Response.json(json, { status: result.ok || json.ok ? 200 : result.status });
      },
    },
  },
});
