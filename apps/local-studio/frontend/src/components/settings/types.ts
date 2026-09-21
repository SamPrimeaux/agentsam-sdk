export type CloudflareConnection = {
  connection_id: string;
  owner: string;
  cloudflare_account_id: string | null;
  scopes: string[];
  status: string;
  created_at: number | null;
  updated_at: number | null;
  expires_at: number | null;
};

export type OAuthConnectionRecord = {
  provider: "cloudflare";
  plugin_key: "agentsam-mcp";
  display_name: "AgentSam MCP";
  kind: "oauth";
  status: "connected" | "not_configured";
  available: boolean;
  client_status: string;
  callback_path: string;
  connection: CloudflareConnection | null;
  plugin: {
    id: string;
    plugin_key: string;
    setup_status: string;
    health_status: "unknown" | "healthy" | "degraded" | "unhealthy" | "unreachable" | "auth_error" | "disabled";
    health_strategy: string;
    last_health_at: number | null;
    last_healthy_at: number | null;
    consecutive_failures: number;
    avg_latency_ms: number | null;
    last_error_code: string | null;
  } | null;
};

export type VaultSecret = {
  id: string;
  name: string;
  type: string;
  service: string;
  description: string | null;
  workspace_id: string | null;
  expires_at: number | null;
  last_used_at: number | null;
  usage_count: number;
  created_at: number;
  updated_at: number;
  last4: string | null;
};
