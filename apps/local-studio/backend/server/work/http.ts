import type { LocalStudioWorkAdapters, WorkRequestContext } from "./contracts";
import { createLocalStudioWorkService } from "./service";

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function createLocalStudioWorkHttp(adapters: LocalStudioWorkAdapters) {
  const service = createLocalStudioWorkService(adapters);

  return {
    async snapshot(context: WorkRequestContext) {
      const snapshot = await service.snapshot(context);
      return json({ ok: true, snapshot });
    },
  };
}
