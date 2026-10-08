/**
 * Language capability contract. The host may connect an actual LSP transport.
 * AgentSam does not claim external LSP readiness from declared capabilities.
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

export type LanguageStatus = 'available' | 'ready' | 'missing' | 'starting' | 'error';

export type LanguageCapabilities = Record<LanguageCapability, LanguageStatus>;

/** Monaco ships built-in language workers for these; this is not external LSP proof. */
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
    'language.typescript': 'available',
    'language.javascript': 'available',
    'language.json': 'available',
    'language.html': 'available',
    'language.css': 'available',
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
