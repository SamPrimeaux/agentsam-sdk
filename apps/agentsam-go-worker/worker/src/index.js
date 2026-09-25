import { Container, getContainer } from '@cloudflare/containers';

/**
 * Edge adapter: route AgentSam Go runtime traffic to the native Linux container.
 * Durable Object / Container class lives only in this Worker product surface.
 */
export class AgentSamGoRuntime extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/edge/health') {
      return Response.json({
        ok: true,
        service: 'agentsam-go-worker',
        edge: 'worker',
        runtime: 'go/native-container',
      });
    }

    const container = getContainer(env.GO_RUNTIME, 'default');
    return container.fetch(request);
  },
};
