/**
 * Accepted generated sections use the existing CMS spine: D1 definitions,
 * artifacts and page-section instances, immutable R2 implementations and
 * the legacy private page-section pointer used by the FNF renderer.
 *
 * Execution policy v1: safe, scoped HTML/CSS only. Generated JavaScript is
 * rejected rather than executed in the merchant storefront.
 */
import { acceptGeneratedBlock, nsForms, resolveUidToken } from "../../frontend/static/js/generation-namespace.mjs";
import { normalizeSettingFields, settingCssValue } from "../../frontend/static/js/generated-settings-schema.mjs";
import { readR2Json, writeR2Json } from "./r2-store.js";

const KEY = /^[a-z][a-z0-9-]{1,39}$/;
const FIELD = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const TAG = /<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi;
const SAFE_TAGS = new Set(["section","div","article","header","h1","h2","h3","h4","h5","h6","p","span","small","strong","em","ul","ol","li","a","img","figure","figcaption","br"]);
const SAFE_ATTRS = new Set(["class","id","href","src","alt","title","loading","role","data-agentsam-block","data-cms","data-cms-attr"]);
const sha256 = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");

export function inspectGeneratedSection(record, sectionKey = "preview-section") {
  const definition = record?.definition || {};
  const type = String(definition.type || "");
  if (definition.kind !== "section" || !KEY.test(type)) return { error:"A semantic section type is required", status:422 };
  const settings = record?.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings) || !Object.keys(settings).length) {
    return { error:"At least one editable setting is required", status:422 };
  }
  let fields, values;
  try {
    const normalized=normalizeSettingFields(definition.settings,settings);
    fields=normalized.fields;values=normalized.settings;
  }catch(error){return {error:error.message,status:422};}
  if (record?.implementation_class && record.implementation_class !== 'artifact_static') {
    return {error:'Only artifact_static sections may enter the static artifact acceptance lane',status:422};
  }
  if (definition.implementation_class && definition.implementation_class !== 'artifact_static') {
    return {error:'Native primitives require no generated artifact; interactive artifacts need a separate gated runtime',status:422};
  }
  const canonical = record?.canonical || {};
  const html = String(canonical.html || "");
  const css = String(canonical.css || "");
  const js = String(canonical.js || "");
  if (!html || html.length > 50000 || css.length > 30000 || js.trim()) {
    return { error:"Only bounded, script-free HTML/CSS sections can be installed", status:422 };
  }
  if (/<!--|<!doctype|<\?|&\#(?:x0*3c|0*60);/i.test(html) ||
      /(?:on[a-z]+|style|srcdoc|formaction|xmlns)\s*=/i.test(html) ||
      /(?:javascript:|data:|vbscript:)/i.test(html)) {
    return { error:"Unsafe generated markup", status:422 };
  }
  let cleaned;
  try {
    cleaned = html.replace(TAG, (full, tag, raw) => {
    if (!SAFE_TAGS.has(tag)) throw new Error("Unsupported generated HTML element: " + tag);
    if (full.startsWith("</")) return "";
    const matched = raw.replace(/\s+([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_,key,a,b) => {
      const value = a ?? b;
      if (!SAFE_ATTRS.has(key) && !/^aria-[a-z-]+$/.test(key)) throw new Error("Unsupported HTML attribute: " + key);
      if ((key === "href" || key === "src") && !/^(?:\/(?!\/)|#)/.test(value)) throw new Error("External media/links are not allowed");
      if (key === "data-cms" && !Object.hasOwn(fields, value)) throw new Error("Uneditable generated setting: " + value);
      if (key === "data-cms-attr" && !["href","src","alt","title","textContent"].includes(value)) throw new Error("Unsupported CMS binding");
      return "";
    }).replace(/\s|\//g,"");
    if (matched) throw new Error("Malformed generated markup attributes");
    return "";
    });
  } catch (error) {
    return { error:error.message || "Unsafe generated markup",status:422 };
  }
  if (cleaned.includes("<") || cleaned.includes(">")) return { error:"Invalid generated HTML", status:422 };
  if (!html.includes('data-agentsam-block="__UID__"')) return { error:"Missing section scope", status:422 };
  for (const [key,field] of Object.entries(fields)) {
    if (field.binding==='style') {
      if (!css.includes('var(--__UID__-setting-' + key + ')'))
        return {error:'Generated visual setting has no scoped CSS variable binding: '+key,status:422};
    } else if (!html.includes('data-cms="' + key + '"')) {
      return { error:'Generated setting has no editable markup binding: ' + key, status:422 };
    }
  }
  if (/@|url\s*\(|expression\s*\(|:has\s*\(|!important|position\s*:\s*fixed/i.test(css)) {
    return { error:"Unsupported or unsafe generated CSS", status:422 };
  }
  const forms = nsForms(sectionKey);
  // The UID names classes and ids, while the wrapper uses the stable CMS
  // section identity. Resolve these separately before applying the shared lint.
  const scopedHtml = html.replaceAll('data-agentsam-block="__UID__"',
    'data-agentsam-block="' + forms.blockId + '"');
  const scopedCss = css.replaceAll('[data-agentsam-block="__UID__"]',
    '[data-agentsam-block="' + forms.blockId + '"]');
  const accepted = acceptGeneratedBlock({html:scopedHtml,css:scopedCss,js:""}, {blockId:sectionKey,namespace:"agentsam"});
  if (!accepted.ok) return { error:accepted.error,status:422 };
  const scoped = '[data-agentsam-block="' + forms.blockId + '"]';
  return { ok:true,type,fields,settings:values,canonical:{html,css,js:""},
    definition:{kind:"section",type,label:String(definition.label || type).slice(0,100),
      implementation_class:'artifact_static',settings:fields} };
}

/** Resolve an immutable static artifact for one placed CMS instance.
 * The artifact never changes with merchant values. Content bindings retain
 * the existing edge hydration authority; visual bindings become typed CSS
 * custom properties rooted under THIS instance, not a global stylesheet.
 */
export function materializeGeneratedStatic(record,{instanceId,sectionKey}={}) {
  if(!instanceId||!sectionKey)throw Error('Placed section instanceId and sectionKey are required');
  const checked=inspectGeneratedSection(record,instanceId);
  if(!checked.ok)throw Error(checked.error);
  const forms=nsForms(instanceId,'agentsam');
  const root='data-agentsam-block="__UID__"';
  const placed='data-agentsam-block="'+forms.blockId+'"';
  let html=resolveUidToken(checked.canonical.html.replaceAll(root,placed),forms.blockId,'agentsam');
  const css=resolveUidToken(checked.canonical.css.replaceAll('[data-agentsam-block="__UID__"]',forms.scope),forms.blockId,'agentsam');
  // Existing edge HTMLRewriter expects `section_key.field` paths.
  for(const [key,field] of Object.entries(checked.fields))if(field.binding==='content')
    html=html.replaceAll('data-cms="'+key+'"','data-cms="'+sectionKey+'.'+key+'"');
  const bindings=Object.entries(checked.fields).filter(([,field])=>field.binding==='style')
    .map(([key,field])=>forms.settingVarPrefix+key+': '+settingCssValue(checked.settings[key],field)+';');
  const variables=bindings.length?forms.scope+' { '+bindings.join(' ')+' }\n':'';
  const resolved={html,css:variables+css,js:''};
  const inspected=acceptGeneratedBlock({html,css:variables+css,js:''},{instanceId,namespace:'agentsam'});
  if(!inspected.ok)throw Error('Materialized CSS failed the shared scope contract: '+inspected.error);
  return resolved;
}

export async function persistGeneratedImplementation(env, accountId, record, sectionKey, provenance = {}) {
  const checked = inspectGeneratedSection(record,sectionKey);
  if (!checked.ok) return checked;
  if (!env.WEBSITE_ASSETS) return {error:"R2 is not bound",status:503};
  // The implementation identity includes the semantic contract, but NOT
  // instance setting values or a presentation-only label.
  const manifest = { schema:"cms.generated-implementation.v1",canonical:checked.canonical,
    definition:{kind:"section",type:checked.type},fields:checked.fields };
  const digest = await sha256(JSON.stringify(manifest));
  const artifactId = "cmsa_" + digest.slice(0,24);
  const version = digest.slice(0,16);
  const prefix = "cms/artifacts/section/" + digest + "/";
  const key = prefix + "manifest.json";
  // Content addressing avoids overwriting another version or merchant's original.
  const prior = await readR2Json(env,key);
  if (prior && JSON.stringify(prior) !== JSON.stringify(manifest)) return {error:"Immutable artifact collision",status:409};
  if (!prior) await writeR2Json(env,key,manifest);
  const stored = await readR2Json(env,key);
  if (!stored || JSON.stringify(stored) !== JSON.stringify(manifest)) return {error:"R2 artifact verification failed",status:502};
  const meta = JSON.stringify({generator:"agentsam",namespace:"agentsam",
    generation_id:String(provenance.generation_id||provenance.generationId||'').slice(0,128),
    source_agent:String(provenance.source_agent||provenance.sourceAgent||'').slice(0,128),
    provider:String(provenance.provider||"").slice(0,80),model:String(provenance.model||"").slice(0,120),
    prompt_hash:String(provenance.prompt_hash||provenance.promptHash||'').slice(0,128),
    source_ref:String(provenance.source_ref||provenance.sourceRef||'').slice(0,300),
    normalized_by:String(provenance.normalized_by||provenance.normalizedBy||'agentsam').slice(0,128),
    created_at:provenance.created_at||new Date().toISOString(),implementation_class:'artifact_static'});
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO cms_artifacts (id,account_id,artifact_key,artifact_type,version,r2_prefix,manifest_r2_key,content_hash,content_mode,status,source_kind,source_ref,metadata_json)
      VALUES (?,? ,?,'section',?,?,?,?,'component','ready','generator','code.generate',?)
      ON CONFLICT(account_id,artifact_key,version) DO NOTHING`)
      .bind(artifactId,accountId,"section/"+digest,version,prefix,key,digest,meta),
    env.DB.prepare(`INSERT INTO cms_definitions (account_id,definition_key,kind,label,category,origin,version,artifact_id,settings_schema_json,allowed_blocks_json,metadata_json,status)
      VALUES (?,?,'section',?,'Generated','generated',?, ?,?,'[]',?,'active')
      ON CONFLICT(account_id,kind,definition_key,version) DO NOTHING`)
      .bind(accountId,checked.type,checked.definition.label,version,artifactId,JSON.stringify(checked.fields),meta),
  ]);
  return {ok:true,...checked,artifactId,version,digest,key};
}

export async function attachGeneratedImplementations(env, slug, sections, accountId = null) {
  if (!sections?.some((s)=>s.content?.__editor?.generated)) return sections;
  let tenant = accountId;
  if (!tenant) {
    const page = await env.DB.prepare("SELECT account_id FROM cms_pages WHERE slug = ? LIMIT 1").bind(slug).first();
    tenant = page?.account_id;
  }
  if (!tenant) return sections;
  return Promise.all(sections.map(async (section)=>{
    const editor = section.content?.__editor;
    if (!editor?.generated || !editor.artifactId) return section;
    const artifact = await env.DB.prepare("SELECT manifest_r2_key,content_hash FROM cms_artifacts WHERE id = ? AND account_id = ? AND status = 'ready'")
      .bind(editor.artifactId,tenant).first();
    if (!artifact) return section;
    const manifest = await readR2Json(env,artifact.manifest_r2_key);
    if (!manifest || manifest.schema !== "cms.generated-implementation.v1") return section;
    const settings = Object.fromEntries(Object.entries(section.content).filter(([key])=>key !== "__editor"));
    const checked = inspectGeneratedSection({canonical:manifest.canonical,definition:{...manifest.definition,settings:manifest.fields},settings},section.key);
    if (!checked.ok) return section;
    if (await sha256(JSON.stringify(manifest)) !== artifact.content_hash) return section;
    const placed=await env.DB.prepare(`SELECT s.id FROM cms_page_sections s JOIN cms_pages p ON p.id=s.page_id
      WHERE p.account_id=? AND p.slug=? AND s.section_key=? LIMIT 1`)
      .bind(tenant,slug,section.key).first();
    if(!placed?.id)return section;
    try {
      const renderedImplementation=materializeGeneratedStatic(
        {canonical:manifest.canonical,definition:{...manifest.definition,settings:manifest.fields},settings},
        {instanceId:placed.id,sectionKey:section.key});
      return {...section,implementation:manifest.canonical,renderedImplementation};
    }catch{return section;}

  }));
}
