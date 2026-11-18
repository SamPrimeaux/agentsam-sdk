import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Explicit, independently reproducible review of a security-hotfix artifact.
 * Never extend this to an arbitrary non-registry URL or arbitrary package. */
export const PICOMATCH_SECURITY_FORK = Object.freeze({
  name: '@inneranimalmedia/picomatch-redos-patched',
  version: '4.0.8-iam.1',
  installedAt: 'node_modules/picomatch',
  url: 'https://raw.githubusercontent.com/SamPrimeaux/agentsam-sdk/85fcc1dd70a8505b5c96e4a090bab3843a7d5fb9/vendor/security/inneranimalmedia-picomatch-redos-patched-4.0.8-iam.1.tgz',
  integrity: 'sha512-K35tyYTMfdvUWIQAWHabu9LlJBti/RxufmxzlU1+DTuvC8oDDhv1B0A/iaWHC+rwN2vYfEtBO8NCo7HfsqJBaA==',
  sha256: '5f9cc4f9ab1f3f41432a662d68eade26101b186d86e523469d48f4cc70e14a8a',
  parserSha256: 'f072b6934850db156699544cf5bc4aec9dfdae241b713ec414650b84a3679c2c',
  archive: 'vendor/security/inneranimalmedia-picomatch-redos-patched-4.0.8-iam.1.tgz',
  parser: 'vendor/security/picomatch/lib/parse.js',
  manifest: 'vendor/security/picomatch/package.json',
});

const digest = (buffer, algorithm, encoding = 'hex') => createHash(algorithm).update(buffer).digest(encoding);

/** Fail closed if archive, patch source, identity, digest, or lockfile changes. */
export function verifyPinnedPicomatchSecurityFork(root, pkg, location) {
  const pin = PICOMATCH_SECURITY_FORK;
  if (location !== pin.installedAt || pkg?.name !== pin.name || pkg?.version !== pin.version ||
      pkg?.resolved !== pin.url || pkg?.integrity !== pin.integrity) return false;
  try {
    const archivePath = path.join(root, pin.archive);
    const parserPath = path.join(root, pin.parser);
    const manifestPath = path.join(root, pin.manifest);
    if (![archivePath, parserPath, manifestPath].every(file => fs.lstatSync(file).isFile())) return false;
    const archive = fs.readFileSync(archivePath);
    if (digest(archive, 'sha256') !== pin.sha256 ||
        'sha512-' + digest(archive, 'sha512', 'base64') !== pin.integrity ||
        digest(fs.readFileSync(parserPath), 'sha256') !== pin.parserSha256) return false;
    const source = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return source.name === pin.name && source.version === pin.version && source.license === 'MIT';
  } catch {
    return false;
  }
}
