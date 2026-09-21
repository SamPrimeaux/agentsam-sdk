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
  kind: "oauth";
  status: "connected" | "not_configured";
  available: boolean;
  client_status: string;
  callback_path: string;
  connection: CloudflareConnection | null;
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
