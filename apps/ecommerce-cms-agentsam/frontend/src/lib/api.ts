export async function adminFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers as Record<string, string>) },
  });
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function requireSession() {
  return adminFetch<{ email: string }>("/api/admin/me");
}

export async function fetchFinanceAnalytics(range: string) {
  return adminFetch<import("./types").FinanceAnalyticsResponse>(
    `/api/admin/analytics/finance?range=${encodeURIComponent(range)}`
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

export async function saveAccountProfile(input: { display_name?: string; avatar_url?: string }) {
  return adminFetch<{ ok: boolean }>("/api/admin/account/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAccountPassword(input: { current_password: string; new_password: string }) {
  return adminFetch<{ ok: boolean }>("/api/admin/account/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
