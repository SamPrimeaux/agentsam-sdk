import { createFileRoute } from "@tanstack/react-router";
import {
  applyAccountModelVisibilityPreferences,
  setStudioModelVisibilityPreference,
} from "@inneranimalmedia/agentsam-local-shared/studio-model-preferences";
import {
  buildStudioInventory,
  mergeBoundWorkersAIInventory,
} from "@inneranimalmedia/agentsam-local-shared/studio-inventory";
import {
  assertInventoryResponseSafe,
  resolveStudioAccountId,
  studioServerBindings,
  loadModelProviderDefinitions,
  vaultCredentialRecordsForAccount,
} from "@inneranimalmedia/agentsam-local-shared/studio-vault";

const json = (payload: Record<string, unknown>, status = 200) =>
  Response.json(payload, { status, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api/llm/inventory")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const request = (ctx as { request: Request }).request;
        const accountId = resolveStudioAccountId(request);
        if (!accountId) {
          return json({ ok: false, error: "unauthorized", detail: "account session required for Studio inventory" }, 401);
        }

        try {
          const bindings = studioServerBindings(ctx);
          const [vault, providers] = await Promise.all([
            vaultCredentialRecordsForAccount(bindings, accountId),
            loadModelProviderDefinitions(bindings.db),
          ]);
          if (!providers.length) return json({ ok: false, error: "provider_model_discovery_registry_empty" }, 503);

          // Nitro/local and Worker deployments share the same account-scoped inventory projection.
          const discovered = await buildStudioInventory(vault, providers);
          const withHostBinding = mergeBoundWorkersAIInventory(discovered, bindings.workersAI);
          const inventory = await applyAccountModelVisibilityPreferences({ DB: bindings.db }, accountId, withHostBinding);
          const payload = { ok: true, account_id: accountId, ...inventory };
          try {
            assertInventoryResponseSafe(payload);
          } catch {
            return json({ ok: false, error: "inventory_sanitizer_rejected_secret_field" }, 500);
          }
          return json(payload);
        } catch (err) {
          return json({ ok: false, error: "inventory_failed", detail: String(err).slice(0, 200) }, 500);
        }
      },
      PATCH: async (ctx) => {
        const request = (ctx as { request: Request }).request;
        const accountId = resolveStudioAccountId(request);
        if (!accountId) return json({ ok: false, error: "unauthorized" }, 401);
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: "origin_not_allowed" }, 403);
        if (!request.headers.get("content-type")?.startsWith("application/json")) {
          return json({ ok: false, error: "json_content_type_required" }, 415);
        }

        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const credentialId = String(body?.credential_id || "").trim();
        const provider = String(body?.provider || "").trim().toLowerCase();
        const modelId = String(body?.model_id || "").trim();
        const visible = body?.visible;
        if (!credentialId || !provider || !modelId || typeof visible !== "boolean") {
          return json({ ok: false, error: "invalid_model_preference" }, 400);
        }

        try {
          const bindings = studioServerBindings(ctx);
          if (credentialId === "host:cloudflare") {
            const binding = bindings.workersAI as { run?: unknown } | null;
            if (provider !== "cloudflare" || typeof binding?.run !== "function") {
              return json({ ok: false, error: "model_resource_unavailable" }, 404);
            }
          } else {
            const [vault, providers] = await Promise.all([
              vaultCredentialRecordsForAccount(bindings, accountId),
              loadModelProviderDefinitions(bindings.db),
            ]);
            const credential = vault.find((row) => row.id === credentialId && row.provider === provider);
            const registeredProvider = providers.find((row) => row.id === provider && row.service === credential?.serviceName);
            if (!credential || !registeredProvider) return json({ ok: false, error: "model_credential_not_found" }, 404);
          }

          const saved = await setStudioModelVisibilityPreference({ DB: bindings.db }, accountId, {
            credentialId, provider, modelId, visible,
          });
          return json({ ok: true, ...saved });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return json({ ok: false, error: message === "model_preference_invalid" ? message : "model_preference_save_failed" }, 500);
        }
      },
    },
  },
});
