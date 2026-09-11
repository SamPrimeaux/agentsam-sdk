import { defineHandler } from "nitro/h3";
import { cloudflareEnv, ollamaViaExecOs } from "../../../lib/cloudflare-runtime";

export default defineHandler(async (event) => {
  const result = await ollamaViaExecOs(cloudflareEnv(event), "/api/tags");
  if (!result.ok) return Response.json(result, { status: result.status });
  const body = JSON.parse(result.body || "{}") as { models?: Array<{ name?: string }> };
  return {
    ok: true,
    transport: "execos-local",
    public_base_url: false,
    models: Array.isArray(body.models) ? body.models.map((row) => row.name).filter(Boolean) : [],
  };
});
