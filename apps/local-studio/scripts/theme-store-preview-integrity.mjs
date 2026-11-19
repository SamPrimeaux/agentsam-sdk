import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const CHALLENGE_TAG = '<script>window.__CF$cv$params=';
const BEACON_TAG = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/';
const SCRIPT_END = '</script>';

/**
 * Validate Theme Store preview bytes against the immutable R2 release digest.
 *
 * Cloudflare sometimes adds a dynamic challenge script and/or an Insights beacon
 * to HTML delivered through the public edge. The file in R2 is unchanged, but
 * the response's bytes differ per request. We remove ONLY these exact identified
 * edge additions and only accept the result if its hash matches the manifest.
 * No unknown mutations, non-HTML transformations or checksum bypasses.
 */
export function verifyThemeStorePreviewBytes(responseBytes, expectedSha256, resource) {
  const bytes = Buffer.from(responseBytes);
  if (sha256(bytes) === expectedSha256) return bytes;
  const fail = () => { throw Error('Theme Store preview SHA-256 mismatch: ' + resource); };
  if (!String(resource).toLowerCase().endsWith('.html')) return fail();

  const html = bytes.toString('utf8');
  const positions = [];
  const challengeStart = html.indexOf(CHALLENGE_TAG);
  if (challengeStart >= 0) {
    const endAt = html.indexOf(SCRIPT_END, challengeStart);
    if (endAt < 0 || html.indexOf(CHALLENGE_TAG, challengeStart + 1) >= 0) return fail();
    const end = endAt + SCRIPT_END.length;
    if (!html.slice(challengeStart, end).includes('/cdn-cgi/challenge-platform/scripts/precursor/main.js?ray=')) return fail();
    positions.push({ start: challengeStart, end });
  }

  const beaconStart = html.indexOf(BEACON_TAG);
  if (beaconStart >= 0) {
    const endAt = html.indexOf(SCRIPT_END, beaconStart);
    if (endAt < 0 || html.indexOf(BEACON_TAG, beaconStart + 1) >= 0) return fail();
    const end = endAt + SCRIPT_END.length;
    const beacon = html.slice(beaconStart, end);
    if (!beacon.includes('static.cloudflareinsights.com/beacon.min.js/')
      || !beacon.includes('data-cf-beacon=')) return fail();
    positions.push({ start: beaconStart, end });
  }

  if (!positions.length) return fail();
  const closingBody = html.lastIndexOf('</body>');
  if (closingBody < 0 || positions.some(pos => pos.start > closingBody || closingBody - pos.end > 4)) return fail();
  const ordered = [...positions].sort((a,b) => b.start - a.start);
  let cleaned = html;
  for (const { start, end } of ordered) cleaned = cleaned.slice(0, start) + cleaned.slice(end);
  let recovered = Buffer.from(cleaned, 'utf8');
  if (sha256(recovered) === expectedSha256) return recovered;

  // Some Cloudflare deployments insert an additional newline after the pair
  // of scripts. Remove one extra blank line only immediately before </body>.
  cleaned = cleaned.replace(/\r?\n\r?\n(<\/body>)/i, '\n$1');
  recovered = Buffer.from(cleaned, 'utf8');
  if (sha256(recovered) !== expectedSha256) return fail();
  return recovered;
}
