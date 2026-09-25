import { env as workerEnv } from 'cloudflare:workers';
import { Container, getContainer } from '@cloudflare/containers';
import { runtimeInstanceKey } from './identity.js';

/**
 * Edge adapter: route AgentSam Go runtime traffic to the native Linux container.
 * Deployment identity arrives as explicit Worker vars from the AgentSam deploy
 * command and is forwarded into the native process. No package-shipped IAM
 * credential or account identifier exists here.
 *
 * Cloudflare's Container class reads envVars as a class property. Use the
 * Workers global env binding here rather than mutating envVars after super().
 */
export class AgentSamGoRuntime extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
  envVars = {
    AGENTSAM_TARGET: 'cloudflare',
    AGENTSAM_BUILD_SOURCE: String(workerEnv.AGENTSAM_BUILD_SOURCE || ''),
    AGENTSAM_BUILD_COMMIT: String(workerEnv.AGENTSAM_BUILD_COMMIT || ''),
    AGENTSAM_BUILT_AT: String(workerEnv.AGENTSAM_BUILT_AT || ''),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const source = String(env.AGENTSAM_BUILD_SOURCE || '');

    if (url.pathname === '/' || url.pathname === '/edge/health') {
      return Response.json({
        ok: true,
        service: 'agentsam-go-worker',
        edge: 'worker',
        runtime: 'go/native-container',
        source: source || null,
        container_instance: runtimeInstanceKey(source),
      });
    }

    const container = getContainer(env.GO_RUNTIME, runtimeInstanceKey(source));
    return container.fetch(request);
  },
};
