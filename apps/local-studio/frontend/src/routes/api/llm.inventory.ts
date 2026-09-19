import { createFileRoute } from "@tanstack/react-router";
import { buildStudioInventory, platformCredentials } from "@inneranimalmedia/agentsam-local-shared/studio-inventory";

export const Route = createFileRoute("/api/llm/inventory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = (request.headers.get("x-user-id") || "").trim();
        if (!userId) {
          return Response.json(
            { ok: false, error: "unauthorized", detail: "X-User-Id required for Studio inventory" },
            { status: 401 },
          );
        }

        try {
          const inventory = await buildStudioInventory(platformCredentials(process.env));
          const text = JSON.stringify(inventory);
          if (/"value"\s*:/.test(text) || /sk-[a-zA-Z0-9]{10,}/.test(text)) {
            return Response.json({ ok: false, error: "inventory_sanitizer_rejected_secret_field" }, { status: 500 });
          }
          return Response.json({ ok: true, user_id: userId, ...inventory });
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
