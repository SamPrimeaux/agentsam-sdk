import fs from 'node:fs';
import path from 'node:path';

/**
 * The Local Studio app may be version-aligned before the matching SDK is
 * published to npm. Its installed SDK tarball must always be REAL and have
 * the correct registry integrity. Do not counterfeit a future lock entry.
 */
export function expectedSdkTarballVersion(repoRoot, appVersion, { requirePublished = false } = {}) {
  const yaml = fs.readFileSync(path.join(repoRoot, 'agentsam.yaml'), 'utf8');
  const marker = '\nrelease:\n';
  const offset = yaml.indexOf(marker);
  const block = offset >= 0 ? yaml.slice(offset + marker.length) : null;
  if (!block) throw Error('canonical_sdk_release_authority_missing');
  const target = block.match(/^\s+target_version:\s*"([^"]+)"/m)?.[1];
  const current = block.match(/^\s+current_latest:\s*"([^"]+)"/m)?.[1];
  const state = block.match(/^\s+state:\s*(\w+)/m)?.[1];
  if (target !== appVersion || !current || !['candidate', 'published'].includes(state)) {
    throw Error('sdk_release_phase_inconsistent_with_local_studio');
  }
  const isPublished = requirePublished || state === 'published';
  if (isPublished && state !== 'published' && !requirePublished) throw Error('published_sdk_phase_required');
  return {
    version: isPublished ? appVersion : current,
    phase: isPublished ? 'published-verification' : 'candidate-uses-previous-published-sdk',
  };
}
