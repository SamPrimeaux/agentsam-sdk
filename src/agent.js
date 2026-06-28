/**
 * Minimal Worker-facing Agent Sam runtime for scaffolded projects.
 * Calls the Agent Sam API when AGENTSAM_API_KEY is set; otherwise returns a local stub.
 */

const DEFAULT_API_BASE = 'https://inneranimalmedia.com';

export class AgentSam {
  /**
   * @param {object} opts
   * @param {Record<string, unknown>} [opts.env]
   * @param {string} [opts.agent] orchestrator | data | crm | creative | cms
   * @param {string} [opts.apiBaseUrl]
   */
  constructor({ env = {}, agent = 'orchestrator', apiBaseUrl } = {}) {
    this.env = env;
    this.agent = agent;
    this.apiBaseUrl = String(
      apiBaseUrl || env.AGENTSAM_API_BASE || env.AGENTSAM_API_BASE_URL || DEFAULT_API_BASE,
    ).replace(/\/$/, '');
  }

  /** @param {Request} request */
  async handle(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        agent: this.agent,
        sdk: 'agentsam-sdk',
        mode: this.env.AGENTSAM_API_KEY ? 'api' : 'stub',
      });
    }

    if (request.method === 'POST' && (url.pathname === '/chat' || url.pathname === '/api/chat')) {
      return this.handleChat(request);
    }

    return Response.json(
      {
        ok: true,
        agent: this.agent,
        hint: 'POST /chat with { "message": "..." } or GET /health',
      },
      { status: 200 },
    );
  }

  /** @param {Request} request */
  async handleChat(request) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const message = String(body.message || body.prompt || '').trim();
    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    const apiKey = this.env.AGENTSAM_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch(`${this.apiBaseUrl}/api/agent/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ message, agent: this.agent }),
        });
        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
        });
      } catch (err) {
        return Response.json(
          { error: 'Agent Sam API request failed', detail: String(err?.message || err) },
          { status: 502 },
        );
      }
    }

    return Response.json({
      ok: true,
      mode: 'stub',
      agent: this.agent,
      message,
      reply: `[Agent Sam stub] Received: ${message}. Set AGENTSAM_API_KEY to connect to the platform.`,
    });
  }
}
