const API = 'https://api.osv.dev/v1/query';
export const severityOrder = { UNKNOWN: 5, CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
function severity(vuln, affected) {
  const labels = [vuln.database_specific?.severity, ...affected.map(a => a.ecosystem_specific?.severity)];
  const normalized = labels.map(s => String(s || '').toUpperCase().replace('MEDIUM', 'MODERATE')).filter(s => s in severityOrder);
  // Preserve unparsed CVSS vectors below; never silently downgrade unknown severity.
  return normalized.sort((a,b) => severityOrder[b] - severityOrder[a])[0] || 'UNKNOWN';
}
export function normalizeAdvisory(vuln, dependency) {
  if (!vuln || typeof vuln.id !== 'string' || !Array.isArray(vuln.affected)) throw new Error('Malformed OSV advisory');
  if (vuln.withdrawn) return null;
  const affected = vuln.affected.filter(a => a.package?.ecosystem === 'npm' && a.package?.name === dependency.name);
  if (!affected.length) throw new Error('OSV advisory does not describe the requested package');
  return {
    id: vuln.id, severity: severity(vuln, affected),
    summary: String(vuln.summary || 'See advisory for details').slice(0, 1000),
    aliases: Array.isArray(vuln.aliases) ? vuln.aliases.filter(s => typeof s === 'string') : [],
    url: 'https://osv.dev/vulnerability/' + encodeURIComponent(vuln.id),
    cvss: Array.isArray(vuln.severity) ? vuln.severity.filter(s => typeof s?.score === 'string').map(s => ({ type: s.type, score: s.score })) : [],
    fixed_versions: [...new Set(affected.flatMap(a => a.ranges || []).filter(r => r.type === 'SEMVER').flatMap(r => r.events || []).map(e => e.fixed).filter(v => typeof v === 'string'))],
  };
}
async function request(body, options, signal) {
  const fetcher = options.fetch || globalThis.fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetcher(API, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs || 10_000)]),
        redirect: 'error',
      });
      if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
        await response.body?.cancel();
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 200 * 2 ** attempt);
          signal.addEventListener('abort', abort, { once: true });
        });
        continue;
      }
      if (!response.ok) throw new Error('OSV HTTP ' + response.status);
      const chunks = []; let size = 0;
      if (!response.body) throw new Error('Empty OSV response body');
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 32 * 1024 * 1024) { await reader.cancel(); throw new Error('OSV response too large'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const text = Buffer.concat(chunks).toString('utf8');
      const data = JSON.parse(text);
      if (!data || Array.isArray(data) || typeof data !== 'object' || data.error || (data.vulns !== undefined && !Array.isArray(data.vulns))) throw new Error('Malformed OSV response');
      if (data.next_page_token !== undefined && typeof data.next_page_token !== 'string') throw new Error('Malformed OSV page token');
      return data;
    } catch (error) {
      // HTTP/schema errors are not transformed into an empty successful response.
      throw new Error(signal.aborted ? 'OSV scan cancelled or deadline exceeded' : 'OSV lookup failed: ' + error.message);
    }
  }
}
export async function queryOsv(dependencies, options = {}) {
  const signal = AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(options.deadlineMs || 120_000)]);
  const results = new Array(dependencies.length);
  let cursor = 0;
  async function worker() {
    while (cursor < dependencies.length) {
      const index = cursor++, dep = dependencies[index], advisories = new Map(), pages = new Set();
      try {
        let token;
        do {
          const data = await request({ package: { ecosystem: 'npm', name: dep.name }, version: dep.version, ...(token ? { page_token: token } : {}) }, options, signal);
          for (const vuln of data.vulns || []) {
            const advisory = normalizeAdvisory(vuln, dep);
            if (advisory) advisories.set(advisory.id, advisory);
          }
          token = data.next_page_token;
          if (token && (pages.has(token) || pages.size >= 100)) throw new Error('OSV pagination did not complete');
          if (token) pages.add(token);
        } while (token);
        results[index] = { ...dep, checked: true, advisories: [...advisories.values()] };
      } catch {
        results[index] = { ...dep, checked: false, advisories: [...advisories.values()], error: 'Advisory lookup incomplete; retry with network access.' };
      }
      options.onProgress?.({ completed: results.filter(Boolean).length, total: dependencies.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, dependencies.length) }, worker));
  return results;
}
