import { readStudioGoapGoals, updateStudioGoapGoal } from './studio-goap-goals.js';

/**
 * Authenticated personal living-plan adapter over existing user_goals.
 * No workspace/tenant fallback, no client-provided account owner and no
 * implicit completion from an AI chat response.
 */
const reply = (value, status = 200) => Response.json(value, {
  status, headers: { 'cache-control': 'private, no-store' },
});
const ROOT = '/api/studio/living-plan';
const ID = /^[a-zA-Z0-9_-]{3,100}$/;
const statuses = new Set(['todo', 'in_progress', 'blocked', 'done', 'skipped']);
const goalStatuses = new Set(['active', 'paused', 'completed']);
function title(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
async function jsonInput(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length') || 0) > 16_384) return null;
  const data = await request.json().catch(() => null);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}
export async function handleStudioLivingPlan(request, env, accountId) {
  if (!accountId) return reply({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return reply({ ok: false, error: 'database_unavailable' }, 503);
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return reply({ ok: false, error: 'origin_not_allowed' }, 403);
  }
  if (path === ROOT + '/tickets' && method === 'GET') {
    const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) || '';
    // No public/global catalog fallback: only account-owned engineering tickets.
    const matched = await env.DB.prepare(`SELECT id,title,status,project,subsystem,priority,updated_at
      FROM agentsam_tickets WHERE account_id=?
        AND (?='' OR title LIKE '%' || ? || '%' OR project LIKE '%' || ? || '%')
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'in_review' THEN 1
        WHEN 'blocked' THEN 2 WHEN 'backlog' THEN 3 ELSE 4 END,
        updated_at DESC LIMIT 25`).bind(accountId,query,query,query).all();
    return reply({ ok: true, tickets: matched.results || [] });
  }
  if (path === ROOT + '/goap') {
    const repositoryId = new URL(request.url).searchParams.get('repository') || '';
    if (!/^github:[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repositoryId))
      return reply({ ok: false, error: 'github_repository_required' }, 400);
    if (method === 'GET') {
      const limit = Math.max(1, Math.min(100, Number.parseInt(new URL(request.url).searchParams.get('limit'), 10) || 20));
      const tickets = await readStudioGoapGoals(env.DB,accountId,repositoryId,limit);
      return reply({ ok: true, repositoryId, tickets, currentTaskId: tickets.find(ticket => ticket.focused)?.id ?? null });
    }
    if (method === 'POST') {
      const result = await updateStudioGoapGoal(env.DB,accountId,repositoryId,await jsonInput(request));
      return result.ok ? reply(result) : reply({ ok: false, error: result.error },result.status);
    }
    return reply({ ok: false, error: 'method_not_allowed' },405);
  }
  if (path === ROOT && method === 'GET') {
    const [goals, steps, ticketLinks, goapGoals] = await Promise.all([
      env.DB.prepare(`SELECT id,source_key,title,description,goal_type,status,priority,
          target_date,completed_at,updated_at,metadata_json
        FROM user_goals WHERE account_id=?
          ORDER BY CASE WHEN source_key LIKE 'living-%' THEN 0 ELSE 1 END,
                   source_key,priority DESC,updated_at DESC`).bind(accountId).all(),
      env.DB.prepare(`SELECT s.id,s.goal_id,s.source_key,s.title,s.description,s.sort_order,
          s.status,s.note,s.evidence_ref,s.completed_at,s.updated_at
        FROM user_goal_steps s JOIN user_goals g ON g.id=s.goal_id
        WHERE s.account_id=? AND g.account_id=?
        ORDER BY s.goal_id,s.sort_order,s.id`).bind(accountId,accountId).all(),
      env.DB.prepare(`SELECT l.goal_id,l.ticket_id,t.title,t.status,t.project,
          t.subsystem,t.updated_at
        FROM user_goal_ticket_links l
        JOIN user_goals g ON g.id=l.goal_id
        JOIN agentsam_tickets t ON t.id=l.ticket_id
        WHERE l.account_id=? AND g.account_id=? AND t.account_id=?
        ORDER BY t.updated_at DESC`).bind(accountId,accountId,accountId).all(),
      readStudioGoapGoals(env.DB,accountId),
    ]);
    return reply({ ok: true, goals: goals.results || [], steps: steps.results || [],
      ticketLinks: ticketLinks.results || [], goapGoals });
  }
  if (path === ROOT + '/goals' && method === 'POST') {
    const data = await jsonInput(request);
    const name = title(data?.title);
    if (!data || !name) return reply({ ok: false, error: 'goal_title_required' }, 400);
    const type = data.goal_type === 'platform' ? 'platform' : 'personal';
    const id = 'goal_' + crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare(`INSERT INTO user_goals
      (id,account_id,goal_type,title,description,status,priority,metadata_json)
      VALUES (?,?,?,?,?,'active',1,'{"source":"manual"}')`)
      .bind(id,accountId,type,name,title(data.description,4000)).run();
    return reply({ ok: true, id }, 201);
  }
  const ticketLinkMatch = /^\/api\/studio\/living-plan\/goals\/([^/]+)\/tickets(?:\/([^/]+))?$/.exec(path);
  if (ticketLinkMatch && (method === 'POST' || method === 'DELETE')) {
    const goalId = ticketLinkMatch[1];
    if (!ID.test(goalId)) return reply({ ok:false, error:'invalid_goal' },400);
    const goal = await env.DB.prepare('SELECT id FROM user_goals WHERE id=? AND account_id=?')
      .bind(goalId,accountId).first();
    if (!goal) return reply({ ok:false, error:'not_found' },404);
    if (method === 'POST') {
      const body = await jsonInput(request);
      const ticketId = title(body?.ticket_id, 100);
      if (!ID.test(ticketId)) return reply({ ok:false, error:'invalid_ticket' },400);
      const ticket = await env.DB.prepare('SELECT id FROM agentsam_tickets WHERE id=? AND account_id=?')
        .bind(ticketId,accountId).first();
      if (!ticket) return reply({ ok:false, error:'ticket_not_found' },404);
      const existing = await env.DB.prepare(`SELECT ticket_id FROM user_goal_ticket_links
        WHERE account_id=? AND goal_id=? AND ticket_id=?`).bind(accountId,goalId,ticketId).first();
      if (!existing) {
        const activityId='activity_' + crypto.randomUUID().replace(/-/g,'');
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO user_goal_ticket_links(goal_id,ticket_id,account_id)
            VALUES(?,?,?)`).bind(goalId,ticketId,accountId),
          env.DB.prepare(`INSERT INTO user_goal_activity(id,account_id,goal_id,action,evidence_ref)
            VALUES(?,?,?,?,?)`).bind(activityId,accountId,goalId,'ticket_linked',ticketId),
        ]);
      }
      return reply({ ok:true });
    }
    const ticketId = ticketLinkMatch[2] || '';
    if (!ID.test(ticketId)) return reply({ok:false,error:'invalid_ticket'},400);
    const existing = await env.DB.prepare('SELECT ticket_id FROM user_goal_ticket_links WHERE goal_id=? AND ticket_id=? AND account_id=?')
      .bind(goalId,ticketId,accountId).first();
    if (!existing) return reply({ok:false,error:'not_found'},404);
    const activityId='activity_' + crypto.randomUUID().replace(/-/g,'');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM user_goal_ticket_links WHERE goal_id=? AND ticket_id=? AND account_id=?')
        .bind(goalId,ticketId,accountId),
      env.DB.prepare(`INSERT INTO user_goal_activity(id,account_id,goal_id,action,evidence_ref)
        VALUES(?,?,?,?,?)`).bind(activityId,accountId,goalId,'ticket_unlinked',ticketId),
    ]);
    return reply({ok:true});
  }
  const goalMatch = /^\/api\/studio\/living-plan\/goals\/([^/]+)$/.exec(path);
  if (goalMatch && method === 'PATCH') {
    const goalId = goalMatch[1], data = await jsonInput(request);
    if (!ID.test(goalId) || !data || !goalStatuses.has(data.status))
      return reply({ ok: false, error: 'invalid_goal' }, 400);
    const original = await env.DB.prepare('SELECT status FROM user_goals WHERE id=? AND account_id=?')
      .bind(goalId,accountId).first();
    if (!original) return reply({ ok: false, error: 'not_found' }, 404);
    if (original.status !== data.status) {
      const activityId = 'activity_' + crypto.randomUUID().replace(/-/g,'');
      await env.DB.batch([
        env.DB.prepare(`UPDATE user_goals SET status=?,
          completed_at=CASE WHEN ?='completed' THEN unixepoch() ELSE NULL END,
          updated_at=unixepoch() WHERE id=? AND account_id=?`)
          .bind(data.status,data.status,goalId,accountId),
        env.DB.prepare(`INSERT INTO user_goal_activity(id,account_id,goal_id,action)
          VALUES(?,?,?,?)`).bind(activityId,accountId,goalId,'goal_'+data.status),
      ]);
    }
    return reply({ ok: true });
  }
  const stepCreateMatch = /^\/api\/studio\/living-plan\/goals\/([^/]+)\/steps$/.exec(path);
  if (stepCreateMatch && method === 'POST') {
    const goalId = stepCreateMatch[1], data = await jsonInput(request);
    const name = title(data?.title,1500);
    if (!ID.test(goalId) || !name) return reply({ ok: false, error: 'step_title_required' }, 400);
    const owner = await env.DB.prepare('SELECT id FROM user_goals WHERE id=? AND account_id=?')
      .bind(goalId,accountId).first();
    if (!owner) return reply({ ok: false, error: 'not_found' }, 404);
    const id='step_' + crypto.randomUUID().replace(/-/g,'');
    await env.DB.prepare(`INSERT INTO user_goal_steps(id,account_id,goal_id,title,sort_order)
      VALUES (?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM user_goal_steps WHERE goal_id=? AND account_id=?))`)
      .bind(id,accountId,goalId,name,goalId,accountId).run();
    return reply({ ok:true,id }, 201);
  }
  const stepMatch = /^\/api\/studio\/living-plan\/steps\/([^/]+)$/.exec(path);
  if (stepMatch && method === 'PATCH') {
    const id = stepMatch[1], data = await jsonInput(request);
    if (!ID.test(id) || !data || !statuses.has(data.status))
      return reply({ ok: false, error: 'invalid_step' }, 400);
    const note = title(data.note,2000);
    const evidence = title(data.evidence_ref,1000);
    const original = await env.DB.prepare(`SELECT s.goal_id FROM user_goal_steps s
      JOIN user_goals g ON g.id=s.goal_id
      WHERE s.id=? AND s.account_id=? AND g.account_id=?`)
      .bind(id,accountId,accountId).first();
    if (!original) return reply({ ok: false, error: 'not_found' }, 404);
    const activityId='activity_' + crypto.randomUUID().replace(/-/g,'');
    await env.DB.batch([
      env.DB.prepare(`UPDATE user_goal_steps SET status=?,note=?,evidence_ref=?,
        completed_at=CASE WHEN ?='done' THEN unixepoch() ELSE NULL END,
        updated_at=unixepoch() WHERE id=? AND account_id=?`)
        .bind(data.status,note,evidence,data.status,id,accountId),
      env.DB.prepare(`INSERT INTO user_goal_activity(id,account_id,goal_id,step_id,action,evidence_ref)
        VALUES(?,?,?,?,?,?)`)
        .bind(activityId,accountId,original.goal_id,id,data.status,evidence),
    ]);
    return reply({ ok: true });
  }
  return reply({ ok: false, error: 'not_found' }, 404);
}
