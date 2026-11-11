import manifest from '../agentsam.embeds.json' with { type: 'json' };

const KEY = /^[a-z][a-z0-9_]{0,63}$/;
export const embedManifest = manifest;
export const listEmbeds = () => structuredClone(manifest.storefront_embeds);
export const getEmbed = (key) => listEmbeds().find((e) => e.key === key) || null;

/** Returns a list of problems; empty means the embed is installable by the CMS catalog. */
export function validateEmbed(e) {
  const out = [];
  if (!e || !KEY.test(e.key || '')) out.push('invalid key');
  if (!e?.name) out.push('missing name');
  if (!e?.default_config || typeof e.default_config !== 'object') out.push('missing default_config');
  if (!Array.isArray(e?.surfaces) || !e.surfaces.some((s) => s === 'storefront_embed' || s === 'cms_block')) out.push('missing surface');
  const cfg = e?.default_config || {};
  for (const field of e?.editor_fields || []) {
    if (!field.key || !field.label || !field.type) out.push('editor field incomplete: ' + field.key);
    else if (!(field.key in cfg)) out.push('editor field has no default: ' + field.key);
  }
  return out;
}
