import type { ComponentType, ReactNode } from 'react';

/**
 * The CMS section host is a structural boundary, never a theme.
 * All data is supplied from the authorized, site-owned CMS composition.
 * All renderer implementations must correspond to an installed verified
 * cms_components.renderer_key + cms_definitions row. This package does not
 * query D1, load arbitrary code, or invent a default visual layout.
 */
export type CmsRenderMode = 'editor' | 'preview' | 'published';
export type CmsViewport = 'phone' | 'tablet' | 'desktop';
export type CmsDefinitionKind = 'section' | 'block';

export interface CmsDefinitionRecord {
  id: string;
  definition_key: string;
  version: string | number;
  kind: CmsDefinitionKind;
  status: string;
}
export interface CmsComponentRecord {
  definition_id: string;
  renderer_key: string;
  implementation_status: string;
}
export interface CmsBlockInstance {
  id: string;
  definitionKey: string;
  definitionVersion: string | number;
  rendererKey: string;
  visible?: boolean;
  settings: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  children?: CmsBlockInstance[];
}
export interface CmsSectionInstance {
  id: string;
  definitionKey: string;
  definitionVersion: string | number;
  rendererKey: string;
  visible?: boolean;
  settings: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  blocks?: CmsBlockInstance[];
}
export interface CmsRenderContext {
  mode: CmsRenderMode;
  viewport: CmsViewport;
  /** The binding resolver is the trusted host; section implementation may consume, never mutate it. */
  bindings: Readonly<Record<string, unknown>>;
}
export interface CmsBlockRendererProps {
  block: CmsBlockInstance;
  context: CmsRenderContext;
  renderChildren: () => ReactNode;
}
export interface CmsSectionRendererProps {
  section: CmsSectionInstance;
  context: CmsRenderContext;
  renderBlocks: () => ReactNode;
}
export type CmsRendererImplementations = Record<string,
  ComponentType<CmsSectionRendererProps> | ComponentType<CmsBlockRendererProps>>;
export type CmsVerifiedRenderer =
  | {kind:'section'; component:ComponentType<CmsSectionRendererProps>}
  | {kind:'block'; component:ComponentType<CmsBlockRendererProps>};

export interface CmsRendererRegistry {
  resolve(instance: {definitionKey:string; definitionVersion:string|number; rendererKey:string},
    kind:CmsDefinitionKind): CmsVerifiedRenderer;
  keys(): string[];
}
const VALID_RENDERER_KEY = /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,159}$/;
function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

/** No "verified=true" caller shortcut: verify the real component/definition join. */
export function createCmsRendererRegistry(
  definitions: readonly CmsDefinitionRecord[],
  components: readonly CmsComponentRecord[],
  implementations: CmsRendererImplementations
): CmsRendererRegistry {
  const byId = new Map<string,CmsDefinitionRecord>();
  for (const row of definitions) {
    assert(row?.id && row?.definition_key && row.version != null, 'cms_definition_invalid');
    assert(!byId.has(row.id), 'cms_definition_duplicate');
    byId.set(row.id, row);
  }
  const verified = new Map<string,{definition:CmsDefinitionRecord; implementation:ComponentType<any>}>();
  for (const record of components) {
    if (record.implementation_status !== 'verified') continue;
    assert(VALID_RENDERER_KEY.test(record.renderer_key), 'cms_renderer_key_invalid');
    const definition = byId.get(record.definition_id);
    // Orphaned/disabled records cannot become executable renderer registrations.
    if (!definition || definition.status !== 'active' ||
        !['section','block'].includes(definition.kind)) continue;
    const implementation = Object.hasOwn(implementations,record.renderer_key)
      ? implementations[record.renderer_key] : undefined;
    if (!implementation) continue;
    assert(!verified.has(record.renderer_key), 'cms_renderer_key_collision');
    verified.set(record.renderer_key,{definition,implementation});
  }
  return Object.freeze({
    resolve(instance, kind) {
      const row = verified.get(instance.rendererKey);
      assert(row, 'cms_renderer_unavailable:' + instance.rendererKey);
      assert(row.definition.kind === kind, 'cms_renderer_kind_mismatch');
      assert(row.definition.definition_key === instance.definitionKey,
        'cms_renderer_definition_mismatch');
      assert(String(row.definition.version) === String(instance.definitionVersion),
        'cms_renderer_version_mismatch');
      return {kind,component:row.implementation} as CmsVerifiedRenderer;
    },
    keys() {return [...verified.keys()];}
  });
}

export interface CmsSectionActions {
  select?: (sectionId:string)=>void;
  move?: (sectionId:string,direction:-1|1)=>void;
  toggle?: (sectionId:string,visible:boolean)=>void;
  duplicate?: (sectionId:string)=>void;
  remove?: (sectionId:string)=>void;
}
export interface CmsSectionHostProps {
  section: CmsSectionInstance;
  registry: CmsRendererRegistry;
  mode: CmsRenderMode;
  viewport: CmsViewport;
  selected?: boolean;
  actions?: CmsSectionActions;
}
function CmsBlockHost({block,registry,context}:{
  block:CmsBlockInstance; registry:CmsRendererRegistry; context:CmsRenderContext
}) {
  if(block.visible === false) return null;
  const found = registry.resolve(block,'block');
  assert(found.kind === 'block','cms_renderer_kind_mismatch');
  const Impl = found.component;
  return <Impl block={block} context={context} renderChildren={() =>
    (block.children || []).map(child =>
      <CmsBlockHost key={child.id} block={child} registry={registry} context={context}/>
    )
  }/>;
}
function CmsSectionControls({section,selected,actions}:{
  section:CmsSectionInstance;selected?:boolean;actions?:CmsSectionActions
}) {
  if (!actions) return null;
  return <div data-cms-editor-controls={section.id} role="group"
    aria-label={'Section controls: ' + section.definitionKey}>
    {actions.select && <button type="button" aria-pressed={Boolean(selected)}
      onClick={()=>actions.select?.(section.id)}>Select section</button>}
    {actions.move && <>
      <button type="button" aria-label="Move section up"
        onClick={()=>actions.move?.(section.id,-1)}>Move up</button>
      <button type="button" aria-label="Move section down"
        onClick={()=>actions.move?.(section.id,1)}>Move down</button>
    </>}
    {actions.toggle && <button type="button"
      onClick={()=>actions.toggle?.(section.id,section.visible===false)}>
      {section.visible===false ? 'Show section' : 'Hide section'}</button>}
    {actions.duplicate && <button type="button"
      onClick={()=>actions.duplicate?.(section.id)}>Duplicate</button>}
    {actions.remove && <button type="button"
      onClick={()=>actions.remove?.(section.id)}>Remove</button>}
  </div>;
}
/**
 * No title, CTA, media, grids, style tokens, scroll listeners or theme CSS.
 * An unverified renderer is an editor diagnostic and a hard preview/publish error.
 */
export function CmsSectionHost({section,registry,mode,viewport,selected,actions}:CmsSectionHostProps) {
  const controls = mode === 'editor'
    ? <CmsSectionControls section={section} selected={selected} actions={actions}/>
    : null;
  if (section.visible === false) {
    return mode === 'editor' ? <section data-cms-section={section.id}
      data-cms-hidden="true" data-cms-viewport={viewport}>
      {controls}
      <span>Hidden section: {section.definitionKey}</span>
    </section> : null;
  }
  let Renderer:ComponentType<CmsSectionRendererProps>;
  try {
    const resolved = registry.resolve(section,'section');
    assert(resolved.kind === 'section','cms_renderer_kind_mismatch');
    Renderer = resolved.component;
  } catch(error) {
    if (mode !== 'editor') throw error;
    return <section data-cms-section={section.id} data-cms-renderer-error="true"
      data-cms-viewport={viewport}>
      {controls}
      <p role="status">Renderer unavailable for {section.definitionKey}: {
        error instanceof Error ? error.message : 'cms_renderer_unavailable'
      }</p>
    </section>;
  }
  const context:CmsRenderContext = {
    mode,viewport,bindings:section.bindings ?? {}
  };
  return <section data-cms-section={section.id}
    data-cms-renderer={section.rendererKey}
    data-cms-definition={section.definitionKey}
    data-cms-viewport={viewport}
    data-cms-selected={mode==='editor' && selected ? 'true' : undefined}>
    {controls}
    <Renderer section={section} context={context} renderBlocks={() =>
      (section.blocks || []).map(block =>
        <CmsBlockHost key={block.id} block={block} registry={registry} context={context}/>
      )
    }/>
  </section>;
}
