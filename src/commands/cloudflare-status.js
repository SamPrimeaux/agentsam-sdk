/** Human `agentsam cf` view: account, what this login covers by pack, next step. */
import { listCloudflareCapabilities, listCloudflareFeaturePacks, scopesForFeaturePacks } from '../../packages/connectors/cfoa/src/index.js';

/** Accepts `wrangler whoami --json` output (string or object). Returns null if not usable. */
export function parseWhoami(input) {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const body = data?.result ?? data;
    if (!body || typeof body !== 'object') return null;
    return {
      loggedIn: body.loggedIn !== false && Boolean(body.accounts?.length || body.email || body.authType),
      authType: body.authType || null,
      email: body.email || null,
      accounts: (body.accounts || []).map((a) => ({ id: a.id, name: a.name })),
      granted: new Set((body.tokenPermissions || []).map(String)),
    };
  } catch { return null; }
}

export function packCoverage(granted, packs = listCloudflareFeaturePacks()) {
  return packs.map((pack) => {
    const scopes = scopesForFeaturePacks([pack.id]);
    const have = scopes.filter((s) => granted.has(s)).length;
    return { id: pack.id, label: pack.label, capabilities: pack.capabilities.length, scopes: scopes.length, granted: have,
      state: !scopes.length ? 'none' : have === scopes.length ? 'full' : have > 0 ? 'partial' : 'none' };
  });
}

export function renderCloudflareStatus(who, { capabilityTotal = listCloudflareCapabilities().length, coverage = packCoverage(who?.granted || new Set()) } = {}) {
  const lines = ['', '  Cloudflare'];
  if (!who?.loggedIn) {
    return [...lines, '  ○ Not signed in', '', '  Next:  agentsam login --cloudflare', ''].join('\n');
  }
  lines.push(`  ✓ ${who.email || 'signed in'}${who.authType ? ` · ${who.authType}` : ''}`);
  for (const a of who.accounts) lines.push(`    account  ${a.name} (${a.id})`);
  const packs = coverage.filter((c) => c.id !== 'all' && c.scopes > 0);
  const full = packs.filter((c) => c.state === 'full');
  const used = packs.filter((c) => c.state === 'partial' && c.granted > 2).sort((x, y) => y.granted / y.scopes - x.granted / x.scopes);
  const rest = packs.filter((c) => !full.includes(c) && !used.includes(c));
  lines.push('', `  This Wrangler login grants ${who.granted.size} permissions. AgentSam knows ${capabilityTotal} Cloudflare capabilities across ${packs.length} packs.`, '');
  const row = (mark, c) => `    ${mark} ${c.label.padEnd(26)} ${String(c.granted).padStart(3)}/${c.scopes} scopes · ${c.capabilities} capabilities`;
  for (const c of full) lines.push(row('✓', c));
  for (const c of used) lines.push(row('◐', c));
  if (rest.length) lines.push(`    ○ ${rest.length} more packs not granted yet: ${rest.map((c) => c.id).join(', ')}`);
  const next = used[0] || rest.find((c) => c.capabilities > 0);
  lines.push('', next ? `  Next:  agentsam cloudflare login --pack ${next.id}` : '  All packs granted.',
    '  More:  agentsam cf capabilities · agentsam cf commands · --json for raw output', '');
  return lines.join('\n');
}
