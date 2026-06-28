export async function createSession({ env, agent, lane, goal }) {
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    agent,
    lane,
    goal: goal ?? null,
    status: 'created',
    created_at: now,
    updated_at: now,
  };

  if (env?.KV?.put) {
    await env.KV.put(`agentsam:session:${session.id}`, JSON.stringify(session), { expirationTtl: 60 * 60 * 24 * 7 });
  }

  if (env?.DB?.prepare) {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        lane TEXT NOT NULL,
        goal TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();

    await env.DB.prepare(
      `INSERT INTO agent_sessions (id, agent, lane, goal, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(session.id, session.agent, session.lane, session.goal, session.status, session.created_at, session.updated_at).run();
  }

  return session;
}

export async function getSession({ env, sessionId }) {
  if (!sessionId) return null;

  if (env?.KV?.get) {
    const raw = await env.KV.get(`agentsam:session:${sessionId}`);
    if (raw) return JSON.parse(raw);
  }

  if (env?.DB?.prepare) {
    const row = await env.DB.prepare('SELECT * FROM agent_sessions WHERE id = ?').bind(sessionId).first();
    if (row) return row;
  }

  return null;
}
