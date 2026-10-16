import type { DesignArtifact, DesignProject } from '@inneranimalmedia/agentsam-cad-shared';

/** Host-sourced identity; no user-supplied API tokens or buckets in browser. */
export type CadPublishProvider = 'github' | 'cloudflare';
export type CadPublishConnection = {
  provider: CadPublishProvider;
  status: 'connected' | 'not_connected' | 'unavailable';
  label: string;
};

const PROVIDERS = ['github', 'cloudflare'] as const;
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
type AuthorizedFetch = typeof fetch;

export async function getCadPublishConnections(request: AuthorizedFetch = fetch): Promise<CadPublishConnection[]> {
  const response = await request('/api/cad/publish/connections', { credentials: 'same-origin' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('CAD publishing is not installed on this host. Use Direct Export until the OAuth-backed publishing service is available.');
  }
  const body = await response.json();
  if (!Array.isArray(body?.providers)) throw new Error('cad_publish_connections_invalid');
  return PROVIDERS.map((provider) => {
    const value = body.providers.find((p: any) => p?.provider === provider);
    return {
      provider,
      status: value?.status === 'connected' ? 'connected' :
        value?.status === 'not_connected' ? 'not_connected' : 'unavailable',
      label: typeof value?.label === 'string' ? value.label.slice(0, 100) : provider === 'github' ? 'GitHub App' : 'Cloudflare OAuth',
    };
  });
}

function encodeContent(artifact: DesignArtifact): string {
  const bytes = typeof artifact.content === 'string'
    ? new TextEncoder().encode(artifact.content)
    : artifact.content;
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_EXPORT_BYTES) {
    throw new Error('cad_publish_artifact_invalid_or_too_large');
  }
  let output = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    output += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(output);
}

/** A success is only returned when the authenticated host confirms real writes. */
export async function publishCadProject(
  { provider, project, artifacts, note }: {
    provider: CadPublishProvider;
    project: DesignProject;
    artifacts: DesignArtifact[];
    note?: string;
  },
  request: AuthorizedFetch = fetch,
) {
  if (!PROVIDERS.includes(provider) || !project.id || !artifacts.length || artifacts.length > 30) {
    throw new Error('cad_publish_invalid_request');
  }
  const response = await request('/api/cad/publish', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider, project_id: project.id, revision: project.version || 1,
      note: (note || '').slice(0, 500),
      artifacts: artifacts.map((artifact) => ({
        filename: artifact.filename, format: artifact.format,
        mime_type: artifact.mimeType, content_base64: encodeContent(artifact),
      })),
    }),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('cad_publish_host_unavailable_or_denied');
  }
  const body = await response.json();
  const receipt = body?.receipt;
  if (body?.ok !== true || receipt?.status !== 'completed'
    || typeof receipt?.id !== 'string' || !receipt.id
    || receipt?.files_written !== artifacts.length
    || receipt?.provider !== provider) {
    throw new Error('cad_publish_no_verified_receipt');
  }
  return receipt as { id: string; status: 'completed'; provider: CadPublishProvider; files_written: number; target_url?: string };
}
