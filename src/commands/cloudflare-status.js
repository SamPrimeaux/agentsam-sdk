/** Human agentsam cf view for the active Wrangler identity. */

/** Accepts wrangler whoami --json output (string or object). Returns null if not usable. */
export function parseWhoami(input) {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const body = data?.result ?? data;
    if (!body || typeof body !== 'object') return null;
    return {
      loggedIn: body.loggedIn !== false && Boolean(body.accounts?.length || body.email || body.authType),
      authType: body.authType || null,
      email: body.email || null,
      accounts: (body.accounts || []).map((account) => ({ id: account.id, name: account.name })),
      granted: new Set((body.tokenPermissions || []).map(String)),
    };
  } catch {
    return null;
  }
}

export function renderCloudflareStatus(who) {
  const lines = ['', '  Cloudflare'];
  if (!who?.loggedIn) {
    return [...lines, '  ○ Not signed in', '', '  Next:  agentsam login --cloudflare', ''].join('\n');
  }
  lines.push('  ✓ ' + (who.email || 'signed in') + (who.authType ? ' · ' + who.authType : ''));
  for (const account of who.accounts) lines.push('    account  ' + account.name + ' (' + account.id + ')');
  lines.push(
    '',
    '  Wrangler reports ' + who.granted.size + ' token permissions.',
    '  AgentSam OAuth permission packs are owned by the Local Studio provider plugin.',
    '',
    '  Next:  agentsam cloudflare login --list-packs',
    '  More:  agentsam cf capabilities · agentsam cf commands · --json for raw output',
    '',
  );
  return lines.join('\n');
}
