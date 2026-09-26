/** Terminal attach contract — xterm host prefers agentsamd PTY. */

export type TerminalBackend = 'agentsamd_pty' | 'scratch_virtual';

export type TerminalBootBanner = {
  product: string;
  version: string;
  backend: TerminalBackend;
  listen?: string;
  lines: string[];
};

export function buildBootBanner(opts: {
  backend: TerminalBackend;
  version?: string;
  listen?: string;
}): TerminalBootBanner {
  const version = opts.version || '0.1.0';
  const lines =
    opts.backend === 'agentsamd_pty'
      ? [
          `AgentSam CLI v${version} · agentsamd PTY`,
          'Type help · agentsam setup (first-time tutorial, one step at a time)',
        ]
      : [
          `AgentSam CLI v${version} · Scratch (virtual)`,
          'agentsamd offline — local machine runtime unavailable',
          'Type help · agentsam setup when ready',
        ];
  return {
    product: 'AgentSam CLI',
    version,
    backend: opts.backend,
    listen: opts.listen,
    lines,
  };
}

export const AGENTSAMD_DEFAULT_LISTEN = '127.0.0.1:18765';

export async function probeAgentsamd(listen = AGENTSAMD_DEFAULT_LISTEN): Promise<{
  ok: boolean;
  backend: TerminalBackend;
  body?: Record<string, unknown>;
}> {
  const url = `http://${listen.replace(/^https?:\/\//, '')}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, backend: res.ok ? 'agentsamd_pty' : 'scratch_virtual', body };
  } catch {
    return { ok: false, backend: 'scratch_virtual' };
  }
}
