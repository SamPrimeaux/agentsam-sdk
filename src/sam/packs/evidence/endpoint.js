/**
 * The one definition of an app's evidence endpoint. An app opts in by declaring
 * `storage.evidenceEndpoint` in its agentsam.app.json; the hosted EvidenceStore and
 * `agentsam app validate` both read it from here, so they cannot drift apart.
 * Nothing in this file names a bucket, account or app: those come from the manifest.
 */
export const EVIDENCE_ENDPOINT = /^\/api\/([a-z][a-z0-9-]*)\/evidence$/;

/** Scope prefix an app's evidence endpoint is guarded by, e.g. /api/cad/evidence -> "cad". */
export function evidenceScopePrefix(endpoint) {
  return typeof endpoint === 'string' ? EVIDENCE_ENDPOINT.exec(endpoint)?.[1] ?? null : null;
}

/** Problems with a manifest `storage` block that opts into evidence; empty means valid. */
export function evidenceStorageProblems(storage) {
  const problems = [];
  const prefix = evidenceScopePrefix(storage?.evidenceEndpoint);
  if (!prefix) {
    problems.push('evidenceEndpoint must look like /api/<app>/evidence (lowercase kebab-case segment)');
  }
  if (typeof storage?.bucketName !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(storage.bucketName)) {
    problems.push('bucketName must be the R2 bucket name (3-63 lowercase letters, digits or hyphens)');
  }
  if (typeof storage?.artifactBinding !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(storage.artifactBinding)) {
    problems.push('artifactBinding must be the Worker R2 binding name (UPPER_SNAKE_CASE)');
  }
  if (typeof storage?.principal !== 'string' || !storage.principal.trim()) {
    problems.push('principal must name the credential verifier that authorizes evidence writes');
  }
  if (prefix) {
    const scopes = Array.isArray(storage.requiredScopes) ? storage.requiredScopes : [];
    for (const action of ['read', 'write']) {
      if (!scopes.includes(`${prefix}:evidence.${action}`)) {
        problems.push(`requiredScopes must include "${prefix}:evidence.${action}"`);
      }
    }
  }
  return problems;
}
