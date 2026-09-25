import { Container, getContainer } from '@cloudflare/containers';

/**
 * Edge adapter: route AgentSam Go runtime traffic to the native Linux container.
 * Deployment identity arrives as explicit Worker vars from the AgentSam deploy
 * command and is forwarded into the native process. No package-shipped IAM
 * credential or account identifier exists here.
 */
export class AgentSamGoRuntime extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      AGENTSAM_TARGET: 'cloudflare',
      AGENTSAM_BUILD_SOURCE: String(env?.AGENTSAM_BUILD_SOURCE || ''),
      AGENTSAM_BUILD_COMMIT: String(env?.AGENTSAM_BUILD_COMMIT || ''),
      AGENTSAM_BUILT_AT: String(env?.AGENTSAM_BUILT_AT || ''),
    };
  }
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
        source: env.AGENTSAM_BUILD_SOURCE || null,
      });
    }

    const container = getContainer(env.GO_RUNTIME, 'default');
    return container.fetch(request);
  },
};
