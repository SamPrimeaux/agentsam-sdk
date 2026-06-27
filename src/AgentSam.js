import { json, notFound, readJson } from './lib/responses.js';
import { createSession, getSession } from './lib/sessions.js';
import { routeIntent } from './lib/router.js';
import { getToolCatalog } from './lib/tools.js';

export class AgentSam {
  constructor(options = {}) {
    this.env = options.env ?? {};
    this.agent = options.agent ?? 'orchestrator';
    this.lane = options.lane ?? 'fullstack';
    this.project = options.project ?? 'agentsam-project';
  }

  async handle(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (request.method === 'GET' && path === '/api/health') {
      return json({ ok: true, service: 'AgentSam', agent: this.agent, lane: this.lane, status: 'online' });
    }

    if (request.method === 'GET' && path === '/api/agentsam/info') {
      return json({
        ok: true,
        name: 'AgentSam SDK',
        project: this.project,
        agent: this.agent,
        lane: this.lane,
        capabilities: getToolCatalog(this.lane).map((tool) => tool.name),
      });
    }

    if (request.method === 'POST' && path === '/api/agentsam/session') {
      const body = await readJson(request);
      const session = await createSession({ env: this.env, agent: this.agent, lane: this.lane, goal: body.goal });
      return json({ ok: true, session });
    }

    if (request.method === 'GET' && path.startsWith('/api/agentsam/session/')) {
      const sessionId = path.split('/').pop();
      const session = await getSession({ env: this.env, sessionId });
      if (!session) return json({ ok: false, error: 'session_not_found' }, 404);
      return json({ ok: true, session });
    }

    if (request.method === 'POST' && path === '/api/agentsam/message') {
      const body = await readJson(request);
      const result = routeIntent({
        message: body.message ?? body.goal ?? '',
        agent: body.agent ?? this.agent,
        lane: body.lane ?? this.lane,
      });

      return json({
        ok: true,
        session_id: body.session_id ?? null,
        agent: result.agent,
        lane: result.lane,
        intent: result.intent,
        next_steps: result.next_steps,
        requires_approval: result.requires_approval,
      });
    }

    return notFound();
  }
}
