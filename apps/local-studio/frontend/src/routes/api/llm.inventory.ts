import { createFileRoute } from "@tanstack/react-router";
import {
  buildStudioInventory,
  platformCredentials,
} from "@inneranimalmedia/agentsam-local-shared/studio-inventory";
import {
  assertInventoryResponseSafe,
  mergeStudioCredentials,
  resolveStudioAccountId,
  studioServerBindings,
  vaultCredentialsForAccount,
} from "@inneranimalmedia/agentsam-local-shared/studio-vault";

export const Route = createFileRoute("/api/llm/inventory")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const request = (ctx as { request: Request }).request;
        const accountId = resolveStudioAccountId(request);
        if (!accountId) {
          return Response.json(
            { ok: false, error: "unauthorized", detail: "account session required for Studio inventory" },
            { status: 401 },
          );
        }

        try {
          const bindings = studioServerBindings(ctx);
          const vault = await vaultCredentialsForAccount(bindings, accountId);
          const inventory = await buildStudioInventory(
            mergeStudioCredentials(vault, platformCredentials(bindings.env)),
          );
          const payload = { ok: true, account_id: accountId, ...inventory };
          try {
            assertInventoryResponseSafe(payload);
          } catch {
            return Response.json(
              { ok: false, error: "inventory_sanitizer_rejected_secret_field" },
              { status: 500 },
            );
          }
          return Response.json(payload);
        } catch (err) {
          return Response.json(
            { ok: false, error: "inventory_failed", detail: String(err).slice(0, 200) },
            { status: 500 },
          );
        }
      },
    },
  },
});
