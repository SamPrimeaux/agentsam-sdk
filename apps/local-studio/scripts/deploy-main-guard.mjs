/**
 * A clean build from a stale worktree must not overwrite a newer main release.
 */
const SHA = /^[a-f0-9]{40}$/i;

export function parseRemoteMainRef(output) {
  const match = /^([a-f0-9]{40})\s+refs\/heads\/main\s*$/i.exec(String(output).trim());
  if (!match) throw new Error('deploy_main_ref_unavailable');
  return match[1].toLowerCase();
}

export function assertCurrentMainDeployment(checkoutSha, remoteMainSha) {
  if (!SHA.test(String(checkoutSha)) || !SHA.test(String(remoteMainSha))) {
    throw new Error('deploy_source_unverified');
  }
  if (checkoutSha.toLowerCase() !== remoteMainSha.toLowerCase()) {
    throw new Error('deploy_ref_not_current_main: checkout=' + checkoutSha.slice(0, 12)
      + ' current_main=' + remoteMainSha.slice(0, 12)
      + '; refresh the release checkout before deploying');
  }
  return checkoutSha.toLowerCase();
}
