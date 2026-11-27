import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureProjectDirectory, readProjectFile, sha256, writeJsonAtomic } from './paths.js';

function flatten(value, prefix = '', result = {}) {
  for (const [key, item] of Object.entries(value || {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, name, result);
    else result[name] = item;
  }
  return result;
}

function hexRgb(value) {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length === 3) hex = [...hex].map(char => char + char).join('');
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(rgb) {
  const channels = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const fg = hexRgb(foreground);
  const bg = hexRgb(background);
  if (!fg || !bg) return null;
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function cssName(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export async function buildDesignSystemPackage({ projectRoot, tokensPath, outputDir = '.agentsam/primetech/design-system', projectName = 'PrimeTech Design System' } = {}) {
  const source = await readProjectFile(projectRoot, tokensPath, 8 * 1024 * 1024);
  let tokens;
  try { tokens = JSON.parse(source.bytes.toString('utf8')); } catch { throw new Error('design_tokens_json_invalid'); }
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) throw new Error('design_tokens_object_required');
  const sections = ['colors', 'typography', 'spacing', 'radius', 'shadows', 'breakpoints'];
  const flat = {};
  for (const section of sections) {
    const values = tokens[section];
    if (values && (typeof values !== 'object' || Array.isArray(values))) throw new Error(`design_tokens_section_invalid:${section}`);
    Object.assign(flat, flatten(values || {}, section));
  }
  const cssLines = [':root {'];
  const warnings = [];
  const colors = flatten(tokens.colors || {});
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`design_token_color_invalid:${key}`);
    cssLines.push(`  --color-${cssName(key)}: ${value};`);
  }
  for (const section of ['spacing', 'radius', 'shadows', 'breakpoints']) {
    for (const [key, value] of Object.entries(flatten(tokens[section] || {}))) {
      const tokenName = key.slice(section.length + 1);
      if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`design_token_value_invalid:${key}`);
      cssLines.push(`  --${section}-${cssName(tokenName)}: ${value}${section === 'spacing' && typeof value === 'number' ? 'px' : ''};`);
    }
  }
  const typography = flatten(tokens.typography || {});
  for (const [key, value] of Object.entries(typography)) {
    if (typeof value !== 'string' && typeof value !== 'number' && !Array.isArray(value)) throw new Error(`design_token_typography_invalid:${key}`);
    const cssValue = Array.isArray(value) ? value.map(item => JSON.stringify(String(item))).join(', ') : value;
    cssLines.push(`  --type-${cssName(key)}: ${cssValue}${typeof value === 'number' && /size|line-height|tracking/i.test(key) ? 'px' : ''};`);
  }
  cssLines.push('}', '');
  if (tokens.contrastPairs !== undefined && !Array.isArray(tokens.contrastPairs)) throw new Error('design_tokens_contrast_pairs_invalid');
  for (const pair of tokens.contrastPairs || []) {
    const ratio = contrastRatio(pair.foreground, pair.background);
    if (ratio === null) warnings.push({ code: 'contrast_pair_unverifiable', pair });
    else if (ratio < (pair.minimum ?? 4.5)) warnings.push({ code: 'contrast_below_target', foreground: pair.foreground, background: pair.background, ratio: Number(ratio.toFixed(2)), minimum: pair.minimum ?? 4.5 });
  }
  const tailwind = {
    theme: { extend: {
      colors: tokens.colors || {},
      spacing: tokens.spacing || {},
      borderRadius: tokens.radius || {},
      boxShadow: tokens.shadows || {},
      fontFamily: tokens.typography?.fontFamily || {},
      fontSize: tokens.typography?.fontSize || {},
    } },
  };
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const cssPath = path.join(root, 'tokens.css');
  const jsonPath = path.join(root, 'tokens.normalized.json');
  const tailwindPath = path.join(root, 'tailwind.tokens.json');
  await fs.writeFile(cssPath, cssLines.join('\n'), { mode: 0o600 });
  await writeJsonAtomic(jsonPath, { schema: tokens.schema || 'agentsam.design-tokens.v1', ...tokens });
  await writeJsonAtomic(tailwindPath, tailwind);
  const manifest = {
    schema: 'agentsam.design-system-package.v1',
    projectName,
    source: { path: tokensPath, sha256: sha256(source.bytes), preserved: true },
    tokenCount: Object.keys(flat).length,
    sections: sections.filter(section => tokens[section] && Object.keys(tokens[section]).length),
    outputs: ['tokens.css', 'tokens.normalized.json', 'tailwind.tokens.json'],
    warnings,
    status: warnings.length ? 'review' : 'pass',
  };
  await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
  return { ok: true, status: manifest.status, outputDir: path.relative(projectRoot, root), tokenCount: manifest.tokenCount, warnings, cssPath: path.relative(projectRoot, cssPath), normalizedPath: path.relative(projectRoot, jsonPath), tailwindPath: path.relative(projectRoot, tailwindPath), manifestPath: path.relative(projectRoot, path.join(root, 'manifest.json')) };
}
