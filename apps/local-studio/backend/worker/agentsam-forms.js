/**
 * AgentSamForms — a first-party account-owned Forms app.
 * Shared data contracts are extracted from Companions' Form Studio adapter.
 * No customer-specific assets, customer D1 schema, or live provider credentials.
 */
export const FORMS_APP_KEY = 'agentsamforms';
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,70}$/;
const ID_RE = /^cmsg_[a-f0-9]{16}$/;
const TYPES = new Set(['text', 'email', 'tel', 'textarea', 'select', 'checkbox']);
const FORM_MODES = new Set(['inline', 'popup']);
const STATUS = new Set(['draft', 'published']);
const HEADERS = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const publicHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (data, status = 200) => Response.json(data, { status, headers: HEADERS });
const failure = (error, status = 400) => json({ ok: false, error }, status);
const field = (key, label, type = 'text', required = false, extra = {}) =>
  ({ key, label, type, required, placeholder: '', ...extra });
const preset = (key, title, description, fields, settings = {}) => ({
  key, title, description,
  document: {
    version: 1, title, description, mode: settings.mode || 'inline', fields,
    appearance: {
      background: '#ffffff', text: '#191919', accent: '#238552',
      button: '#238552', radius: 12, font: 'Inter, system-ui, sans-serif',
    },
    behavior: { pages: 'all', trigger: 'manual', device: 'all',
      ...(settings.behavior || {}) },
    success: { title: 'Thank you', message: 'Your response was received.' },
    ...(settings.document || {}),
  },
});
/** Five real draft instances are seeded only after an owner installs the app. */
export const FORM_STARTERS = Object.freeze([
  preset('contact-inquiry', 'Contact & project inquiry',
    'Collect a clear first message from a potential customer.', [
      field('name', 'Full name', 'text', true),
      field('email', 'Email', 'email', true),
      field('business', 'Business / organization'),
      field('service', 'What can we help with?', 'select', true, { options:
        ['Website', 'Branding & design', 'Online store', 'Media production', 'Something else'] }),
      field('message', 'Tell us about your project', 'textarea', true),
    ]),
  preset('website-project-brief', 'Website project brief',
    'Understand scope, starting point and timing before preparing a proposal.', [
      field('name', 'Contact name', 'text', true),
      field('email', 'Work email', 'email', true),
      field('business', 'Business name', 'text', true),
      field('site', 'Current website'),
      field('goal', 'What should your website accomplish?', 'textarea', true),
      field('timeline', 'Ideal timeframe', 'select', false, { options:
        ['As soon as practical', 'Within a month', 'Within three months', 'Exploring options'] }),
    ]),
  preset('newsletter-signup', 'Newsletter signup',
    'Opt-in email signup with recorded consent and a clear success message.', [
      field('name', 'First name'),
      field('email', 'Email address', 'email', true),
      field('consent', 'I agree to receive marketing emails', 'checkbox', true),
    ], { document: {
      mode: 'popup',
      behavior: { trigger: 'manual', pages: 'all', device: 'all' },
      success: { title: 'You are on the list', message: 'Thanks for signing up.' },
    } }),
  preset('launch-waitlist', 'Launch & early-access waitlist',
    'Capture interested visitors before a site, product or service launches.', [
      field('name', 'First name', 'text', true),
      field('email', 'Email', 'email', true),
      field('interest', 'What are you interested in?', 'select', true, { options:
        ['Website builder', 'AgentSam apps', 'Creative tools', 'Commerce features'] }),
      field('updates', 'Send me updates about this launch', 'checkbox', true),
    ], { document: { success: {
      title: 'You are on the waitlist', message: 'We will let you know when it launches.',
    } } }),
  preset('custom-merch-request', 'Custom merchandise request',
    'Gather product requests for a quote; never place an order automatically.', [
      field('name', 'Contact name', 'text', true),
      field('email', 'Email', 'email', true),
      field('product', 'Product type', 'select', true, { options:
        ['T-shirt', 'Hoodie', 'Hat', 'Drinkware', 'Other'] }),
      field('quantity', 'Approximate quantity', 'select', true, { options:
        ['1–10', '11–50', '51–100', '100+'] }),
      field('details', 'Artwork, decoration and timing', 'textarea', true),
    ], { document: { success: {
      title: 'Request received', message: 'We will review the details before quoting.',
    } } }),
]);

function smallString(value, max = 180) {
  if (typeof value !== 'string') throw Error('text_required');
  const str = value.trim();
  if (!str || str.length > max) throw Error('text_invalid');
  return str;
}
function optionalString(value, max = 400) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > max) throw Error('text_invalid');
  return value.trim();
}
function color(value, fallback) { return typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test(value) ? value : fallback; }
function normalizeFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 20) throw Error('fields_invalid');
  const seen = new Set();
  return fields.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('field_invalid');
    const key = String(raw.key || '').trim();
    if (!KEY_RE.test(key) || seen.has(key)) throw Error('field_key_invalid');
    seen.add(key);
    const type = String(raw.type || 'text');
    if (!TYPES.has(type)) throw Error('field_type_invalid');
    const options = type === 'select' ? raw.options : [];
    if (type === 'select' && (!Array.isArray(options) || !options.length || options.length > 30))
      throw Error('field_options_invalid');
    return {
      key, type, label: smallString(raw.label, 100),
      required: raw.required === true,
      placeholder: optionalString(raw.placeholder, 150),
      options: type === 'select' ? options.map(item => smallString(item, 120)) : [],
    };
  });
}
export function normalizeFormDocument(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('document_invalid');
  const a = raw.appearance && typeof raw.appearance === 'object' ? raw.appearance : {};
  const b = raw.behavior && typeof raw.behavior === 'object' ? raw.behavior : {};
  const s = raw.success && typeof raw.success === 'object' ? raw.success : {};
  const mode = String(raw.mode || 'inline');
  if (!FORM_MODES.has(mode)) throw Error('mode_invalid');
  return {
    version: 1, title: smallString(raw.title, 120), description: optionalString(raw.description, 500),
    mode, fields: normalizeFields(raw.fields),
    appearance: {
      background: color(a.background, '#ffffff'), text: color(a.text, '#191919'),
      accent: color(a.accent, '#238552'), button: color(a.button, '#238552'),
      radius: Number.isInteger(a.radius) && a.radius >= 0 && a.radius <= 24 ? a.radius : 12,
      font: 'Inter, system-ui, sans-serif',
    },
    behavior: { pages: 'all', trigger: ['manual', 'first-view', 'exit-intent'].includes(b.trigger) ? b.trigger : 'manual',
      device: ['all', 'desktop', 'mobile'].includes(b.device) ? b.device : 'all' },
    success: { title: optionalString(s.title, 70) || 'Thank you',
      message: optionalString(s.message, 300) || 'Your response was received.' },
  };
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/** Forms are site-owned CMS globals, not a parallel form-definition registry. */
function previewRow(row) {
  const document = JSON.parse(row.inline_content_json || '{}');
  const epoch = value => value ? Math.floor(Date.parse(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')) / 1000) || 0 : 0;
  return {
    id:row.id, account_id:row.account_id, site_id:row.site_id,
    key:row.global_key.slice(5), title:document.title, description:document.description,
    status:row.status, version:row.content_version, document,
    submission_count:row.submission_count || 0,
    created_at:epoch(row.created_at), updated_at:epoch(row.updated_at),
  };
}
async function installed(db, accountId) {
  return Boolean(await db.prepare(
    "SELECT 1 FROM agentsam_app_installations i JOIN apps a ON a.id=i.app_id " +
    "WHERE i.account_id=? AND i.app_id=? AND i.enabled=1 " +
    "AND a.app_type='application' AND a.status='active' LIMIT 1"
  ).bind(accountId,FORMS_APP_KEY).first());
}
async function sites(db, accountId) {
  const result=await db.prepare(
    "SELECT id,name,status,primary_domain FROM cms_sites WHERE account_id=? AND status!='archived' ORDER BY is_default DESC,name ASC"
  ).bind(accountId).all();
  return result.results || [];
}
async function chosenSite(db,accountId,siteId) {
  if (typeof siteId!=='string' || !siteId || siteId.length>120) return null;
  return db.prepare("SELECT id,name,status,primary_domain FROM cms_sites WHERE account_id=? AND id=? AND status!='archived' LIMIT 1")
    .bind(accountId,siteId).first();
}
async function getOwn(db,accountId,id) {
  return db.prepare(
    "SELECT g.*, (SELECT COUNT(*) FROM cms_form_submissions s WHERE s.form_id=g.id) AS submission_count " +
    "FROM cms_globals g WHERE g.account_id=? AND g.id=? AND g.global_type='form' AND g.global_key LIKE 'form:%' LIMIT 1"
  ).bind(accountId,id).first();
}
async function list(db,accountId,siteId) {
  const result=await db.prepare(
    "SELECT g.*, (SELECT COUNT(*) FROM cms_form_submissions s WHERE s.form_id=g.id) AS submission_count " +
    "FROM cms_globals g WHERE g.account_id=? AND g.site_id=? AND g.global_type='form' AND g.global_key LIKE 'form:%' ORDER BY g.created_at ASC,g.global_key ASC"
  ).bind(accountId,siteId).all();
  return (result.results || []).map(previewRow);
}
async function seed(db,accountId,siteId) {
  // Installation does not auto-publish or create forms for unrelated sites.
  for (const item of FORM_STARTERS) {
    const document=normalizeFormDocument(item.document);
    await db.prepare(
      "INSERT OR IGNORE INTO cms_globals (account_id,site_id,global_key,global_type,status,inline_content_json,content_version,metadata_json) " +
      "VALUES (?,?,?,'form','draft',?,1,?)"
    ).bind(accountId,siteId,'form:'+item.key,JSON.stringify(document),
      JSON.stringify({app_id:FORMS_APP_KEY,preset:item.key})).run();
  }
  return list(db,accountId,siteId);
}
async function revision(db,row,kind,doc,version) {
  await db.prepare(
    "INSERT INTO cms_revisions (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json) " +
    "VALUES (?,?,'global',?,?,?,?)"
  ).bind(row.account_id,row.site_id,row.id,version,kind,JSON.stringify(doc)).run();
}

async function readData(request) {
  const length = Number(request.headers.get('content-length') || '0');
  if (length > 18000) throw Error('submission_too_large');
  const raw = await request.text();
  if (raw.length > 18000) throw Error('submission_too_large');
  if (request.headers.get('content-type')?.includes('application/json')) {
    try { return JSON.parse(raw); } catch { throw Error('json_invalid'); }
  }
  if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded'))
    return Object.fromEntries(new URLSearchParams(raw));
  throw Error('content_type_invalid');
}
function validateSubmission(document, submitted) {
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) throw Error('submission_invalid');
  const values = {};
  for (const fld of document.fields) {
    const value = submitted[fld.key];
    if (fld.type === 'checkbox') {
      const checked = value === true || value === 'on' || value === 'true';
      if (fld.required && !checked) throw Error('required_' + fld.key);
      values[fld.key] = checked; continue;
    }
    if (value != null && typeof value !== 'string') throw Error('field_value_invalid');
    const text = String(value || '').trim();
    if (fld.required && !text) throw Error('required_' + fld.key);
    if (text.length > (fld.type === 'textarea' ? 3000 : 300)) throw Error('field_value_too_long');
    if (text && fld.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw Error('email_invalid');
    if (text && fld.type === 'select' && !fld.options.includes(text)) throw Error('option_invalid');
    values[fld.key] = text;
  }
  return values;
}
const slugErrors = new Set(['text_required','text_invalid','field_invalid','fields_invalid','field_key_invalid','field_type_invalid','field_options_invalid','document_invalid','mode_invalid','submission_invalid','submission_too_large','content_type_invalid','json_invalid','field_value_invalid','field_value_too_long','email_invalid','option_invalid','version_invalid']);
function asError(e) {
  const message = String(e?.message || e);
  const validation = slugErrors.has(message) || message.startsWith('required_');
  return failure(validation ? message : 'forms_unavailable', validation ? 400 : 503);
}
const sameOriginWrite = request => !request.headers.get('origin') ||
  request.headers.get('origin') === new URL(request.url).origin;


export async function handleAgentSamFormsApi(request,env,accountId) {
  const url=new URL(request.url), path=url.pathname;
  if (path!=='/api/forms' && !path.startsWith('/api/forms/')) return null;
  if (!accountId) return failure('unauthorized',401);
  if (!env.DB?.prepare) return failure('forms_unavailable',503);
  if (!['GET','POST','PUT'].includes(request.method)) return failure('method_not_allowed',405);
  if (request.method!=='GET' && !sameOriginWrite(request)) return failure('origin_not_allowed',403);
  try {
    const db=env.DB, hasApp=await installed(db,accountId);
    if (path==='/api/forms' && request.method==='GET') {
      const ownedSites=await sites(db,accountId);
      const selected=url.searchParams.get('site') ||
        (ownedSites.find(s=>s.status==='active') || ownedSites[0])?.id || null;
      const valid=selected && ownedSites.some(s=>s.id===selected);
      if (!valid && url.searchParams.has('site')) return failure('site_not_found',404);
      return json({ok:true,installed:hasApp,sites:ownedSites,site_id:valid?selected:null,
        forms:hasApp && valid?await list(db,accountId,selected):[]});
    }
    if (!hasApp) return failure('app_not_installed',403);
    if (path==='/api/forms/bootstrap' && request.method==='POST') {
      const siteId=url.searchParams.get('site');
      const site=await chosenSite(db,accountId,siteId);
      if (!site) return failure('site_not_found',404);
      return json({ok:true,site_id:site.id,forms:await seed(db,accountId,site.id)});
    }
    const match=/^\/api\/forms\/(cmsg_[a-f0-9]{16})(?:\/(publish|unpublish|test|submissions))?$/.exec(path);
    if (!match) return failure('not_found',404);
    const [,id,operation]=match, row=await getOwn(db,accountId,id);
    if (!row) return failure('not_found',404);
    if (!operation && request.method==='GET') return json({ok:true,form:previewRow(row)});
    if (operation==='submissions' && request.method==='GET') {
      const result=await db.prepare(
        'SELECT id,payload_json,is_test,created_at FROM cms_form_submissions WHERE account_id=? AND site_id=? AND form_id=? ORDER BY created_at DESC LIMIT 100'
      ).bind(accountId,row.site_id,id).all();
      return json({ok:true,submissions:(result.results || []).map(s=>({
        id:s.id,values:JSON.parse(s.payload_json),is_test:!!s.is_test,created_at:s.created_at,
      }))});
    }
    if (!operation && request.method==='PUT') {
      if (row.status!=='draft') return failure('unpublish_before_editing',409);
      const body=await readData(request);
      if (!Number.isInteger(body?.version) || body.version<1) throw Error('version_invalid');
      const doc=normalizeFormDocument(body.document);
      const result=await db.prepare(
        "UPDATE cms_globals SET inline_content_json=?,content_version=content_version+1,updated_at=datetime('now') " +
        "WHERE id=? AND account_id=? AND site_id=? AND content_version=? AND status='draft' AND global_type='form'"
      ).bind(JSON.stringify(doc),id,accountId,row.site_id,body.version).run();
      if (!result.meta?.changes) return failure('stale_version',409);
      await revision(db,row,'draft',doc,body.version+1);
      return json({ok:true,form:previewRow(await getOwn(db,accountId,id))});
    }
    if ((operation==='publish' || operation==='unpublish') && request.method==='POST') {
      const status=operation==='publish'?'published':'draft';
      const doc=normalizeFormDocument(JSON.parse(row.inline_content_json));
      await db.prepare(
        "UPDATE cms_globals SET status=?,updated_at=datetime('now') WHERE id=? AND account_id=? AND global_type='form'"
      ).bind(status,id,accountId).run();
      if(status==='published') await revision(db,row,'published',doc,row.content_version);
      return json({ok:true,form:previewRow(await getOwn(db,accountId,id))});
    }
    if (operation==='test' && request.method==='POST') {
      const data=await readData(request),doc=normalizeFormDocument(JSON.parse(row.inline_content_json));
      const values=validateSubmission(doc,data);
      const saved=await db.prepare(
        'INSERT INTO cms_form_submissions (account_id,site_id,form_id,payload_json,is_test) VALUES (?,?,?,?,1)'
      ).bind(accountId,row.site_id,id,JSON.stringify(values)).run();
      return json({ok:true,submission_id:saved.meta?.last_row_id||null},201);
    }
    return failure('method_not_allowed',405);
  }catch(error){console.warn('agentsam_forms_api',String(error?.message||error).slice(0,120));return asError(error);}
}

function formHtml(row, message = null) {
  const doc = normalizeFormDocument(JSON.parse(row.document_json));
  const bg=doc.appearance.background,fg=doc.appearance.text,btn=doc.appearance.button;
  const inputs=doc.fields.map(f=>{
    const k=escapeHtml(f.key),label=escapeHtml(f.label),req=f.required?' required':'';
    let input='';
    if(f.type==='textarea')input='<textarea id="f-'+k+'" name="'+k+'" maxlength="3000"'+req+'></textarea>';
    else if(f.type==='select')input='<select id="f-'+k+'" name="'+k+'"'+req+'><option value="">Choose one</option>'+
      f.options.map(x=>'<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>').join('')+'</select>';
    else if(f.type==='checkbox')input='<label class="check"><input id="f-'+k+'" type="checkbox" name="'+k+'"'+req+'><span>'+label+'</span></label>';
    else input='<input id="f-'+k+'" type="'+escapeHtml(f.type)+'" name="'+k+'" placeholder="'+escapeHtml(f.placeholder)+'" maxlength="300"'+req+'>';
    return '<div class="field">'+(f.type==='checkbox'?'':'<label for="f-'+k+'">'+label+(f.required?' *':'')+'</label>')+input+'</div>';
  }).join('');
  const done=message === 'success';
  const content=done
    ?'<h1>'+escapeHtml(doc.success.title)+'</h1><p>'+escapeHtml(doc.success.message)+'</p>'
    :'<h1>'+escapeHtml(doc.title)+'</h1><p>'+escapeHtml(doc.description)+'</p><form method="POST" action="/api/forms/public/'+escapeHtml(row.id)+'"><div class="trap" aria-hidden="true"><label>Leave this blank<input tabindex="-1" autocomplete="off" name="company_website_confirm"></label></div>'+inputs+'<button type="submit">Submit</button></form>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escapeHtml(doc.title)+'</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;padding:24px;background:'+bg+';color:'+fg+';font:15px/1.5 Inter,system-ui,sans-serif}main{max-width:580px;margin:0 auto}h1{font-size:clamp(22px,4vw,32px);letter-spacing:-.03em;margin:0 0 8px}p{opacity:.73;margin:0 0 28px}.field{margin:0 0 16px}.field>label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}input:not([type=checkbox]),textarea,select{display:block;width:100%;padding:12px 13px;min-height:45px;font:inherit;color:'+fg+';background:'+bg+';border:1px solid #a0a0a055;border-radius:'+doc.appearance.radius+'px}textarea{min-height:110px;resize:vertical}.check{display:flex;gap:10px;align-items:start}button{width:100%;border:0;padding:14px 20px;border-radius:'+doc.appearance.radius+'px;background:'+btn+';color:white;font:600 15px Inter,system-ui;cursor:pointer}.trap{position:absolute;left:-10000px;height:1px;overflow:hidden}</style></head><body><main>'+content+'</main></body></html>';
}


export async function handleAgentSamFormsPublic(request,env) {
  const path=new URL(request.url).pathname;
  const embed=/^\/forms\/embed\/(cmsg_[a-f0-9]{16})\/?$/.exec(path);
  const submit=/^\/api\/forms\/public\/(cmsg_[a-f0-9]{16})\/?$/.exec(path);
  if (!embed && !submit) return null;
  if (!env.DB?.prepare) return new Response('Forms unavailable',{status:503});
  if (embed && !['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  if (submit && request.method!=='POST') return new Response('Method not allowed',{status:405});
  try{
    const id=(embed||submit)[1];
    const record=await env.DB.prepare(
      "SELECT g.* FROM cms_globals g JOIN cms_sites s ON s.id=g.site_id AND s.account_id=g.account_id AND s.status='active' " +
      "JOIN agentsam_app_installations i ON i.account_id=g.account_id AND i.app_id=? AND i.enabled=1 " +
      "JOIN apps a ON a.id=i.app_id AND a.status='active' AND a.app_type='application' " +
      "WHERE g.id=? AND g.global_type='form' AND g.global_key LIKE 'form:%' AND g.status='published' LIMIT 1"
    ).bind(FORMS_APP_KEY,id).first();
    if (!record) return new Response('Form not found',{status:404,headers:publicHeaders});
    const row={...record,document_json:record.inline_content_json};
    if (embed) return new Response(request.method==='HEAD'?null:formHtml(row),{
      headers:{...publicHeaders,'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors *; base-uri 'none'"},
    });
    const origin=request.headers.get('origin');
    if (origin && origin!==new URL(request.url).origin) return new Response('Origin denied',{status:403});
    const data=await readData(request);
    if (String(data.company_website_confirm||'')) return new Response(formHtml(row,'success'),{
      headers:{...publicHeaders,'content-type':'text/html; charset=utf-8'},
    });
    const doc=normalizeFormDocument(JSON.parse(row.inline_content_json));
    const values=validateSubmission(doc,data);
    await env.DB.prepare(
      'INSERT INTO cms_form_submissions (account_id,site_id,form_id,payload_json,is_test) VALUES (?,?,?,?,0)'
    ).bind(row.account_id,row.site_id,row.id,JSON.stringify(values)).run();
    return new Response(formHtml(row,'success'),{
      headers:{...publicHeaders,'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'"},
    });
  }catch(error){
    const message=String(error?.message||error);
    return new Response(message.startsWith('required_')||slugErrors.has(message)?'Please check your form responses.':'Submission unavailable',{
      status:message.startsWith('required_')||slugErrors.has(message)?400:503,headers:publicHeaders,
    });
  }
}
