import { TICKET_TO_GOAL_STATUS } from '../../../../packages/agentsam-goap/src/contracts.js';

const CLI_SOURCE = 'agentsam_sdk';

// Shared focus belongs to the account and repository. Older blackboard
// pointers are a read fallback for repositories with no focus receipt.
const focusSql = `COALESCE((
  SELECT CASE WHEN e.event_type='goal_activated' THEN e.ticket_id ELSE '' END
  FROM agentsam_ticket_events e
  JOIN agentsam_tickets et ON et.id=e.ticket_id
  WHERE e.event_type IN ('goal_activated','goal_released') AND et.account_id=t.account_id
    AND et.repository_id=t.repository_id
  ORDER BY e.created_at DESC, e.rowid DESC LIMIT 1
),w.current_task_id)`;

export async function readStudioGoapGoals(db, accountId, repositoryId = '', limit = 50) {
  const { results = [] } = await db.prepare(`SELECT t.id, t.title, t.description, t.status,
      t.project, t.subsystem, t.priority, t.repository_id, t.updated_at, t.linked_commit,
      CASE WHEN t.id=(${focusSql}) AND t.status NOT IN ('shipped','abandoned') THEN 1 ELSE 0 END focused
    FROM agentsam_tickets t
    JOIN code_repositories r ON r.id=t.repository_id AND r.account_id=t.account_id
    LEFT JOIN agentsam_workspace_state w ON w.repository_id=r.id
    WHERE t.account_id=? AND (?='' OR r.id=?)
      AND (?<>'' OR t.source=? OR t.id=(${focusSql}) OR EXISTS (
        SELECT 1 FROM agentsam_ticket_events e WHERE e.ticket_id=t.id AND e.event_type='goal_activated'
      ))
    ORDER BY focused DESC, t.updated_at DESC, t.id LIMIT ?`)
    .bind(accountId,repositoryId,repositoryId,repositoryId,CLI_SOURCE,limit).all();
  return results.map(row => ({
    ...row, focused: Boolean(row.focused), goal_status: TICKET_TO_GOAL_STATUS[row.status],
  }));
}

export async function updateStudioGoapGoal(db, accountId, repositoryId, input) {
  const repository = await db.prepare('SELECT id, name FROM code_repositories WHERE id=? AND account_id=? AND is_active=1')
    .bind(repositoryId,accountId).first();
  if (!repository) return { error: 'repository_not_registered', status: 404 };

  const { action } = input || {};
  if (!['create','activate','close'].includes(action)) return { error: 'invalid_goap_action', status: 400 };

  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
  const title = text(input.title,240);
  const priority = input.priority || 'P2';
  if (action === 'create' && (!title || !/^P[0-3]$/.test(priority))) {
    return { error: 'invalid_goap_goal', status: 400 };
  }
  const status = action === 'close' ? (input.status || 'shipped') : 'active';
  if (action === 'close' && !['shipped','abandoned','blocked'].includes(status)) {
    return { error: 'invalid_goap_status', status: 400 };
  }

  let id = text(input.ticketId,100);
  if (action === 'create') id = 'tkt_' + crypto.randomUUID().replaceAll('-','').slice(0,16);
  if (action === 'close' && !id) {
    const goals = await readStudioGoapGoals(db,accountId,repositoryId,1);
    id = goals.find(goal => goal.focused)?.id;
  }
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return { error: 'goap_ticket_required', status: 400 };

  const activation = action !== 'close';
  const statements = [];
  if (action === 'create') {
    statements.push(db.prepare(`INSERT INTO agentsam_tickets
      (id,title,description,status,project,subsystem,priority,source,account_id,repository_id,created_at,updated_at)
      VALUES (?,?,?,'active',?,?,?,?,?,?,unixepoch(),unixepoch())`)
      .bind(id,title,text(input.description,4000),repository.name,text(input.subsystem,80) || 'agent-runtime',
        priority,CLI_SOURCE,accountId,repositoryId));
  }

  if (!activation) {
    statements.push(db.prepare(`INSERT INTO agentsam_ticket_events
      (id,ticket_id,event_type,from_status,to_status,actor_type,created_at)
      SELECT 'tke_' || lower(hex(randomblob(16))),t.id,'goal_released',t.status,?,'agentsam_sdk',unixepoch()
      FROM agentsam_tickets t
      LEFT JOIN agentsam_workspace_state w ON w.repository_id=t.repository_id
      WHERE t.id=? AND t.account_id=? AND t.repository_id=? AND t.id=(${focusSql})`)
      .bind(status,id,accountId,repositoryId));
  }

  const eventId = 'tke_' + crypto.randomUUID().replaceAll('-','');
  statements.push(db.prepare(`INSERT INTO agentsam_ticket_events
    (id,ticket_id,event_type,from_status,to_status,detail,actor_type,created_at)
    SELECT ?,id,?,CASE WHEN ?='create' THEN NULL ELSE status END,?,?,'agentsam_sdk',unixepoch()
    FROM agentsam_tickets WHERE id=? AND account_id=? AND repository_id=?`)
    .bind(eventId,activation ? 'goal_activated' : 'status_change',action,status,text(input.reason,1000),
      id,accountId,repositoryId));
  statements.push(db.prepare(`UPDATE agentsam_tickets
    SET status=?, status_reason=?, closed_at=CASE WHEN ? IN ('shipped','abandoned') THEN unixepoch()
          WHEN ?='active' THEN NULL ELSE closed_at END,
        updated_at=unixepoch()
    WHERE id=? AND account_id=? AND repository_id=?`)
    .bind(status,text(input.reason,1000) || null,status,status,id,accountId,repositoryId));
  const result = await db.batch(statements);
  if (!result.at(-1)?.meta?.changes) return { error: 'goap_ticket_not_found', status: 404 };
  return { ok: true, ticketId: id, status, ...(action === 'create' ? { title, priority } : {}) };
}
