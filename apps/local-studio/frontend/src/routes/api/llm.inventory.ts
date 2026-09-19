import { createFileRoute } from "@tanstack/react-router";
import {
  buildStudioInventory,
  platformCredentials,
} from "@inneranimalmedia/agentsam-local-shared/studio-inventory";
import {
  assertInventoryResponseSafe,
  mergeStudioCredentials,
  resolveStudioUserId,
  studioServerBindings,
  vaultCredentialsForUser,
} from "@inneranimalmedia/agentsam-local-shared/studio-vault";

export const Route = createFileRoute("/api/llm/inventory")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const request = (ctx as { request: Request }).request;
        // Session -> user_id: in production the Worker edge validates the
        // session cookie and binds it to X-User-Id before Nitro runs; in local
        // dev this carries the Studio client's user id. Either way the value
        // only scopes server-side vault lookups — it is echoed back as an id,
        // never alongside secret material.
        const userId = resolveStudioUserId(request);
        if (!userId) {
          return Response.json(
            { ok: false, error: "unauthorized", detail: "X-User-Id required for Studio inventory" },
            { status: 401 },
          );
        }

        try {
          const bindings = studioServerBindings(ctx);
          // Vault BYOK first (D1 user_secrets, unwrapped server-side), desk /
          // platform Worker secret as fallback. Missing bindings in local dev
          // simply yield an empty vault map — same behavior as before.
          const vault = await vaultCredentialsForUser(bindings, userId);
          const inventory = await buildStudioInventory(
            mergeStudioCredentials(vault, platformCredentials(bindings.env)),
          );
          const payload = { ok: true, user_id: userId, ...inventory };
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
