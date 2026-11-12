/**
 * Canonical app identity for one account navigation projection.
 * The host's built-ins win over optional plugin aliases; no duplicate product
 * is produced when one installation is registered under multiple keys.
 * Display labels are used only as a last-resort identity for the *same* app
 * and never mutate the installation record or its permissions.
 */
/** @param {Array<Record<string, any>>} entries */
export function dedupeAppNavigation(entries) {
  const result = [];
  const seenIds = new Set();
  const seenUrls = new Set();
  const seenLabels = new Set();
  for (const app of Array.isArray(entries) ? entries : []) {
    if (!app || typeof app !== 'object') continue;
    const id = String(app.id || '').trim().toLowerCase();
    const urls = [app.href, ...(Array.isArray(app.aliases) ? app.aliases : [])]
      .filter(value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//'))
      .map(value => value.trim().replace(/\/$/, '').toLowerCase());
    const label = String(app.label || app.name || '').trim().toLowerCase();
    if ((id && seenIds.has(id)) || urls.some(url => seenUrls.has(url)) ||
        (label && seenLabels.has(label))) continue;
    result.push(app);
    if (id) seenIds.add(id);
    if (label) seenLabels.add(label);
    for (const url of urls) seenUrls.add(url);
  }
  return result;
}
