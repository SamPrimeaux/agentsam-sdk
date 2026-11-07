/**
 * Hosted WorkHost API — real account-owned snapshot for Artifacts / Projects / Tickets.
 * Never returns populatedWorkFixture sample cards in production.
 */

import { listAccountLibraryResources, serveAccountLibraryFile, mutateAccountLibraryArtifact } from './work-library-resources.js';
import { handleWorkCadRequest, isWorkCadRequest } from './work-cad-models.js';
import { handleCanvasRequest, isCanvasRequest } from './work-canvas.js';
import { handleCanvasCms } from './work-canvas-cms.js';
import { handleSamSketchSceneRequest, isSamSketchSceneRequest } from './work-samsketch-scenes.js';
import { readProjectInsights } from './work-project-insights.js';
import { handleProjectTimer } from './work-project-metrics.js';
import { handleWorkData, isWorkDataRequest, listEvents, listProjects, listTickets, ticketAnalytics } from './work-data.js';
import { handleConnectorWorkRequest, isConnectorWorkRequest } from './connector-oauth.js';
import { handleIdeSourceRequest, isIdeSourceRequest } from './ide-source-service.js';
import { beginGmailOAuth, disconnectGmail, listGmailConnections, loadGmailMessages, mutateGmailMessage, sendGmailMessage } from './gmail-service.js';

const DEFAULT_NAV = Object.freeze([
  { id: 'calendar', label: 'Calendar', href: '/collaborate', group: 'work' },
  { id: 'tickets', label: 'Tickets', href: '/tickets', group: 'work' },
  { id: 'mail', label: 'Mail', href: '/mail', group: 'work' },
  { id: 'projects', label: 'Projects', href: '/projects', group: 'work' },
  { id: 'artifacts', label: 'Library', href: '/artifacts', group: 'files' },
]);

const WORK_CAPABILITIES = Object.freeze({
  tickets: { create: true, update: true, delete: true },
  projects: { create: true, update: true, delete: true },
  calendar: { create: true, update: true, delete: true },
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

const CLOUDFLARE_MAIL_SCOPES = Object.freeze({
  sending: ['email-sending.read', 'email-sending.write'],
  routing: [
    'email-routing-account-rule.read',
    'email-routing-address.read',
    'email-routing-address.write',
    'email-routing-rule.read',
    'email-routing-rule.write',
    'email-routing-suppression.read',
    'email-routing-suppression.write',
  ],
  security: [
    'cloud-email-security.read',
    'cloud-email-security.write',
    'email-security-dmarcreports.write',
  ],
});

function parseScopeSet(...values) {
  const out = new Set();
  for (const value of values) {
    if (!value) continue;
    let items = [];
    if (Array.isArray(value)) items = value;
    else {
      const raw = clean(value);
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed;
        else items = raw.split(/[\s,]+/);
      } catch {
        items = raw.split(/[\s,]+/);
      }
    }
    for (const item of items) {
      const normalized = clean(item).toLowerCase();
      if (normalized) out.add(normalized);
    }
  }
  return out;
}

async function loadCloudflareMailConnection(env, userId) {
  if (!env.DB?.prepare) return null;
  let row = null;
  try {
    row = await env.DB.prepare(
      "SELECT account_identifier, json_extract(metadata_json, '$.display') AS account_display, scopes, updated_at " +
        "FROM user_oauth_tokens WHERE account_id = ? AND LOWER(provider) = 'cloudflare' " +
        "AND COALESCE(is_active, 1) = 1 AND (revoked_at IS NULL OR revoked_at = 0) " +
        "ORDER BY updated_at DESC LIMIT 1"
    ).bind(userId).first();
  } catch {
    row = null;
  }

  const granted = parseScopeSet(row?.scope, row?.scopes);
  const capabilities = [];
  if (CLOUDFLARE_MAIL_SCOPES.sending.some((scope) => granted.has(scope))) capabilities.push('email.sending');
  if (CLOUDFLARE_MAIL_SCOPES.routing.some((scope) => granted.has(scope))) capabilities.push('email.routing');
  if (CLOUDFLARE_MAIL_SCOPES.security.some((scope) => granted.has(scope))) capabilities.push('email.security');

  if (!row) {
    return {
      id: 'cloudflare:email',
      provider: 'cloudflare',
      label: 'Cloudflare Email',
      kind: 'infrastructure',
      status: env.CLOUDFLARE_OAUTH_CLIENT_ID ? 'ready' : 'disconnected',
      accountLabel: null,
      capabilities: [],
      description: 'Email Sending, Email Routing, and Email Security capabilities.',
    };
  }

  return {
    id: 'cloudflare:email',
    provider: 'cloudflare',
    label: 'Cloudflare Email',
    kind: 'infrastructure',
    status: capabilities.length ? 'connected' : 'needs_scope',
    accountLabel: clean(row.account_display || row.account_identifier || 'Cloudflare'),
    capabilities,
    description: capabilities.length
      ? 'Connected Cloudflare email infrastructure.'
      : 'Cloudflare is connected, but email capabilities need authorization.',
  };
}

function gmailAccountFromConnectionId(connectionId) {
  const raw = clean(connectionId);
  const prefix = 'google_gmail:';
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : '';
}

function kindFromName(name, mime) {
  const lower = `${clean(name)} ${clean(mime)}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/.test(lower) || lower.includes('image/')) {
    return 'image';
  }
  if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/.test(lower) || lower.includes('video/')) {
    return 'video';
  }
  if (/\.(mp3|wav|flac|aac|ogg|m4a)(\?|$)/.test(lower) || lower.includes('audio/')) {
    return 'audio';
  }
  if (/\.(glb|gltf|obj|fbx|stl|3mf|usd|usda|usdc)(\?|$)/.test(lower) || lower.includes('model/')) {
    return 'model';
  }
  if (/\.(zip|tar|gz|tgz|7z|rar)(\?|$)/.test(lower) || lower.includes('zip') || lower.includes('archive')) {
    return 'archive';
  }
  if (/\.(js|ts|tsx|jsx|mjs|cjs|py|rs|go|java|css|html|json|yaml|yml)(\?|$)/.test(lower)) {
    return 'code';
  }
  return 'document';
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeLabel(unixSeconds) {
  const ts = Number(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Read a registered private drawing only through its owning project and
 * its matching R2 storage registration. No raw bucket key in the client URL. */
export async function readProjectDrawingFile(env, owner, projectId, drawingId) {
  if(!env.DB?.prepare || !env.CAD_PROJECT_ASSETS?.get || !clean(owner) ||
     !/^\d+$/.test(String(drawingId))) {
    return json({ok:false,error:'drawing_unavailable'},404);
  }
  const row=await env.DB.prepare(
    "SELECT d.r2_key,d.filename,d.title FROM project_draws d " +
    "JOIN projects p ON p.id=d.project_id " +
    "JOIN project_storage s ON s.id=d.storage_id AND s.project_id=p.id " +
    "WHERE d.id=? AND d.project_id=? AND p.owner_user_id=? " +
    "AND LOWER(s.storage_type)='r2' AND s.storage_name='cad' AND s.status='active' LIMIT 1"
  ).bind(Number(drawingId),projectId,owner).first();
  if(!row || !clean(row.r2_key))return json({ok:false,error:'drawing_not_found'},404);
  const file=await env.CAD_PROJECT_ASSETS.get(clean(row.r2_key));
  if(!file)return json({ok:false,error:'drawing_file_missing'},404);
  const name=(clean(row.filename)||clean(row.title)||('drawing-'+drawingId))
    .replace(/[\r\n"\\]/g,'_').slice(0,120);
  const lower=name.toLowerCase();
  const inline= /\.(pdf|png|jpe?g|webp|gif)$/i.test(lower);
  const type=/\.pdf$/i.test(lower)?'application/pdf':
    /\.png$/i.test(lower)?'image/png':
    /\.jpe?g$/i.test(lower)?'image/jpeg':
    /\.webp$/i.test(lower)?'image/webp':
    /\.gif$/i.test(lower)?'image/gif':'application/octet-stream';
  return new Response(file.body,{status:200,headers:{
    'content-type':type,
    'content-disposition':(inline?'inline':'attachment')+'; filename="'+name+'"',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'SAMEORIGIN',
    'content-security-policy':"default-src 'none'; frame-ancestors 'self'",
  }});
}

/** Registered CAD drawings are still first-class project files, even before
 * they are reindexed into media_assets. Require both the canonical project owner
 * and an existing matching project_storage registration. Never expose R2 keys. */
export async function loadProjectDraws(db,owner) {
  if (!db?.prepare || !clean(owner)) return [];
  try {
    const result = await db.prepare(
      "SELECT d.id,d.project_id,d.title,d.filename,d.generation_type,d.created_at,d.sha256 " +
      "FROM project_draws d JOIN projects p ON p.id=d.project_id " +
      "JOIN project_storage s ON s.id=d.storage_id AND s.project_id=d.project_id " +
      "WHERE p.owner_user_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT 500"
    ).bind(owner).all();
    return (result.results||[]).map(row=>{
      const name=clean(row.title)||clean(row.filename)||('CAD drawing '+row.id);
      const when=Date.parse(clean(row.created_at).replace(' ','T')+'Z');
      return {
        id:'draw:'+row.id,
        projectId:clean(row.project_id),
        name,
        source:'artifacts',
        kind:kindFromName(clean(row.filename)||name,null),
        preview:'/api/work/projects/'+encodeURIComponent(clean(row.project_id))+'/draws/'+encodeURIComponent(String(row.id))+'/file',
        updatedAt:Number.isFinite(when)?when:null,
        updatedLabel:Number.isFinite(when)?relativeLabel(when/1000):null,
        description:clean(row.generation_type)||'CAD drawing',
      };
    });
  } catch (err) {
    console.error('work_project_draws_unavailable',String(err));
    return [];
  }
}

/** Explicit project media registrations. Project authorization comes from the
 * same owner-scoped projects table as Work, never from a bucket key prefix. */
export function isWorkRequest(pathname) {
  return (
    pathname === '/api/work/snapshot' ||
    /^\/api\/work\/library\/artifacts\/[A-Za-z0-9_-]+(?:\/file)?$/.test(pathname) ||
    isCanvasRequest(pathname) ||
    /^\/api\/work\/canvases\/[A-Za-z0-9_-]+\/cms\/(validate|convert)$/.test(pathname) ||
    isWorkCadRequest(pathname) ||
    isSamSketchSceneRequest(pathname) ||
    /^\/api\/work\/projects\/[^/]+\/insights$/.test(pathname) ||
    /^\/api\/work\/projects\/[^/]+\/timer\/(start|stop)$/.test(pathname) ||
    /^\/api\/work\/projects\/[^/]+\/draws\/\d+\/file$/.test(pathname) ||
    pathname === '/api/work/gmail/oauth/start' ||
    pathname === '/api/work/gmail/status' ||
    pathname === '/api/work/gmail/disconnect' ||
    isConnectorWorkRequest(pathname) ||
    isIdeSourceRequest(pathname) ||
    pathname === '/api/mail/send' ||
    isWorkDataRequest(pathname) ||
    /^\/api\/mail\/email\/[^/]+$/.test(pathname)
  );
}

export async function handleWorkRequest(request, env, accountId, context = {}) {
  if (!accountId) return json({ ok: false, error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  try {
    const canvasCms = /^\/api\/work\/canvases\/([A-Za-z0-9_-]+)\/cms\/(validate|convert)$/.exec(url.pathname);
    if (canvasCms) return handleCanvasCms(request, env, accountId, canvasCms[1], canvasCms[2]);
    if (isCanvasRequest(url.pathname)) return handleCanvasRequest(request, env, accountId, context);
    if (isWorkCadRequest(url.pathname)) return handleWorkCadRequest(request, env, accountId);
    if (isSamSketchSceneRequest(url.pathname)) return handleSamSketchSceneRequest(request, env, accountId);
    const privateAsset = /^\/api\/work\/library\/artifacts\/([A-Za-z0-9_-]+)\/file$/.exec(url.pathname);
    if (privateAsset && method === 'GET') return serveAccountLibraryFile(env, accountId, privateAsset[1], url.searchParams.get('preview') === '1');
    const artifactPatch = /^\/api\/work\/library\/artifacts\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (artifactPatch && method === 'PATCH') return mutateAccountLibraryArtifact(request, env, accountId, artifactPatch[1]);
    const dataResponse = await handleWorkData(request, env.DB, accountId, url);
    if (dataResponse) return dataResponse;
    const insightsRoute = /^\/api\/work\/projects\/([^/]+)\/insights$/.exec(url.pathname);
    if (insightsRoute && method === 'GET') {
      const id = decodeURIComponent(insightsRoute[1]);
      const insights = await readProjectInsights(env.DB, accountId, id);
      return insights ? json({ ok: true, insights }) : json({ ok: false, error: 'project_not_found' }, 404);
    }

    const fileRoute = /^\/api\/work\/projects\/([^/]+)\/draws\/(\d+)\/file$/.exec(url.pathname);
    if(fileRoute && method==='GET'){
      return readProjectDrawingFile(env,accountId,decodeURIComponent(fileRoute[1]),fileRoute[2]);
    }
    const timerRoute = /^\/api\/work\/projects\/([^/]+)\/timer\/(start|stop)$/.exec(url.pathname);
    if (timerRoute && method === 'POST') {
      const id = decodeURIComponent(timerRoute[1]);
      return handleProjectTimer(request, env.DB, accountId, id, timerRoute[2]);
    }

    if (url.pathname === '/api/work/snapshot' && method === 'GET') {
      const surface = clean(url.searchParams.get('surface'));
      const needsTickets = !surface || ['tickets', 'projects', 'project-detail', 'artifact-tickets', 'calendar'].includes(surface);
      const needsArtifacts = !surface || ['artifacts', 'artifact-tickets', 'projects', 'project-detail'].includes(surface);
      const needsProjects = !surface || ['projects', 'project-detail', 'tickets', 'calendar', 'artifact-tickets'].includes(surface);
      const needsCalendar = !surface || ['calendar', 'project-detail'].includes(surface);
      const needsMail = surface === 'mail';

      const [tickets, registeredLibrary, projectDraws, gmailConnections, cloudflareMail] = await Promise.all([
        needsTickets ? listTickets(env.DB, accountId) : Promise.resolve([]),
        needsArtifacts ? listAccountLibraryResources(env.DB, accountId) : Promise.resolve([]),
        needsArtifacts ? loadProjectDraws(env.DB, accountId) : Promise.resolve([]),
        needsMail ? listGmailConnections(env, accountId) : Promise.resolve([]),
        needsMail ? loadCloudflareMailConnection(env, accountId) : Promise.resolve(null),
      ]);
      // Prefer registered project metadata without losing the existing R2 view.
      const artifacts = [...registeredLibrary, ...projectDraws];
      const mailConnections = needsMail
        ? [...gmailConnections, ...(cloudflareMail ? [cloudflareMail] : [])]
        : [];
      const requestedMailConnectionId = clean(url.searchParams.get('mail_connection'));
      const selectedGmailId = requestedMailConnectionId && gmailConnections.some((item) => item.id === requestedMailConnectionId)
        ? requestedMailConnectionId
        : (gmailConnections.length === 1 ? gmailConnections[0].id : '');
      const selectedGmailAccount = gmailAccountFromConnectionId(selectedGmailId);
      const [projects, mail, calendar] = await Promise.all([
        needsProjects ? listProjects(env.DB, accountId, tickets) : Promise.resolve([]),
        needsMail && selectedGmailAccount
          ? loadGmailMessages(env, accountId, selectedGmailAccount)
          : Promise.resolve([]),
        needsCalendar
          ? listEvents(env.DB, accountId, { from: url.searchParams.get('from'), to: url.searchParams.get('to') })
          : Promise.resolve([]),
      ]);
      const snapshot = {
        fixtureName: 'live',
        nav: [...DEFAULT_NAV],
        tickets,
        artifacts,
        projects,
        mail,
        ...(needsMail ? {
          mailConnections,
          activeMailConnectionId: selectedGmailId || null,
        } : {}),
        calendar,
        source: 'hosted',
        capabilities: WORK_CAPABILITIES,
        currentProjectId: projects[0]?.id || '',
        ticketAnalytics: ticketAnalytics(tickets),
      };
      return json({ ok: true, snapshot });
    }

    if (isIdeSourceRequest(url.pathname)) return handleIdeSourceRequest(request, env, accountId);
    if (isConnectorWorkRequest(url.pathname)) return handleConnectorWorkRequest(request, env, accountId);

    if (url.pathname === '/api/work/gmail/oauth/start' && method === 'POST') {
      return beginGmailOAuth(request, env, accountId);
    }

    if (url.pathname === '/api/work/gmail/status' && method === 'GET') {
      return json({ ok: true, connections: await listGmailConnections(env, accountId) });
    }

    if (url.pathname === '/api/work/gmail/disconnect' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const accountIdentifier = gmailAccountFromConnectionId(body.connection_id || body.connectionId);
      return json(await disconnectGmail(env, accountId, accountIdentifier));
    }

    if (url.pathname === '/api/mail/send' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const accountIdentifier = gmailAccountFromConnectionId(body.connection_id || body.connectionId);
      return json(await sendGmailMessage(env, accountId, body, accountIdentifier));
    }

    const mailMatch = url.pathname.match(/^\/api\/mail\/email\/([^/]+)$/);
    if (mailMatch && method === 'PATCH') {
      const messageId = decodeURIComponent(mailMatch[1]);
      const body = await request.json().catch(() => ({}));
      const accountIdentifier = gmailAccountFromConnectionId(body.connection_id || body.connectionId);
      return json(await mutateGmailMessage(env, accountId, messageId, body, accountIdentifier));
    }

    return json({ ok: false, error: 'not_found' }, 404);
  } catch (err) {
    console.error('work_service_error', String(err));
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
