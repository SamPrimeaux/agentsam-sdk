import { createAgentControlHttpHandler } from "../../../../src/acp/http.js";
import { createD1QueueControl } from "../../../../src/acp/dependencies.js";
import { DatabaseAgentControlClient } from "../../../../src/acp/database-client.js";
import { emitAnalyticsFact } from "./analytics-service.js";

const ROUTE_PREFIX = "/api/agent-control";

function json(body, status) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Host ACP against the authenticated account's canonical D1 rows.
 * Local SQLite remains an explicit development/test adapter, never the
 * production default for this route.
 */
export async function handleAgentControlRequest(request, env, accountId) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return json({ ok: false, error: "agent_control_database_unavailable" }, 503);
  }
  if (typeof accountId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    return json({ ok: false, error: "authenticated_account_required" }, 401);
  }

  const queueControl = createD1QueueControl(env.DB, {
    environment: env.AGENTSAM_ENVIRONMENT || "production",
    leaseOwner: "agentsam-control-plane",
  });
  const control = new DatabaseAgentControlClient({
    database: env.DB,
    kind: "cloudflare-d1",
    accountId,
    queueControl,
    requireAccount: true,
    onTimeout: async ({ run, event, errorCode, createdAt }) => {
      const startedAt = Number(run.started_at_unix ?? run.created_at_unix ?? createdAt);
      const durationMs = run.started_at_unix == null
        ? null
        : Math.max(0, Math.trunc((createdAt - startedAt) * 1000));

      return emitAnalyticsFact(env, accountId, {
        event_kind: "runtime",
        domain: "agent_run",
        operation: "timeout",
        outcome: "timed_out",
        run_id: run.id,
        source_client: run.source_client || "agentsam-acp",
        source_table: "agentsam_agent_run_event",
        source_id: event?.event_id || null,
        model_key: run.model_key || null,
        duration_ms: durationMs,
        error_code: errorCode,
        failure_origin: "runtime",
        dedup_key: `run:${run.id}:timed_out`,
        created_at_unix: createdAt,
        dimensions: {
          mode: run.mode || null,
          surface: run.surface || null,
          public_status: "timed_out",
          storage_status: "failed",
        },
        metrics: {
          event_seq: event?.seq ?? null,
        },
      });
    },
  });

  const handler = createAgentControlHttpHandler({
    control,
    service: "agentsam-control-plane",
  });
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ROUTE_PREFIX)) {
    return json({ ok: false, error: "route_not_found" }, 404);
  }
  url.pathname = url.pathname.slice(ROUTE_PREFIX.length) || "/";
  return handler(new Request(url, request));
}
