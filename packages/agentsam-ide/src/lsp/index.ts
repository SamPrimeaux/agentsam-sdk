/**
 * LSP client contract — Monaco talks AgentSam language protocol;
 * agentsamd supervises stdio language servers.
 */

export const LANGUAGE_PROTOCOL = 'agentsam.language.v1';

export type LanguageCapability =
  | 'language.typescript'
  | 'language.javascript'
  | 'language.json'
  | 'language.html'
  | 'language.css'
  | 'language.go'
  | 'language.rust'
  | 'language.python';

export type LanguageStatus = 'ready' | 'missing' | 'starting' | 'error';

export type LanguageCapabilities = Record<LanguageCapability, LanguageStatus>;

/** CORE packs always expected with agentsamd IDE cut. */
export const CORE_LANGUAGE_CAPABILITIES: LanguageCapability[] = [
  'language.typescript',
  'language.javascript',
  'language.json',
  'language.html',
  'language.css',
];

export const OPTIONAL_LANGUAGE_PACKS: LanguageCapability[] = [
  'language.go',
  'language.rust',
  'language.python',
];

export function defaultLanguageCapabilities(partial: Partial<LanguageCapabilities> = {}): LanguageCapabilities {
  const base: LanguageCapabilities = {
    'language.typescript': 'ready',
    'language.javascript': 'ready',
    'language.json': 'ready',
    'language.html': 'ready',
    'language.css': 'ready',
    'language.go': 'missing',
    'language.rust': 'missing',
    'language.python': 'missing',
  };
  return { ...base, ...partial };
}

export type LspHandshake = {
  ui_protocol: 'workspace.v1';
  daemon_protocol: 'workspace.v1';
  daemon_version: string;
  language_protocol: typeof LANGUAGE_PROTOCOL;
  capabilities: LanguageCapabilities;
};

export function buildLspHandshake(
  daemonVersion: string,
  capabilities: LanguageCapabilities = defaultLanguageCapabilities(),
): LspHandshake {
  return {
    ui_protocol: 'workspace.v1',
    daemon_protocol: 'workspace.v1',
    daemon_version: daemonVersion,
    language_protocol: LANGUAGE_PROTOCOL,
    capabilities,
  };
}

export async function fetchLanguagePacks(listen = '127.0.0.1:18765'): Promise<Record<string, unknown>> {
  const res = await fetch(`http://${listen}/v1/language/packs`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`language_packs_http_${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function installLanguagePack(
  id: LanguageCapability,
  listen = '127.0.0.1:18765',
): Promise<Record<string, unknown>> {
  const res = await fetch(`http://${listen}/v1/language/packs/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`language_pack_install_http_${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}
