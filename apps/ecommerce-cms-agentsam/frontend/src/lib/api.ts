export class AdminApiError extends Error {
  status: number;
  contentType: string;
  requestId: string | null;
  responsePreview: string | null;

  constructor(
    message: string,
    {
      status,
      contentType,
      requestId,
      responsePreview,
    }: {
      status: number;
      contentType: string;
      requestId: string | null;
      responsePreview: string | null;
    },
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.contentType = contentType;
    this.requestId = requestId;
    this.responsePreview = responsePreview;
  }
}

function responseRequestId(res: Response) {
  return (
    res.headers.get("cf-ray") ||
    res.headers.get("x-request-id") ||
    res.headers.get("x-correlation-id")
  );
}

async function parseAdminResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new AdminApiError("Sign in again to continue", {
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      requestId: responseRequestId(res),
      responsePreview: null,
    });
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const requestId = responseRequestId(res);

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new AdminApiError(data.error || data.message || `Request failed (${res.status})`, {
        status: res.status,
        contentType,
        requestId,
        responsePreview: null,
      });
    }
    return data;
  }

  const text = await res.text().catch(() => "");
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 240) || null;
  const kind = contentType || "unknown content type";
  const message = res.ok
    ? `Expected JSON but received ${kind}`
    : `Request failed (${res.status}); server returned ${kind}`;

  throw new AdminApiError(message, {
    status: res.status,
    contentType,
    requestId,
    responsePreview: preview,
  });
}

export async function adminFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  if (opts.body != null && !(opts.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: opts.credentials || "same-origin",
  });

  return parseAdminResponse<T>(res);
}

export async function adminFormFetch<T = unknown>(
  path: string,
  form: FormData,
  opts: Omit<RequestInit, "body"> = {},
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  headers.delete("content-type");

  const res = await fetch(path, {
    ...opts,
    method: opts.method || "POST",
    body: form,
    headers,
    credentials: opts.credentials || "same-origin",
  });

  return parseAdminResponse<T>(res);
}

export async function requireSession() {
  return adminFetch<{ email: string }>("/api/admin/me");
}

export async function fetchFinanceAnalytics(range: string) {
  return adminFetch<import("./types").FinanceAnalyticsResponse>(
    `/api/admin/analytics/finance?range=${encodeURIComponent(range)}`,
  );
}

export type AccountMe = {
  ok: boolean;
  id: string;
  email: string;
  role: string;
  display_name: string;
  avatar_url: string | null;
  initials: string;
};

export async function fetchAccount() {
  return adminFetch<AccountMe>("/api/admin/me");
}

export async function saveAccountProfile(input: {
  display_name?: string;
  avatar_url?: string;
}) {
  return adminFetch<{ ok: boolean }>("/api/admin/account/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAccountPassword(input: {
  current_password: string;
  new_password: string;
}) {
  return adminFetch<{ ok: boolean }>("/api/admin/account/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
