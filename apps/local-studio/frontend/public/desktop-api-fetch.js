(() => {
  const target = window;
  if (target.__AGENTSAM_DESKTOP_API_FETCH_INSTALLED__) return;

  let bridge = target.__TAURI__;
  if (!bridge) {
    try {
      bridge = target.top && target.top.__TAURI__;
    } catch {
      bridge = null;
    }
  }
  if (typeof bridge?.core?.invoke !== "function") return;

  const originalFetch = target.fetch.bind(target);
  const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

  function toBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return target.btoa(binary);
  }

  function fromBase64(encoded) {
    const binary = target.atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function abortError() {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  function withAbort(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  target.fetch = async function agentsamDesktopServiceFetch(input, init) {
    const requestInput = input instanceof Request
      ? input
      : new URL(String(input), target.location.href).href;
    const request = new Request(requestInput, init);
    const url = new URL(request.url, target.location.href);
    const sameOrigin = url.protocol === target.location.protocol && url.host === target.location.host;
    const method = request.method.toUpperCase();

    if (
      !sameOrigin ||
      !url.pathname.startsWith("/api/") ||
      request.mode === "no-cors" ||
      !methods.has(method)
    ) {
      return originalFetch(input, init);
    }

    if (request.signal.aborted) throw abortError();

    const payload = {
      operation: "api",
      path: url.pathname + url.search,
      method,
    };
    const contentType = request.headers.get("content-type");
    if (contentType) payload.content_type = contentType;

    const skipAuth = request.credentials === "omit";
    if (skipAuth) payload.skip_auth = true;

    const blockedRequestHeaders = new Set([
      "cookie", "cookie2", "host", "origin", "referer", "content-length",
      "connection", "transfer-encoding", "upgrade", "proxy-authorization",
      "proxy-authenticate", "te", "trailer", "keep-alive", "x-user-id",
      "x-account-id", "x-tenant-id", "x-agentsam-native-client", "x-forwarded-for",
      "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-original-url",
      "x-rewrite-url",
    ]);
    const forwardedHeaders = Array.from(request.headers.entries()).filter(([name]) => {
      const normalized = name.toLowerCase();
      if (normalized === "content-type" || blockedRequestHeaders.has(normalized)) return false;
      if (normalized === "authorization" && !skipAuth) return false;
      return !normalized.startsWith("sec-") &&
        !normalized.startsWith("proxy-") &&
        !normalized.startsWith("access-control-") &&
        !normalized.startsWith("x-forwarded-");
    });
    if (forwardedHeaders.length) payload.headers = forwardedHeaders;

    if (method !== "GET" && method !== "HEAD") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > 24 * 1024 * 1024) {
        throw new TypeError("desktop_service_request_too_large");
      }
      if (bytes.byteLength) payload.body_base64 = toBase64(bytes);
    }

    const pending = Promise.resolve().then(() =>
      bridge.core.invoke("studio_service_bridge", {
        requestJson: JSON.stringify(payload),
      }),
    );
    let raw = await withAbort(pending, request.signal);
    if (typeof raw === "string") raw = JSON.parse(raw);
    if (!raw || typeof raw !== "object") {
      throw new TypeError("desktop_service_response_invalid");
    }

    const status = Number(raw.status);
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      throw new TypeError("desktop_service_status_invalid");
    }

    const headers = new Headers(Array.isArray(raw.headers) ? raw.headers : []);
    if (raw.content_type && !headers.has("content-type")) {
      headers.set("content-type", raw.content_type);
    }
    let body = raw.body_base64 ? fromBase64(raw.body_base64) : (typeof raw.body === "string" ? raw.body : "");
    if (status === 204 || status === 205 || status === 304) body = null;
    return new Response(body, { status, headers });
  };

  target.__AGENTSAM_DESKTOP_API_FETCH_INSTALLED__ = true;
})();
