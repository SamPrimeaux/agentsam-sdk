/**
 * Map immutable AgentSam source identity to a Cloudflare Durable Object /
 * Container instance name. A new source generation must receive a new instance
 * so rollout traffic cannot attach to a container process from an older image.
 */
export function runtimeInstanceKey(source) {
  const clean = String(source || 'unversioned')
    .replace(/[^a-zA-Z0-9._:@/-]+/g, '-')
    .slice(0, 180);
  return 'runtime:' + clean;
}
