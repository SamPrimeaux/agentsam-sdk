/**
 * Hosted WorkHost API — real account-owned snapshot for Artifacts / Projects / Tickets.
 * Never returns populatedWorkFixture sample cards in production.
 */

import { resolveWebsiteAssets } from './bindings.js';

const DEFAULT_NAV = Object.freeze([
  { id: 'calendar', label: 'Calendar', href: '/collaborate', group: 'work' },
  { id: 'tickets', label: 'Tickets', href: '/collaborate?seg=tickets', group: 'work' },
  { id: 'mail', label: 'Mail', href: '/mail', group: 'work' },
  { id: 'projects', label: 'Projects', href: '/projects', group: 'work' },
  { id: 'artifacts', label: 'My artifacts', href: '/artifacts', group: 'files' },
  { id: 'r2', label: 'R2 Storage', href: '/artifacts?source=r2', group: 'files' },
  { id: 'google-drive', label: 'Google Drive', href: '/artifacts?source=google-drive', group: 'files' },
  { id: 'shared-drives', label: 'Shared drives', href: '/artifacts?source=shared-drives', group: 'files' },
  { id: 'local-folder', label: 'Local folder', href: '/artifacts?source=local', group: 'files' },
  { id: 'shared-with-me', label: 'Shared with me', href: '/artifacts?view=shared', group: 'files' },
  { id: 'recent', label: 'Recent', href: '/artifacts?view=recent', group: 'files' },
  { id: 'starred', label: 'Starred', href: '/artifacts?view=starred', group: 'files' },
  { id: 'trash', label: 'Trash', href: '/artifacts?view=trash', group: 'files' },
]);

const ACCENTS = Object.freeze([
  '#1a73e8',
  '#188038',
  '#c5221f',
  '#e37400',
  '#9334e6',
  '#007b83',
]);

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

function initialsFrom(name) {
  const parts = clean(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'PR';
  return parts.map((p) => p[0]).join('').toUpperCase();
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
  } catch {
    return clean(value)
      .split(/[,|]/)
      .map(clean)
      .filter(Boolean);
  }
}

function mapTicketStatus(raw) {
  const status = clean(raw).toLowerCase();
  const allowed = new Set([
    'backlog',
    'active',
    'blocked',
    'in_review',
    'shipped',
    'abandoned',
  ]);
  return allowed.has(status) ? status : 'backlog';
}

function mapProjectStatus(raw) {
  const status = clean(raw).toLowerCase();
  const allowed = new Set([
    'planning',
    'active',
    'review',
    'blocked',
    'complete',
    'production',
  ]);
  if (allowed.has(status)) return status;
  if (status === 'published' || status === 'live') return 'production';
  if (status === 'archived') return 'complete';
  return 'active';
}

function kindFromName(name, mime) {
  const lower = `${clean(name)} ${clean(mime)}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/.test(lower) || lower.includes('image/')) {
    return 'image';
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

async function tableExists(db, name) {
  if (!db?.prepare) return false;
  try {
    const row = await db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
      .bind(name)
      .first();
    return Boolean(row?.ok);
  } catch {
    return false;
  }
}

async function loadTickets(db, accountId) {
  if (!(await tableExists(db, 'agentsam_tickets'))) return [];
  try {
    const res = await db
      .prepare(
        `SELECT id, title, description, status, priority, project, tags, blocked_by, blocks,
                surface, updated_at, client_id
           FROM agentsam_tickets
          WHERE account_id = ?
          ORDER BY updated_at DESC
          LIMIT 200`,
      )
      .bind(accountId)
      .all();
    return (res.results || []).map((row) => ({
      id: clean(row.id),
      title: clean(row.title) || 'Untitled ticket',
      description: row.description != null ? String(row.description) : null,
      status: mapTicketStatus(row.status),
      priority: clean(row.priority) || null,
      project: clean(row.project) || null,
      clientId: clean(row.client_id) || null,
      tags: parseJsonArray(row.tags),
      blockedBy: parseJsonArray(row.blocked_by),
      blocks: parseJsonArray(row.blocks),
      surface: clean(row.surface) === 'collaborate' ? 'collaborate' : 'platform',
      updatedAt: Number(row.updated_at) || Math.floor(Date.now() / 1000),
    }));
  } catch (err) {
    console.error('work_snapshot_tickets_error', String(err));
    return [];
  }
}

async function loadProjects(db, accountId, tickets) {
  const projects = [];
  const seen = new Set();

  const pushProject = (row, index) => {
    const id = clean(row.id || row.project_id || row.slug || row.name);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const name = clean(row.name || row.title || row.slug || id);
    const openTasks = tickets.filter(
      (t) =>
        clean(t.project) === id ||
        clean(t.project) === name ||
        clean(t.project).toLowerCase() === name.toLowerCase(),
    ).length;
    projects.push({
      id,
      name,
      description: clean(row.description || row.summary || '') || undefined,
      projectType: clean(row.project_type || row.type || row.kind || 'project') || 'project',
      status: mapProjectStatus(row.status || row.state),
      progress: Math.max(0, Math.min(100, Number(row.progress ?? row.percent_complete ?? 0) || 0)),
      coverImageUrl: clean(row.cover_image_url || row.cover_url || '') || null,
      initials: clean(row.initials) || initialsFrom(name),
      accent: clean(row.accent || row.primary_color) || ACCENTS[index % ACCENTS.length],
      githubRepo: clean(row.github_repo || row.repo || row.repository || '') || null,
      openTasks,
      trackedMinutes: Math.max(0, Number(row.tracked_minutes || 0) || 0),
    });
  };

  if (await tableExists(db, 'projects')) {
    try {
      // Prefer account-scoped rows when the column exists; fall back to all readable rows.
      let rows = [];
      try {
        const scoped = await db
          .prepare(
            `SELECT * FROM projects
              WHERE account_id = ? OR owner_id = ? OR user_id = ?
              ORDER BY updated_at DESC
              LIMIT 100`,
          )
          .bind(accountId, accountId, accountId)
          .all();
        rows = scoped.results || [];
      } catch {
        const all = await db
          .prepare(
            `SELECT * FROM projects
              ORDER BY COALESCE(updated_at, created_at, 0) DESC
              LIMIT 100`,
          )
          .all();
        rows = all.results || [];
      }
      rows.forEach((row, index) => pushProject(row, index));
    } catch (err) {
      console.error('work_snapshot_projects_error', String(err));
    }
  }

  // CMS sites the account can author are real projects too (not fixture gallery cards).
  if (await tableExists(db, 'cms_pages')) {
    try {
      const res = await db
        .prepare(
          `SELECT project_slug AS id, project_slug AS name, COUNT(*) AS page_count
             FROM cms_pages
            WHERE project_slug IS NOT NULL AND TRIM(project_slug) != ''
            GROUP BY project_slug
            ORDER BY MAX(updated_at) DESC
            LIMIT 50`,
        )
        .all();
      for (const [index, row] of (res.results || []).entries()) {
        pushProject(
          {
            id: row.id,
            name: row.name,
            description: `${Number(row.page_count) || 0} CMS page(s)`,
            project_type: 'cms-site',
            status: 'production',
          },
          projects.length + index,
        );
      }
    } catch (err) {
      console.error('work_snapshot_cms_projects_error', String(err));
    }
  }

  return projects;
}

async function loadArtifacts(env, origin) {
  const website = resolveWebsiteAssets(env);
  if (!website?.binding?.list) return [];

  const prefixes = ['artifacts/', 'sites/agentsam-sdk/public/artifacts/', 'uploads/'];
  const out = [];
  const seen = new Set();

  for (const prefix of prefixes) {
    try {
      const listed = await website.binding.list({ prefix, limit: 80 });
      for (const obj of listed.objects || []) {
        const key = clean(obj.key);
        if (!key || seen.has(key)) continue;
        // Skip partials / html shells — keep file-like artifacts only.
        if (key.endsWith('/') || key.includes('/partials/')) continue;
        const name = key.split('/').pop() || key;
        if (!name || name === 'index.html') continue;
        seen.add(key);
        const mime = clean(obj.httpMetadata?.contentType) || null;
        const uploaded = obj.uploaded
          ? Math.floor(new Date(obj.uploaded).getTime() / 1000)
          : null;
        out.push({
          id: key,
          name,
          kind: kindFromName(name, mime),
          source: prefix.startsWith('sites/') || prefix.startsWith('artifacts/') ? 'r2' : 'artifacts',
          preview: mime?.startsWith('image/')
            ? `${origin}/site/${key.replace(/^sites\/[^/]+\/public\//, '')}`
            : null,
          mime,
          sizeLabel: formatBytes(obj.size),
          updatedLabel: relativeLabel(uploaded),
        });
      }
    } catch (err) {
      console.error('work_snapshot_artifacts_error', prefix, String(err));
    }
  }

  return out.slice(0, 100);
}

function ticketAnalytics(tickets) {
  if (!tickets.length) {
    return {
      completionRate: 0,
      avgCycleDays: 0,
      oldestActiveDays: 0,
    };
  }
  const shipped = tickets.filter((t) => t.status === 'shipped').length;
  const active = tickets.filter((t) =>
    ['active', 'blocked', 'in_review'].includes(t.status),
  );
  const now = Math.floor(Date.now() / 1000);
  const oldestActiveDays = active.length
    ? Math.max(
        ...active.map((t) => Math.max(0, Math.floor((now - Number(t.updatedAt || now)) / 86400))),
      )
    : 0;
  return {
    completionRate: Math.round((shipped / tickets.length) * 100),
    avgCycleDays: 0,
    oldestActiveDays,
  };
}

export function isWorkRequest(pathname) {
  return (
    pathname === '/api/work/snapshot' ||
    pathname === '/api/tickets' ||
    /^\/api\/tickets\/[^/]+$/.test(pathname) ||
    /^\/api\/mail\/email\/[^/]+$/.test(pathname)
  );
}

export async function handleWorkRequest(request, env, accountId) {
  if (!accountId) return json({ ok: false, error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  try {
    if (url.pathname === '/api/work/snapshot' && method === 'GET') {
      const [tickets, artifacts] = await Promise.all([
        loadTickets(env.DB, accountId),
        loadArtifacts(env, url.origin),
      ]);
      const projects = await loadProjects(env.DB, accountId, tickets);
      const snapshot = {
        fixtureName: 'live',
        nav: [...DEFAULT_NAV],
        tickets,
        artifacts,
        projects,
        mail: [],
        calendar: [],
        currentProjectId: projects[0]?.id || '',
        ticketAnalytics: ticketAnalytics(tickets),
      };
      return json({ ok: true, snapshot });
    }

    if (url.pathname === '/api/tickets' && method === 'POST') {
      if (!(await tableExists(env.DB, 'agentsam_tickets'))) {
        return json({ ok: false, error: 'tickets_table_unavailable' }, 501);
      }
      const body = await request.json().catch(() => ({}));
      const id = `tkt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = Math.floor(Date.now() / 1000);
      const title = clean(body.title) || 'Untitled ticket';
      const surface = clean(body.surface) === 'collaborate' ? 'collaborate' : 'platform';
      const status = mapTicketStatus(body.status || 'backlog');
      await env.DB.prepare(
        `INSERT INTO agentsam_tickets (
           id, title, description, status, priority, project, tags, blocked_by, blocks,
           surface, created_at, updated_at, account_id, repository_id, source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      )
        .bind(
          id,
          title,
          body.description != null ? String(body.description) : null,
          status,
          clean(body.priority) || null,
          clean(body.project) || null,
          JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
          JSON.stringify(Array.isArray(body.blockedBy) ? body.blockedBy : []),
          JSON.stringify(Array.isArray(body.blocks) ? body.blocks : []),
          surface,
          now,
          now,
          accountId,
          clean(body.repository_id || body.repositoryId) || 'repo_unscoped',
        )
        .run();
      return json({
        ok: true,
        ticket: {
          id,
          title,
          description: body.description != null ? String(body.description) : null,
          status,
          priority: clean(body.priority) || null,
          project: clean(body.project) || null,
          clientId: null,
          tags: Array.isArray(body.tags) ? body.tags.map(clean).filter(Boolean) : [],
          blockedBy: [],
          blocks: [],
          surface,
          updatedAt: now,
        },
      }, 201);
    }

    const ticketMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)$/);
    if (ticketMatch && method === 'PATCH') {
      if (!(await tableExists(env.DB, 'agentsam_tickets'))) {
        return json({ ok: false, error: 'tickets_table_unavailable' }, 501);
      }
      const ticketId = decodeURIComponent(ticketMatch[1]);
      const body = await request.json().catch(() => ({}));
      const existing = await env.DB.prepare(
        `SELECT * FROM agentsam_tickets WHERE id = ? AND account_id = ? LIMIT 1`,
      )
        .bind(ticketId, accountId)
        .first();
      if (!existing) return json({ ok: false, error: 'ticket_not_found' }, 404);
      const now = Math.floor(Date.now() / 1000);
      const next = {
        title: body.title != null ? clean(body.title) : existing.title,
        description:
          body.description !== undefined
            ? body.description == null
              ? null
              : String(body.description)
            : existing.description,
        status: body.status != null ? mapTicketStatus(body.status) : existing.status,
        priority: body.priority !== undefined ? clean(body.priority) || null : existing.priority,
        project: body.project !== undefined ? clean(body.project) || null : existing.project,
        surface:
          body.surface != null
            ? clean(body.surface) === 'collaborate'
              ? 'collaborate'
              : 'platform'
            : existing.surface,
      };
      await env.DB.prepare(
        `UPDATE agentsam_tickets
            SET title = ?, description = ?, status = ?, priority = ?, project = ?,
                surface = ?, updated_at = ?
          WHERE id = ? AND account_id = ?`,
      )
        .bind(
          next.title,
          next.description,
          next.status,
          next.priority,
          next.project,
          next.surface,
          now,
          ticketId,
          accountId,
        )
        .run();
      return json({
        ok: true,
        ticket: {
          id: ticketId,
          title: next.title,
          description: next.description,
          status: mapTicketStatus(next.status),
          priority: next.priority,
          project: next.project,
          clientId: clean(existing.client_id) || null,
          tags: parseJsonArray(existing.tags),
          blockedBy: parseJsonArray(existing.blocked_by),
          blocks: parseJsonArray(existing.blocks),
          surface: next.surface,
          updatedAt: now,
        },
      });
    }

    const mailMatch = url.pathname.match(/^\/api\/mail\/email\/([^/]+)$/);
    if (mailMatch && method === 'PATCH') {
      // Hosted mail mutations are not wired yet — fail loud instead of pretending.
      return json({ ok: false, error: 'mail_not_available_on_hosted' }, 501);
    }

    return json({ ok: false, error: 'not_found' }, 404);
  } catch (err) {
    console.error('work_service_error', String(err));
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
