import { invokeStudioService, isPackagedDesktop } from "@/lib/desktop/tauri";

export type VaultRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

export type VaultResponse<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function vaultRequest<T = Record<string, unknown>>(
  path: string,
  options: VaultRequestOptions = {},
): Promise<VaultResponse<T>> {
  if (!path.startsWith("/api/vault/")) throw new Error("vault_path_invalid");
  const method = options.method || "GET";

  if (isPackagedDesktop()) {
    const response = await invokeStudioService({
      operation: "vault",
      path,
      method,
      body: options.body,
    });
    let data = {} as T;
    try {
      data = (response.body ? JSON.parse(response.body) : {}) as T;
    } catch {
      // Keep the service status authoritative if a non-JSON failure body appears.
    }
    return { ok: response.ok, status: response.status, data };
  }

  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data = {} as T;
  try {
    data = (await response.json()) as T;
  } catch {
    // Keep HTTP status authoritative if a non-JSON failure body appears.
  }
  return { ok: response.ok, status: response.status, data };
}

export type AccountInventoryModel = {
  provider: string;
  model_id: string;
};

export type AccountInventoryProvider = {
  id: string;
  configured: boolean;
  source?: string | null;
};

export type AccountInventoryDiscovery = {
  ok?: boolean;
  error?: string | null;
};

export type AccountInventoryPayload = {
  ok?: boolean;
  error?: string;
  providers?: AccountInventoryProvider[];
  discovery?: Record<string, AccountInventoryDiscovery>;
  availableModels?: AccountInventoryModel[];
};

export async function accountInventoryRequest(): Promise<VaultResponse<AccountInventoryPayload>> {
  if (isPackagedDesktop()) {
    const response = await invokeStudioService({ operation: "inventory" });
    let data: AccountInventoryPayload = {};
    try {
      data = response.body ? (JSON.parse(response.body) as AccountInventoryPayload) : {};
    } catch {
      /* status remains authoritative */
    }
    return { ok: response.ok, status: response.status, data };
  }

  const response = await fetch("/api/llm/inventory", { credentials: "same-origin" });
  let data: AccountInventoryPayload = {};
  try {
    data = (await response.json()) as AccountInventoryPayload;
  } catch {
    /* status remains authoritative */
  }
  return { ok: response.ok, status: response.status, data };
}
