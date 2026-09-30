import { createFileRoute } from "@tanstack/react-router";
import { buildStudioInventory } from "@inneranimalmedia/agentsam-local-shared/studio-inventory";
import {
  assertInventoryResponseSafe,
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
          // User-facing inventory is scoped to this account's own vault.
          // Platform/Worker secrets must never silently widen another user's model list.
          const inventory = await buildStudioInventory(vault);
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
