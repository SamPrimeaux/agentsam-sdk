/**
 * Canonical slash invocation parser.
 * Normalize to lowercase kebab at write/parse time; never LOWER() DB columns on lookup.
 */

/**
 * @param {unknown} message
 * @returns {{ trigger: string, args: string } | null}
 */
export function parseSlashInvocation(message) {
  const raw = String(message ?? '').trim();
  if (!raw.startsWith('/')) return null;

  const match = raw.match(/^\/([a-zA-Z0-9][a-zA-Z0-9-]{0,63})(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  return {
    trigger: `/${match[1].toLowerCase()}`,
    args: String(match[2] ?? '').trim(),
  };
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function canonicalizeSlashTrigger(raw) {
  let value = String(raw ?? '').trim().toLowerCase();
  if (!value) throw new Error('slash_trigger_required');
  if (!value.startsWith('/')) value = `/${value}`;
  value = value.replace(/_/g, '-');
  if (!/^\/[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`invalid_slash_trigger:${value}`);
  }
  return value;
}

/**
 * Prose must never trigger skill lookup.
 * @param {unknown} message
 */
export function isExplicitSlashMessage(message) {
  return parseSlashInvocation(message) != null;
}
