import { comparePaths } from './hash.js';

export const DEFAULT_IGNORES = Object.freeze([
  '.git', 'node_modules', 'dist', '.DS_Store', '.agentsam/cache', '.agentsam/merkle', '.agentsam/merkle.json',
]);
export function validPath(value, allowRoot = false) {
  return typeof value === 'string' && ((allowRoot && value === '') || (value.length > 0 &&
    !value.includes('\\') && !value.includes('\0') && !/^[a-z]:/i.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')));
}
export function normalizePolicy({ include = [], exclude = [] } = {}) {
  if (!Array.isArray(include) || !Array.isArray(exclude)) throw new Error('Ignore policy must contain include/exclude arrays.');
  for (const rule of [...include, ...exclude]) if (!validPath(rule)) throw new Error(`Invalid ignore rule: ${JSON.stringify(rule)}`);
  for (const rule of include) if (!DEFAULT_IGNORES.includes(rule)) throw new Error(`--include must name a default ignore: ${DEFAULT_IGNORES.join(', ')}`);
  return { include: [...new Set(include)].sort(comparePaths), exclude: [...new Set(exclude)].sort(comparePaths) };
}
export function isIgnored(relative, policy) {
  const rules = [...DEFAULT_IGNORES.filter((rule) => !policy.include.includes(rule)), ...policy.exclude];
  return rules.some((rule) => rule.includes('/')
    ? relative === rule || relative.startsWith(rule + '/')
    : relative.split('/').includes(rule));
}
