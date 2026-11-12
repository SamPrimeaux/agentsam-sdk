// Consume the SDK's public provider export rather than a deep source import.
import { createProviderAdapter } from '@inneranimalmedia/agentsam-sdk/providers';
import { discoverProviderModels } from '../../../../protocol/models/discovery.mjs';
import { WORKERS_AI_CURATED_MODEL_IDS } from '../../../../protocol/models/workers-ai-curated.mjs';
import { loadCanvasCreationKnowledge, validateCanvasDirections } from '../../../../protocol/canvas/knowledge-core.mjs';
import { CANVAS_SKILLS } from './canvas-knowledge.generated.js';

const clean = value => String(value ?? '').trim();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,95}$/;
const BLOCKED_MODELS = /^(?:gpt-5\.5(?:-|$)|gpt-5\.4-pro(?:-|$))/i;
const NODE_TYPES = new Set(['frame', 'text', 'button', 'image', 'input', 'link']);
const MAX_OUTPUT = 16000;
function fail(code, status = 422) {
  const error = new Error(code); error.code = code; error.status = status; return error;
}
function parseJson(text) {
  const raw = clean(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!raw || raw.length > 500000) throw fail('canvas_model_output_invalid');
  try { const value = JSON.parse(raw); if (!object(value)) throw new Error(); return value; }
  catch { throw fail('canvas_model_json_invalid'); }
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
function loadPackagedSkill(id) {
  const entry = CANVAS_SKILLS[id];
  if (!entry?.instructions || !entry.sha256) throw fail('canvas_skill_unavailable:' + id, 503);
  return clone(entry);
}
function skillText(skill) {
  return [skill.instructions, ...(skill.references || []).map(ref => ref.path + '\n' + ref.content)].join('\n\n');
}
async function checkCancelled(shouldCancel) {
  if (await shouldCancel?.()) throw fail('canvas_generation_cancelled', 409);
}
/** User-selected model only. Vault credentials are resolved by the authenticated host. */
async function createModel({env, selection, runtime = {}, emit, shouldCancel}) {
  const provider = clean(selection?.provider).toLowerCase();
  const modelId = clean(selection?.model_id || selection?.modelId);
  if (!provider || !modelId) throw fail('canvas_model_selection_required', 409);
  if (BLOCKED_MODELS.test(modelId)) throw fail('canvas_model_blocked_by_policy', 403);
  if (!['openai', 'gemini', 'anthropic', 'cloudflare', 'grok', 'xai'].includes(provider)) throw fail('canvas_provider_unsupported', 422);
  await checkCancelled(shouldCancel);
  const fetchImpl = runtime.fetchImpl || fetch;
  const bound = provider === 'cloudflare' && typeof env?.AGENTSAM_WAI?.run === 'function';
  let adapter, record;
  if (bound) {
    if (!WORKERS_AI_CURATED_MODEL_IDS.includes(modelId)) throw fail('canvas_model_unavailable', 409);
  } else {
    const credential = await runtime.resolveCredential?.(provider);
    if (!credential?.value) throw fail('canvas_provider_credential_unavailable:' + provider, 503);
    const discovered = await discoverProviderModels(provider, {
      ...credential, account_id: credential.account_id || credential.cloudflare_account_id,
    }, {fetchImpl});
    record = discovered.models?.find(item => item.provider_model_id === modelId);
    if (!discovered.ok || !record) throw fail('canvas_model_unavailable:' + provider + ':' + modelId, 409);
    adapter = createProviderAdapter({modelRecord: record, credential, fetchImpl});
  }
  return {
    provider, model_id: modelId,
    async json(instructions, input, stage, maxOutputTokens = MAX_OUTPUT) {
      await checkCancelled(shouldCancel);
      await emit?.('model.started', {provider, model_id: modelId, stage});
      let response;
      try {
        if (bound) {
          const result = await env.AGENTSAM_WAI.run(modelId, {
            messages: [{role: 'system', content: instructions}, {role: 'user', content: JSON.stringify(input)}],
            max_tokens: maxOutputTokens,
          });
          response = {output_text: typeof result === 'string' ? result : result?.response,
            usage_delta: result?.usage || null, response_id: result?.id || null};
        } else {
          response = await adapter.create({
            instructions, input: JSON.stringify(input), maxOutputTokens,
            modelRecord: record, store: false, tools: [], autoCompact: false,
          });
        }
      } catch (error) {
        await emit?.('model.failed', {provider, model_id: modelId, stage, status: Number(error?.status) || null});
        // Provider bodies can contain credentials/private prompt excerpts. Only expose bounded status.
        throw fail('canvas_provider_request_failed:' + provider + ':' + (Number(error?.status) || 'transport'), 502);
      }
      await checkCancelled(shouldCancel);
      const value = parseJson(response.output_text);
      await emit?.('model.completed', {provider, model_id: modelId, stage,
        response_id: response.response_id || null, usage: response.usage_delta || null});
      return {value, response_id: response.response_id || null, usage: response.usage_delta || null};
    },
  };
}
function documentContext(document) {
  return {
    host: document.host, kind: document.kind || 'app-ui', brief: clean(document.brief).slice(0, 12000),
    name: document.name, assets: (document.assets || []).slice(0, 30),
    artboards: (document.artboards || []).map(board => ({id:board.id,name:board.name,width:board.width,height:board.height})),
    capabilities: ['editable-artboards','nested-nodes','text','image','button','input','navigate','toggle','save','undo','responsive-preview'],
    unavailable: ['arbitrary-javascript-execution','automatic-publication','undeclared-backend-operations'],
  };
}
export async function prepareCanvasDirections({env, user, document, context = {}, runtime = {}}) {
  if (!user?.id) throw fail('unauthorized', 401);
  const model = await createModel({env, selection:context, runtime});
  const result = await model.json(
    'Prepare exactly four contextual creative directions for this independent editable Canvas. ' +
    'Respond only with JSON {"directions":[{"id":"lowercase-slug","title":"3-72 characters","description":"12-240 characters","creativeIntent":"10-300 characters"}]}. ' +
    'The four choices must differ meaningfully in composition, typography, interaction and story, not just colors. ' +
    'Use the supplied real host, brief and assets. No invented project, user, website, template or theme IDs. ' +
    'These are creative intentions, never mandatory document types. No questions or wizard.',
    {...documentContext(document),project:context.project||null}, 'directions', 2400);
  const directions = validateCanvasDirections(result.value.directions).map(item => ({
    id:item.id,title:item.title.trim(),description:item.description.trim(),creativeIntent:item.creativeIntent.trim(),
  }));
  return {directions,provider:model.provider,model_id:model.model_id,response_id:result.response_id,usage:result.usage};
}
const DOCUMENT_CONTRACT = `Return plain JSON only, no markdown.
Canvas document v1 has artboards [{id,name,width,height,x,y,background,nodes}], tokens {}, components [], assets [], dataRequirements [].
An editable node is {id,type,name,x,y,width,height,text?,src?,style:{CSS camelCase properties},children?:Node[],action?:{type:"navigate"|"toggle",target:string},binding?,componentId?}.
type must be frame,text,button,image,input,link. All geometry is finite numbers, local to its parent; top-level local to artboard. No HTML, JS, CSS selectors, executable URLs, event handlers or arbitrary scripts.
Nodes need distinctive stable ids, readable names and useful editable text; nested children use local coordinates. Use actual assets supplied, never invent remote images or product data.
Use intentional composition and typography, readable contrast and whitespace. No emoji UI, repetitive marketing cards, gratuitous pills, fake dashboards or pretend controls.
Use navigate action target "#artboardId" for generated artboards, safe relative paths or https URLs, and toggle actions only to node ids. Runtime may render responsive preview at different widths. Provide responsive:{"390":{x,y,width,height,style:{}}} on nodes where narrower geometry is needed. Token names must be CSS custom properties such as --brand or --font-body. CSS style keys supported: color,background,backgroundColor,fontFamily,fontSize,fontWeight,fontStyle,lineHeight,letterSpacing,textAlign,textDecoration,border,borderColor,borderWidth,borderStyle,borderRadius,boxShadow,opacity,padding,paddingTop,paddingRight,paddingBottom,paddingLeft,display,alignItems,justifyContent,flexDirection,gap,overflow,objectFit,whiteSpace. Do not use other style keys or url().
Data requirements must honestly specify missing backend capabilities using {id,description,status:"unavailable"}; never claim a backend operation exists unless the host declares it.
A Canvas is independent. Do not create a CMS theme or publish anything. Preserve provenance and document identity.
`;
function validatePlan(raw) {
  if (!object(raw) || typeof raw.name !== 'string' || !Array.isArray(raw.pages) || raw.pages.length < 1 || raw.pages.length > 4) throw fail('canvas_generation_plan_invalid');
  const ids = new Set();
  const pages = raw.pages.map((page, index) => {
    if (!object(page) || !ID.test(page.id) || ids.has(page.id) || !clean(page.name)) throw fail('canvas_generation_plan_invalid');
    ids.add(page.id);
    return {id:page.id,name:clean(page.name).slice(0,120),purpose:clean(page.purpose).slice(0,800),
      width:Math.max(320,Math.min(1920,Number(page.width)||1200)),
      height:Math.max(400,Math.min(4000,Number(page.height)||900)), x:index*1320,y:0};
  });
  return {name:raw.name.slice(0,160),pages,tokens:object(raw.tokens)?raw.tokens:{},
    dataRequirements:Array.isArray(raw.dataRequirements)?raw.dataRequirements.slice(0,30).map((item,index)=>({
      id:ID.test(item?.id)?item.id:'requirement_'+index,description:clean(item?.description).slice(0,2000),status:'unavailable',
    })):[]};
}
export function validateGeneratedArtboard(raw, expected) {
  if (!object(raw) || raw.id !== expected.id || !Array.isArray(raw.nodes) || !raw.nodes.length) throw fail('canvas_generated_artboard_invalid');
  const seen = new Set(); let count = 0;
  function node(item, depth = 0) {
    if (!object(item) || !ID.test(item.id) || seen.has(item.id) || !NODE_TYPES.has(item.type) || depth > 12 || ++count > 250) throw fail('canvas_generated_node_invalid');
    seen.add(item.id);
    for (const field of ['x','y','width','height']) if (!Number.isFinite(item[field]) || Math.abs(item[field]) > 20000 || (['width','height'].includes(field) && item[field] <= 0)) throw fail('canvas_generated_geometry_invalid');
    if (item.src && !/^(https:\/\/|\/(?!\/))/.test(item.src)) throw fail('canvas_generated_asset_invalid');
    if (item.action) {
      if (!['navigate','toggle'].includes(item.action.type) || typeof item.action.target !== 'string' ||
          /^(javascript|data|vbscript):|^\/\//i.test(item.action.target) ||
          (item.action.type==='navigate' && !/^(https:\/\/|\/(?!\/)|#[A-Za-z0-9_-]+$)/i.test(item.action.target))) throw fail('canvas_generated_action_invalid');
    }
    if (item.binding) throw fail('canvas_generated_binding_requires_authorized_adapter');
    if (item.children != null && !Array.isArray(item.children)) throw fail('canvas_generated_children_invalid');
    return {id:item.id,type:item.type,name:clean(item.name || item.type).slice(0,120),
      x:item.x,y:item.y,width:item.width,height:item.height,
      ...(typeof item.text === 'string'?{text:item.text.slice(0,20000)}:{}),
      ...(typeof item.src === 'string'?{src:item.src}:{}),
      style:object(item.style)?clone(item.style):{},
      ...(item.children?{children:item.children.map(child=>node(child,depth+1))}:{}),
      ...(item.action?{action:clone(item.action)}:{}),
      ...(item.binding?{binding:clone(item.binding)}:{}),
      ...(item.componentId?{componentId:item.componentId}:{}),
      ...(object(item.responsive)?{responsive:clone(item.responsive)}:{}),
    };
  }
  return {...expected, background:typeof raw.background==='string'?raw.background:'#ffffff',nodes:raw.nodes.map(item=>node(item))};
}
function allNodes(document) {
  const nodes = new Map();
  const walk = items => { for (const item of items || []) {nodes.set(item.id,item);walk(item.children);} };
  for (const board of document.artboards || []) walk(board.nodes);
  return nodes;
}
function normalizeSelection(selection) {
  const rows = Array.isArray(selection) ? selection : selection ? [selection] : [];
  return rows.map(row=> typeof row==='string'?row:row.nodeId||row.node_id||row.id).filter(Boolean);
}
function replaceNodes(document, patches) {
  const replace = nodes => nodes.map(node => patches.has(node.id) ? clone(patches.get(node.id)) :
    {...node,...(node.children?{children:replace(node.children)}:{})});
  return {...document,artboards:document.artboards.map(board=>({...board,nodes:replace(board.nodes)}))};
}
async function readKnowledge({document,run,user,env,emit}) {
  const kind = document.kind || (['cad','samsketch','sculpt','movie'].includes(document.host)?document.host:'app-ui');
  const selectedDirectionId = run.direction_id || document.provenance?.selectedDirectionId;
  const knowledge = loadCanvasCreationKnowledge({directions:document.directions,selectedDirectionId,kind}, {loadSkill:loadPackagedSkill});
  for (const id of ['agentsam-app-fundamentals','agentsam-experience-delivery','agentsam-progression-guard']) knowledge.skills.push(loadPackagedSkill(id));
  for (const skill of knowledge.skills) await emit('skill.loaded', {
    id:skill.skill.id,title:skill.skill.title,source:skill.skill.entry,sha256:skill.sha256,
    reference_paths:(skill.references||[]).map(ref=>ref.path),
  });
  // Optional user-selected private skills are resolved through the existing principal-scoped catalog.
  const mentionedIds = [...clean(run.instruction).matchAll(/\[skill:(skill_[a-z0-9_-]+)\]/gi)].map(match=>match[1]);
  const ids = [...new Set([...(Array.isArray(run.skill_ids)?run.skill_ids:[]),...mentionedIds])].filter(id=>/^skill_[a-z0-9_-]+$/i.test(id)).slice(0,8);
  if (ids.length && !env.DB?.prepare) throw fail('canvas_private_skill_storage_unavailable',503);
  if (ids.length) {
    const placeholders = ids.map(()=>'?').join(',');
    const {results=[]} = await env.DB.prepare(
      'SELECT id,name,content_markdown,content_checksum,version FROM agentsam_skill WHERE account_id=? AND is_active=1 AND id IN ('+placeholders+')',
    ).bind(user.id,...ids).all();
    if (results.length !== ids.length) throw fail('canvas_selected_skill_unavailable',404);
    for (const row of results) {
      knowledge.skills.push({skill:{id:row.id,title:row.name},instructions:row.content_markdown,references:[]});
      await emit('skill.loaded',{id:row.id,title:row.name,sha256:row.content_checksum,version:row.version,source:'private_skill_catalog'});
    }
  }
  const projectId=clean(document.provenance?.projectId);
  if(projectId){
    if(!env.DB?.prepare)throw fail('canvas_project_storage_unavailable',503);
    const project=await env.DB.prepare('SELECT id,name,description,project_type FROM projects WHERE id=? AND owner_user_id=?').bind(projectId,user.id).first();
    if(!project)throw fail('canvas_project_not_found',404);
    knowledge.project=project;
    await emit('project.loaded',{id:project.id,name:project.name,source:'projects'});
  }
  return knowledge;
}
/**
 * Every applied stage is saved by the owning Canvas adapter. No UI timer or
 * model prose is treated as execution proof. Durable cancellation/revision
 * checks happen both before and after each provider request.
 */
export async function executeCanvasGeneration({
  env,user,document,run,emit,apply,shouldCancel,runtime={},context,
}) {
  if (!user?.id) throw fail('unauthorized',401);
  if (typeof emit!=='function'||typeof apply!=='function') throw fail('canvas_execution_adapter_required',503);
  await checkCancelled(shouldCancel);
  const knowledge = await readKnowledge({document,run,user,env,emit});
  const instructions = DOCUMENT_CONTRACT+'\n\n'+knowledge.skills.map(skillText).join('\n\n')+
    (knowledge.project?'\n\nAuthorized project knowledge:\n'+JSON.stringify(knowledge.project):'');
  const model = await createModel({env,selection:run,runtime:context||runtime,emit,shouldCancel});
  let current=clone(document);
  const instruction=clean(run.instruction).slice(0,8000);
  if (instruction && current.artboards?.some(board=>board.nodes?.length)) {
    const existing=allNodes(current), selection=normalizeSelection(run.selection);
    if (selection.some(id=>!existing.has(id))) throw fail('canvas_selection_not_found',404);
    const allowed=new Set(selection.length?selection:[...existing.keys()]);
    const result=await model.json(instructions+'\nReturn {"patches":[Node],"summary":"what changed"}. Replace only requested nodes, preserving each id and unrequested properties. For selected nodes modify only that selection. Do not add or remove nodes outside selected subtrees.',
      {instruction,direction:knowledge.selectedDirection,context:documentContext(current),
       selectedNodes:[...allowed].map(id=>existing.get(id))},'targeted-edit');
    if (!Array.isArray(result.value.patches)||!result.value.patches.length||result.value.patches.length>100) throw fail('canvas_edit_patch_invalid');
    const patches=new Map();
    for (const patch of result.value.patches) {
      if (!allowed.has(patch?.id)||patches.has(patch.id)) throw fail('canvas_edit_target_not_authorized',409);
      const validated=validateGeneratedArtboard({id:'validation',nodes:[patch]}, {id:'validation',width:1200,height:900});
      patches.set(patch.id,validated.nodes[0]);
    }
    await checkCancelled(shouldCancel);
    const next=replaceNodes(current,patches);
    const saved=await apply(next,{type:'canvas.nodes.updated',target:[...patches.keys()],summary:clean(result.value.summary).slice(0,500)});
    return {document:saved?.document||next,changed:[...patches.keys()],provider:model.provider,model_id:model.model_id};
  }
  let plan=run.checkpoint?.plan;
  if (plan) plan=validatePlan(plan);
  else {
    const result=await model.json(instructions+'\nPrepare a coherent design plan with 1 to 4 purposeful pages/artboards. Return {"name":string,"tokens":{},"pages":[{"id":string,"name":string,"purpose":string,"width":number,"height":number}],"dataRequirements":[]}. Plan actual interactive frontend behavior; explicitly mark unmet backend requirements.',
      {direction:knowledge.selectedDirection,context:documentContext(current)},'plan',4500);
    plan=validatePlan(result.value);
    await emit('generation.plan',{plan});
  }
  const planHash=await digest(plan);
  const previous=current.provenance?.generation;
  const completed=new Set(previous?.runId===run.id && previous?.planHash===planHash?previous.completedArtboardIds:[]);
  if (!previous || previous.runId!==run.id || previous.planHash!==planHash) {
    // Never overwrite unrelated existing boards during recovery or a repeated selection.
    if (current.artboards?.some(board=>board.nodes?.length)) throw fail('canvas_existing_content_requires_edit_instruction',409);
    current={...current,name:plan.name,tokens:plan.tokens,dataRequirements:plan.dataRequirements,
      artboards:plan.pages.map(page=>({...page,background:'#ffffff',nodes:[]})),
      provenance:{...current.provenance,selectedDirectionId:knowledge.selectedDirection.id,
        generation:{runId:run.id,planHash,completedArtboardIds:[]}}};
    await checkCancelled(shouldCancel);
    const saved=await apply(current,{type:'canvas.structure.created',target:plan.pages.map(p=>p.id),summary:'Created '+plan.pages.length+' editable artboards'});
    current=saved?.document||current;
  }
  for (const page of plan.pages) {
    if (completed.has(page.id)) continue;
    const result=await model.json(instructions+'\nCreate the complete editable artboard requested. Return {"artboard":Artboard}. Organize top-level nodes as ordered frame sections (header, hero, content, footer as appropriate), with editable nested nodes using coordinates relative to each section. All nodes must be usable and accurately positioned; include typography, structure, real available assets, meaningful copy and supported interactions. Use globally unique node ids prefixed with this artboard id. Do not invent assets, user data or server operations.',
      {direction:knowledge.selectedDirection,plan,page,context:documentContext(current)},'artboard:'+page.id);
    const artboard=validateGeneratedArtboard(result.value.artboard,page);
    const otherIds=new Set([...allNodes({...current,artboards:current.artboards.filter(board=>board.id!==page.id)}).keys()]);
    for (const id of allNodes({artboards:[artboard]}).keys()) if(otherIds.has(id)) throw fail('canvas_generated_duplicate_node_id');
    completed.add(page.id);
    const next={...current,artboards:current.artboards.map(board=>board.id===page.id?artboard:board),
      provenance:{...current.provenance,generation:{runId:run.id,planHash,completedArtboardIds:[...completed]}}};
    await checkCancelled(shouldCancel);
    const saved=await apply(next,{type:'canvas.artboard.created',target:page.id,summary:'Created '+page.name});
    current=saved?.document||next;
  }
  const missing=(current.dataRequirements||[]).filter(item=>item.status!=='available');
  await emit('generation.validated',{artboard_ids:current.artboards.map(board=>board.id),node_count:allNodes(current).size,
    unavailable_data_requirements:missing,scope:'editable_frontend',cms_published:false});
  return {document:current,provider:model.provider,model_id:model.model_id,unavailable:missing};
}
