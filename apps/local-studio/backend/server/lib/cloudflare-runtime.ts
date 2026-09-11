import type { ModelProviderId } from "@inneranimalmedia/agentsam-local-shared";

export interface D1Like {
  prepare(sql: string): { first<T = Record<string, unknown>>(): Promise<T | null> };
}

export interface R2Like {
  head(key: string): Promise<unknown>;
}

export interface FetcherLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface AgentSamCloudflareEnv {
  DB?: D1Like;
  WEBSITE_ASSETS?: R2Like;
  AGENTSAM_WAI?: unknown;
  EXECOS?: FetcherLike;
  PTY_SERVICE?: FetcherLike;
  IAM_ORIGIN?: string;
  IAM_CLIENT_ID?: string;
  IAM_CLIENT_SECRET?: string;
  AGENTSAM_SDK_KEY?: string;
  AGENTSAM_BRIDGE_KEY?: string;
  XAI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_EMBED_MODEL?: string;
  OLLAMA_LOCAL_CWD?: string;
}

export const OLLAMA_DEFAULTS = Object.freeze({
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5-coder",
  embedModel: "mxbai-embed-large",
});

function configured(value: unknown): boolean {
  return value != null && String(value).trim().length > 0;
}

export function cloudflareEnv(event: any): AgentSamCloudflareEnv {
  return (event?.req?.runtime?.cloudflare?.env ?? {}) as AgentSamCloudflareEnv;
}

export function providerReadiness(env: AgentSamCloudflareEnv) {
  return {
    grok: { configured: configured(env.XAI_API_KEY), transport: "edge-api" },
    openai: { configured: configured(env.OPENAI_API_KEY), transport: "edge-api" },
    gemini: { configured: configured(env.GEMINI_API_KEY), transport: "edge-api" },
    "workers-ai": { configured: Boolean(env.AGENTSAM_WAI), transport: "workers-ai" },
    ollama: {
      configured: Boolean(env.EXECOS?.fetch) && configured(env.AGENTSAM_BRIDGE_KEY),
      transport: "execos-local",
      model: env.OLLAMA_MODEL || OLLAMA_DEFAULTS.model,
      embed_model: env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
      public_base_url: false,
      cwd_source: configured(env.OLLAMA_LOCAL_CWD) ? "config" : "neutral-root",
    },
  } satisfies Record<ModelProviderId, Record<string, unknown>>;
}

export async function bindingHealth(env: AgentSamCloudflareEnv) {
  const db = { configured: Boolean(env.DB), reachable: false };
  const websiteAssets = { configured: Boolean(env.WEBSITE_ASSETS), reachable: false };
  const execos = { configured: Boolean(env.EXECOS?.fetch) };
  const ptyService = { configured: Boolean(env.PTY_SERVICE?.fetch), reachable: false };

  if (env.DB) {
    try {
      const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok?: number }>();
      db.reachable = Number(row?.ok) === 1;
    } catch {
      db.reachable = false;
    }
  }

  if (env.WEBSITE_ASSETS) {
    try {
      await env.WEBSITE_ASSETS.head("__agentsam_sdk_binding_probe__");
      websiteAssets.reachable = true;
    } catch {
      websiteAssets.reachable = false;
    }
  }

  if (env.PTY_SERVICE?.fetch) {
    for (const target of ["http://localhost:3099/health", "http://localhost/health"]) {
      try {
        const response = await env.PTY_SERVICE.fetch(new Request(target));
        if (response.ok) {
          ptyService.reachable = true;
          break;
        }
      } catch {
        // Try the next canonical PTY health address.
      }
    }
  }

  return { db, website_assets: websiteAssets, execos, pty_service: ptyService };
}

export type ExecOsResult = {
  ok: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function hasSdkBearer(request: Request, env: AgentSamCloudflareEnv): Promise<boolean> {
  const expected = String(env.AGENTSAM_SDK_KEY || "").trim();
  const presented = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !presented) return false;
  const [a, b] = await Promise.all([sha256(expected), sha256(presented)]);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function resolveLocalExecCwd(env: AgentSamCloudflareEnv): string {
  const explicit = String(env.OLLAMA_LOCAL_CWD || "").trim();
  return explicit || "/";
}

export async function executeLocalViaExecOs(
  env: AgentSamCloudflareEnv,
  command: string,
  timeoutMs = 180_000,
): Promise<ExecOsResult> {
  if (!env.EXECOS?.fetch) {
    return { ok: false, exit_code: null, stdout: "", stderr: "", error: "execos_binding_required" };
  }
  if (!configured(env.AGENTSAM_BRIDGE_KEY)) {
    return { ok: false, exit_code: null, stdout: "", stderr: "", error: "agentsam_bridge_key_required" };
  }

  const cwd = resolveLocalExecCwd(env);

  try {
    const response = await env.EXECOS.fetch("https://internal/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bridge-key": String(env.AGENTSAM_BRIDGE_KEY),
      },
      body: JSON.stringify({ command, target: "local", cwd }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const exitCode = Number.isFinite(Number(data.exit_code)) ? Number(data.exit_code) : null;
    return {
      ok: data.ok === true || (data.ok !== false && exitCode === 0),
      exit_code: exitCode,
      stdout: typeof data.stdout === "string" ? data.stdout : "",
      stderr: typeof data.stderr === "string" ? data.stderr : "",
      error: typeof data.error === "string" ? data.error : response.ok ? undefined : `execos_http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      exit_code: null,
      stdout: "",
      stderr: "",
      error: error instanceof Error ? error.message : "execos_binding_failed",
    };
  }
}

function localOllamaCommand(pathname: "/api/tags" | "/api/chat" | "/api/embeddings", payload?: unknown): string {
  const request = payload == null ? null : Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const script = request == null
    ? `fetch(${JSON.stringify(`${OLLAMA_DEFAULTS.baseUrl}${pathname}`)}).then(async r=>{process.stdout.write(JSON.stringify({status:r.status,body:await r.text()}))}).catch(e=>{console.error(e.message);process.exit(1)})`
    : `const body=Buffer.from(process.argv[1],"base64url").toString("utf8");fetch(${JSON.stringify(`${OLLAMA_DEFAULTS.baseUrl}${pathname}`)},{method:"POST",headers:{"content-type":"application/json"},body}).then(async r=>{process.stdout.write(JSON.stringify({status:r.status,body:await r.text()}))}).catch(e=>{console.error(e.message);process.exit(1)})`;
  return request == null
    ? `node -e ${JSON.stringify(script)}`
    : `node -e ${JSON.stringify(script)} ${request}`;
}

export async function ollamaViaExecOs(
  env: AgentSamCloudflareEnv,
  pathname: "/api/tags" | "/api/chat" | "/api/embeddings",
  payload?: unknown,
) {
  const result = await executeLocalViaExecOs(env, localOllamaCommand(pathname, payload));
  if (!result.ok) return { ok: false, error: result.error || result.stderr || "ollama_exec_failed", status: 502 };
  try {
    const envelope = JSON.parse(result.stdout) as { status?: number; body?: string };
    const status = Number(envelope.status || 502);
    const body = typeof envelope.body === "string" ? envelope.body : "";
    return { ok: status >= 200 && status < 300, status, body };
  } catch {
    return { ok: false, error: "ollama_exec_invalid_json", status: 502 };
  }
}
