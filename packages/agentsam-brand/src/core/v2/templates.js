/**
 * Uniform brand pack templates — orchestrated starter graphs per build type.
 */
import { createEmptyBrandPack, normalizeBrandPack } from './schema.js';
import { defaultLogoUsage } from './derivatives-semantic.js';

export const BRAND_TEMPLATES = Object.freeze({
  'web-app': {
    id: 'web-app',
    label: 'Web / PWA app',
    description: 'Logo, favicon+PWA icons, OG card, color+type tokens, web delivery',
    required_roles: ['logo.primary', 'favicon', 'social.og'],
    optional_roles: ['icon.app', 'hero.landscape', 'type.body'],
    delivery: { images: 'cloudflare-images', video: 'cloudflare-stream', objects: 'r2', policy: 'role_canonical' },
    platforms: { web: { enabled: true }, pwa: { enabled: true } },
  },
  'mobile-app': {
    id: 'mobile-app',
    label: 'Mobile app (iOS + Android)',
    description: 'App icons, splash/poster, logo mark, store screenshots',
    required_roles: ['icon.app', 'icon.ios', 'icon.android', 'logo.mark'],
    optional_roles: ['product.marketing', 'hero.poster'],
    delivery: { images: 'cloudflare-images', objects: 'r2', policy: 'role_canonical' },
    platforms: { ios: { enabled: true }, android: { enabled: true } },
  },
  'marketing-site': {
    id: 'marketing-site',
    label: 'Marketing site',
    description: 'Logo system, heroes, social, motion loop, tokens, guidelines',
    required_roles: ['logo.primary', 'logo.mark', 'hero.landscape', 'hero.mobile', 'social.og'],
    optional_roles: ['motion.loop', 'motion.hero', 'type.display', 'type.body'],
    delivery: { images: 'cloudflare-images', video: 'cloudflare-stream', objects: 'r2', policy: 'role_canonical' },
    platforms: { web: { enabled: true } },
  },
  'product-saas': {
    id: 'product-saas',
    label: 'SaaS product brand',
    description: 'Full product visual system: UI shots, icons, tokens, docs',
    required_roles: ['logo.primary', 'favicon', 'icon.app', 'product.raw', 'social.og', 'token.color'],
    optional_roles: ['product.framed', 'hero.product', 'type.ui', 'model.product'],
    delivery: { images: 'cloudflare-images', video: 'cloudflare-stream', objects: 'r2', policy: 'role_canonical' },
    platforms: { web: { enabled: true }, pwa: { enabled: true }, macos: { enabled: true } },
  },
  'spatial-3d': {
    id: 'spatial-3d',
    label: 'Spatial / 3D brand',
    description: 'GLB/USDZ models, posters, turntable stubs, AR export',
    required_roles: ['model.product', 'model.ar', 'logo.mark'],
    optional_roles: ['hero.product', 'motion.hero'],
    delivery: { objects: 'r2', images: 'cloudflare-images', policy: 'role_canonical' },
    platforms: { web: { enabled: true } },
  },
});

export function listBrandTemplates() {
  return Object.values(BRAND_TEMPLATES);
}

export function getBrandTemplate(id) {
  return BRAND_TEMPLATES[String(id || '').trim()] || null;
}

/**
 * Seed or merge a template onto a pack (does not invent binary assets).
 */
export function applyBrandTemplate(packInput, templateId) {
  const template = getBrandTemplate(templateId);
  if (!template) return normalizeBrandPack(packInput);

  const pack = normalizeBrandPack(packInput);
  pack.delivery = { ...pack.delivery, ...template.delivery };
  pack.platforms = { ...pack.platforms, ...template.platforms };
  pack.rules.template = {
    id: template.id,
    required_roles: template.required_roles,
    optional_roles: template.optional_roles,
  };

  const have = new Set(pack.assets.map((a) => a.role));
  for (const role of template.required_roles) {
    if (!have.has(role)) {
      pack.assets.push({
        id: `placeholder_${role.replace(/\./g, '_')}`,
        role,
        family: role.split('.')[0],
        label: `${role} (required by ${template.id})`,
        master: null,
        variants: { master: null, raster_fallbacks: [], delivery: [], platform: [] },
        derivatives: [],
        usage: role.startsWith('logo.') ? defaultLogoUsage(role) : null,
        provenance: { placeholder: true, template: template.id },
      });
    }
  }

  pack.validation = pack.validation || { warnings: [], errors: [] };
  const missing = template.required_roles.filter((r) => {
    const asset = pack.assets.find((a) => a.role === r);
    return !asset?.master?.path && !asset?.master?.compiled;
  });
  for (const role of missing) {
    pack.validation.warnings.push({
      code: 'template_role_unfilled',
      role,
      message: `Template ${template.id} requires ${role} — ingest a master`,
    });
  }

  return pack;
}

export function createPackFromTemplate(templateId, { brandId, brandName } = {}) {
  return applyBrandTemplate(createEmptyBrandPack({ brandId, brandName }), templateId);
}
