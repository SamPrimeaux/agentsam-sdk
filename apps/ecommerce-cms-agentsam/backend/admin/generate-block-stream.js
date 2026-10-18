import appManifest from "../../agentsam.app.json" with { type: "json" };
import { generateWithProvider } from "./provider.mjs";

const encoder = new TextEncoder();

function event(name, data) {
  return encoder.encode("event: " + name + "\ndata: " + JSON.stringify(data) + "\n\n");
}

// Low-level abort harness retained for focused tests.
export function generateBlockStream(request, upstream) {
  const signal = request.signal;
  const upstreamAbort = new AbortController();
  const stopUpstream = () => upstreamAbort.abort();
  if (signal) {
    if (signal.aborted) stopUpstream();
    else signal.addEventListener("abort", stopUpstream, { once: true });
  }
  if (typeof upstream === "function") upstream(upstreamAbort.signal);
  else if (request.manifest) {
    generateWithProvider(
      request.manifest,
      request.body || {},
      upstreamAbort.signal,
      { baseUrl: request.url || "http://localhost/" },
    ).catch(() => {});
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (name, data) => controller.enqueue(event(name, data));
      send("phase", { label: "Writing markup" });
      if (signal && signal.aborted) {
        send("abort", { ok: false });
        controller.close();
        return;
      }
      const onAbort = () => {
        try {
          send("abort", { ok: false });
          controller.close();
        } catch {}
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      send("ready", { ok: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

export async function handleGenerateBlockRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const capability = body?.capability === "code.edit" ? "code.edit" : "code.generate";
  const upstreamAbort = new AbortController();
  const requestSignal = request.signal;
  const abortUpstream = () => upstreamAbort.abort();

  if (requestSignal) {
    if (requestSignal.aborted) abortUpstream();
    else requestSignal.addEventListener("abort", abortUpstream, { once: true });
  }

  const cookie = request.headers.get("cookie");
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (name, data) => {
        if (!closed) controller.enqueue(event(name, data));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };

      const onAbort = () => {
        abortUpstream();
        send("abort", { ok: false, aborted: true });
        close();
      };
      if (requestSignal) requestSignal.addEventListener("abort", onAbort, { once: true });

      send("phase", {
        label: capability === "code.edit" ? "Editing" : "Generating",
      });

      (async () => {
        try {
          const result = await generateWithProvider(
            appManifest,
            body,
            upstreamAbort.signal,
            {
              capability,
              baseUrl: request.url,
              headers: cookie ? { cookie } : {},
            },
          );

          if (!result.response.ok) {
            const failure = await result.response.json().catch(() => ({
              error: "provider_http_" + result.response.status,
            }));
            send("error", {
              ok: false,
              status: result.response.status,
              ...failure,
            });
            close();
            return;
          }

          const payload = await result.response.json();
          send("provider", {
            provider: payload.provider || result.selected.provider,
            model: payload.model || result.selected.model || null,
            capability,
          });

          if (capability === "code.edit") {
            send("patch", payload.patch || { edits: [] });
          } else {
            for (const chunk of payload.chunks || []) {
              if (upstreamAbort.signal.aborted) break;
              send("chunk", { text: String(chunk) });
            }
          }

          if (upstreamAbort.signal.aborted) {
            send("abort", { ok: false, aborted: true });
            close();
            return;
          }

          send("ready", { ok: true, capability });
          close();
        } catch (error) {
          if (upstreamAbort.signal.aborted || error?.name === "AbortError") {
            send("abort", { ok: false, aborted: true });
          } else {
            send("error", {
              ok: false,
              error: error?.message || "generation_failed",
            });
          }
          close();
        }
      })();
    },
    cancel() {
      abortUpstream();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      "x-accel-buffering": "no",
    },
  });
}
