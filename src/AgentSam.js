import { json, notFound, readJson } from './lib/responses.js';
import { createSession, getSession } from './lib/sessions.js';
import { routeIntent } from './lib/router.js';
import { getToolCatalog } from './lib/tools.js';
import { ToolRunner } from './core/ToolRunner.js';
import { runDoctor } from './tools/local/doctor.js';
import { scanCloudflareInventory } from './tools/cloudflare/inventory.js';

export class AgentSam {
  constructor(options = {}) {
    this.env = options.env ?? {};
    this.agent = options.agent ?? 'orchestrator';
    this.lane = options.lane ?? 'fullstack';
    this.project = options.project ?? 'agentsam-project';
    this.toolRunner = options.toolRunner ?? new ToolRunner({ runtime: options.runtime ?? 'worker' });

    if (options.registerDefaultTools !== false) {
      this.registerDefaultTools();
    }
  }

  registerDefaultTools() {
    this.toolRunner.registerTool('local.doctor', runDoctor, {
      description: 'Inspect local Agent Sam project and developer environment readiness.',
      readOnly: true,
    });
    this.toolRunner.registerTool('cloudflare.inventory', scanCloudflareInventory, {
      description: 'Read-only Cloudflare account inventory from direct API configuration.',
      readOnly: true,
    });
    return this;
  }

  registerTool(name, handler, options = {}) {
    this.toolRunner.registerTool(name, handler, options);
    return this;
  }

  async runTool(name, input = {}, context = {}) {
    return this.toolRunner.runTool(name, input, {
      env: this.env,
      agent: this.agent,
      lane: this.lane,
      project: this.project,
      runtime: 'worker',
      ...context,
    });
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
        tools: this.toolRunner.listTools(),
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

    if (request.method === 'POST' && path === '/api/agentsam/tool') {
      const body = await readJson(request);
      const result = await this.runTool(body.tool || body.name, body.input || {}, { runtime: 'worker' });
      return json(result, result.ok ? 200 : 400);
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
