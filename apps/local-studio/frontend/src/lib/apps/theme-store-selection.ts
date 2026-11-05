/** Theme Store selection is an untrusted URL hint, never authorization. */
export function themeStoreTrySelection(input: {
  action?: unknown; theme_sku?: unknown; theme_version?: unknown;
}): { theme_sku: string; theme_version: string; action: 'try' } | null {
  if (input.action !== 'try' ||
      typeof input.theme_sku !== 'string' ||
      typeof input.theme_version !== 'string') return null;
  const sku = input.theme_sku;
  const version = input.theme_version;
  if (!/^iam\.theme\.[a-z][a-z0-9-]{0,63}$/.test(sku) ||
      !/^\d+\.\d+\.\d+$/.test(version)) return null;
  return { theme_sku: sku, theme_version: version, action: 'try' };
}
