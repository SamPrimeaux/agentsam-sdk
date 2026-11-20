/**
 * Adapters to the existing AgentSam CMS composition/artifact contracts.
 * These functions never write D1/R2; the CMS remains the persistence owner.
 */
import packageInfo from '../../package.json' with { type: 'json' };
import { compilePage, validatePageContent } from '../index.js';
import { CMS_SCENE_CONTENT_SCHEMA, ThemeScenesSections } from './runtime.js';

export const CMS_SCENE_SECTION_SCHEMA = CMS_SCENE_CONTENT_SCHEMA;
export const CMS_SCENE_PAGE_SCHEMA = 'agentsam.cms.scene-page.v1';
export const CMS_SCENE_ARTIFACT_SCHEMA = 'agentsam.cms.scene-artifact.v1';

const clone = (value) => structuredClone(value);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const fail = (code, details) => ({ ok: false, error: code, ...(details ? { details } : {}) });

function validateSceneSection(section) {
  const result = validatePageContent({
    id: 'cms-scene-section-validation',
    theme: 'foundation',
    sections: [section],
  });
  return result.ok ? { ok: true, warnings: result.warnings } : fail('cms_scene_section_invalid', result.errors);
}

export function createCmsSceneSection(sceneSection, {
  id = sceneSection?.id,
  key = sceneSection?.id,
  order = 0,
  status = 'draft',
} = {}) {
  if (!object(sceneSection)) throw new Error('cms_scene_section_required');
  const validation = validateSceneSection(sceneSection);
  if (!validation.ok) throw new Error(validation.error);
  const definition = ThemeScenesSections.definitionForScene(sceneSection.scene);
  if (!definition) throw new Error('cms_scene_kind_not_registered');
  const content = ThemeScenesSections.defaults(definition.id);
  content.sceneDefinition = clone(sceneSection);
  content.scrollMode = sceneSection.scroll?.mode || definition.defaultScroll;
  if (sceneSection.sceneDocument?.ref) content.sceneDocumentUrl = sceneSection.sceneDocument.ref;
  if (sceneSection.sceneDocument?.alt) content.sceneDocumentAlt = sceneSection.sceneDocument.alt;
  if (sceneSection.sceneAnimation?.id) content.sceneAnimationId = sceneSection.sceneAnimation.id;
  if (sceneSection.sceneAnimation?.playback) content.sceneAnimationPlayback = sceneSection.sceneAnimation.playback;
  if (sceneSection.theme?.surface) content.surfaceTone = sceneSection.theme.surface;
  if (sceneSection.visual) content.visual = sceneSection.visual;
  if (sceneSection.demo) content.demoAdapter = sceneSection.demo;
  content.__editor = {
    ...content.__editor,
    catalogSku: definition.sku,
    definitionKey: definition.definitionKey,
    definitionVersion: definition.definitionVersion,
  };
  const runtimeValidation = ThemeScenesSections.validate(definition.id, content);
  if (!runtimeValidation.ok) throw new Error(runtimeValidation.error || 'cms_scene_content_invalid');
  return {
    id: id || key,
    key: key || id,
    type: 'section',
    order: Number.isFinite(order) ? order : 0,
    status,
    templateSku: definition.sku,
    definitionId: definition.definitionId,
    rendererKey: definition.rendererKey,
    settings: content,
    metadata: {
      source: 'theme-scenes-package',
      packageName: packageInfo.name,
      packageVersion: packageInfo.version,
      sceneKind: sceneSection.scene,
      rendererKey: definition.rendererKey,
    },
    blocks: [],
  };
}

export function readCmsSceneSection(section) {
  const settings = section?.settings || section?.inline_content_json || section?.content || null;
  if (!object(settings)) return fail('cms_scene_section_content_missing');
  if (settings.schema !== CMS_SCENE_SECTION_SCHEMA) return fail('cms_scene_section_schema_invalid');
  const rendererKey = settings.__editor?.themePreset || section?.rendererKey || section?.renderer_key;
  const definition = ThemeScenesSections.get(rendererKey);
  if (!definition) return fail('cms_scene_renderer_unavailable');
  const validation = ThemeScenesSections.validate(rendererKey, settings);
  if (!validation.ok) return fail('cms_scene_section_content_invalid', validation.error);
  const sceneDefinition = settings.sceneDefinition;
  if (!object(sceneDefinition) || sceneDefinition.scene !== definition.sceneKind) {
    return fail('cms_scene_definition_mismatch');
  }
  return { ok: true, scene: clone(sceneDefinition), rendererKey, content: clone(settings) };
}

export function createCmsScenePage(page, {
  siteId,
  status = page?.status || 'draft',
  templateKey = 'theme-scenes',
} = {}) {
  const validation = validatePageContent(page);
  if (!validation.ok) throw new Error('cms_scene_page_invalid');
  if (typeof siteId !== 'string' || !siteId.trim()) throw new Error('cms_scene_site_required');
  const sections = page.sections.map((section, index) => createCmsSceneSection(section, {
    id: section.id,
    key: section.id,
    order: index * 10,
    status: 'draft',
  }));
  return {
    authority: 'cms_d1_installed',
    revision: 'draft',
    page: {
      id: page.id,
      siteId,
      slug: page.slug || page.id,
      title: page.title || page.id,
      pageType: 'scene',
      templateKey,
      status,
      metadata: {
        schema: CMS_SCENE_PAGE_SCHEMA,
        packageName: packageInfo.name,
        packageVersion: packageInfo.version,
        theme: page.theme || 'foundation',
        shell: page.shell || null,
        routes: page.routes || {},
        seo: page.seo || null,
      },
    },
    sections: sections.map((section) => ({
      id: section.id,
      key: section.key,
      type: section.type,
      order: section.order,
      status: section.status,
      settings: section.settings,
      contentObjectKey: null,
      contentVersion: 0,
      metadata: section.metadata,
      templateSku: section.templateSku,
      definitionId: section.definitionId,
      rendererKey: section.rendererKey,
      blocks: [],
    })),
  };
}

export function readCmsScenePage(composition) {
  const page = composition?.page;
  const metadata = page?.metadata || {};
  if (!page || page.pageType !== 'scene' || metadata.schema !== CMS_SCENE_PAGE_SCHEMA) {
    return fail('cms_scene_page_contract_invalid');
  }
  const sections = [];
  for (const section of composition.sections || []) {
    const read = readCmsSceneSection(section);
    if (!read.ok) return read;
    sections.push(read.scene);
  }
  const scenePage = {
    id: page.slug || page.id,
    theme: metadata.theme || 'foundation',
    shell: metadata.shell || null,
    routes: metadata.routes || {},
    seo: metadata.seo || null,
    sections,
  };
  const validation = validatePageContent(scenePage);
  if (!validation.ok) return fail('cms_scene_page_content_invalid', validation.errors);
  return { ok: true, page: scenePage };
}

export function compileCmsScenePage(composition, options = {}) {
  const read = readCmsScenePage(composition);
  if (!read.ok) throw new Error(read.error);
  return compilePage(read.page, options);
}

export function createCmsSceneArtifactManifest({
  artifactKey,
  version = packageInfo.version,
  page,
  metadata = {},
} = {}) {
  if (typeof artifactKey !== 'string' || !/^[a-z0-9][a-z0-9._/-]{1,119}$/i.test(artifactKey)) {
    throw new Error('cms_scene_artifact_key_invalid');
  }
  if (typeof version !== 'string' || !version.trim()) throw new Error('cms_scene_artifact_version_required');
  const validation = validatePageContent(page);
  if (!validation.ok) throw new Error('cms_scene_artifact_content_invalid');
  // Portable scene artifacts intentionally exclude tenant/site identity.
  if (['accountId', 'account_id', 'siteId', 'site_id'].some((key) => page?.[key] != null)) {
    throw new Error('cms_scene_artifact_must_be_site_independent');
  }
  return {
    schema: CMS_SCENE_ARTIFACT_SCHEMA,
    artifact_key: artifactKey,
    artifact_type: 'scene',
    content_mode: 'scene',
    version,
    source_kind: 'package',
    source_ref: `${packageInfo.name}@${packageInfo.version}`,
    package: { name: packageInfo.name, version: packageInfo.version },
    content: {
      schema: CMS_SCENE_PAGE_SCHEMA,
      page: clone(page),
    },
    metadata: {
      portable: true,
      siteIndependent: true,
      sceneKinds: [...new Set(page.sections.map((section) => section.scene))],
      ...clone(metadata),
    },
  };
}

export function validateCmsSceneArtifactManifest(manifest) {
  if (!object(manifest) || manifest.schema !== CMS_SCENE_ARTIFACT_SCHEMA ||
      manifest.artifact_type !== 'scene' || manifest.content_mode !== 'scene') {
    return fail('cms_scene_artifact_contract_invalid');
  }
  if (manifest.package?.name !== packageInfo.name || !manifest.package?.version) {
    return fail('cms_scene_artifact_package_invalid');
  }
  if (typeof manifest.artifact_key !== 'string' || typeof manifest.version !== 'string') {
    return fail('cms_scene_artifact_identity_invalid');
  }
  const page = manifest.content?.page;
  if (!object(page) || ['accountId', 'account_id', 'siteId', 'site_id'].some((key) => page[key] != null)) {
    return fail('cms_scene_artifact_site_scope_invalid');
  }
  const validation = validatePageContent(page);
  if (!validation.ok) return fail('cms_scene_artifact_content_invalid', validation.errors);
  return { ok: true, warnings: validation.warnings };
}
