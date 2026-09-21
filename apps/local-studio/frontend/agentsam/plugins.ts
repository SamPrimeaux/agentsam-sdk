/** App-supplied display and connection metadata, separate from the composer renderer. */
export interface ComposerPlugin {
  id: string;
  label: string;
  description: string;
  mention: string;
  iconUrl?: string;
  provider: string;
  kind: string;
  connectUrl: string;
}
export const composerPlugins: ComposerPlugin[] = [{
  id: 'agentsam-mcp', label: 'AgentSam MCP', description: 'Cloudflare account access',
  mention: '@agentsam-mcp', provider: 'cloudflare', kind: 'oauth',
  connectUrl: '/api/connections/cloudflare/start',
  iconUrl: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail',
}];
