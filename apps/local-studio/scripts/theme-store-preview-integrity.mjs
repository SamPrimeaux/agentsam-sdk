import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const CHALLENGE_TAG = '<script>window.__CF$cv$params=';
const BEACON_TAG = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/';
const SCRIPT_END = '</script>';

/**
 * Verify exactly the immutable Theme Store preview manifest bytes.
 *
 * Cloudflare may inject a dynamic Bot Management precursor and Insights beacon
 * into an HTML response. They are not part of the source release, and their
 * per-request values make raw public response hashes unstable. Accept a
 * recovered source only when BOTH known tags appear as one adjacent insertion
 * immediately before </body> and the recovered payload hashes to the manifest.
 * Everything else, including unexpected modifications, fails closed.
 */
export function verifyThemeStorePreviewBytes(responseBytes, expectedSha256, resource) {
  const bytes = Buffer.from(responseBytes);
  if (sha256(bytes) === expectedSha256) return bytes;

  const fail = () => {
    throw Error('Theme Store preview SHA-256 mismatch: ' + resource);
  };
  if (!String(resource).toLowerCase().endsWith('.html')) return fail();

  const html = bytes.toString('utf8');
  const start = html.lastIndexOf(CHALLENGE_TAG);
  if (start < 0) return fail();
  const challengeEndStart = html.indexOf(SCRIPT_END, start);
  if (challengeEndStart < 0) return fail();
  const challengeEnd = challengeEndStart + SCRIPT_END.length;
  if (!html.slice(start, challengeEnd).includes('/cdn-cgi/challenge-platform/scripts/precursor/main.js?ray=')) return fail();

  const beacon = html.indexOf(BEACON_TAG, challengeEnd);
  // The edge-injected tags must be directly adjacent, not mixed with product scripts.
  if (beacon !== challengeEnd) return fail();
  const beaconEndStart = html.indexOf(SCRIPT_END, beacon);
  if (beaconEndStart < 0) return fail();
  const beaconEnd = beaconEndStart + SCRIPT_END.length;
  const beaconScript = html.slice(beacon, beaconEnd);
  if (!beaconScript.includes('static.cloudflareinsights.com/beacon.min.js/')
    || !beaconScript.includes('data-cf-beacon=')) return fail();

  const trailing = html.slice(beaconEnd);
  if (!/^\r?\n<\/body>\s*<\/html>\s*$/i.test(trailing)) return fail();

  // The original HTML already contains a line break before </body>. Cloudflare
  // introduces a second line for its injected script pair; remove that line.
  const recovered = Buffer.from(html.slice(0, start) + trailing.replace(/^\r?\n/, ''), 'utf8');
  if (sha256(recovered) !== expectedSha256) return fail();
  return recovered;
}
