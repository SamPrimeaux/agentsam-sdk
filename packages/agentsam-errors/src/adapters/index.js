export { classifyProviderFailure, reasonFromGenericEvidence } from './provider.js';
export { classifyOpenAIFailure } from './openai.js';
export { classifyAnthropicFailure } from './anthropic.js';
export { classifyGoogleAIFailure, classifyGeminiFailure } from './google.js';
export { classifyCursorFailure } from './cursor.js';
export { classifyGitHubFailure } from './github.js';
export { classifyCloudflareFailure } from './cloudflare.js';
export { classifyDockerFailure } from './docker.js';
export { classifyGcpFailure } from './gcp.js';
export { classifyProcessFailure } from './process.js';
export { classifyOAuthFailure } from './oauth.js';
export { classifyCadFailure, classifyFreeCadFailure, classifyOpenScadFailure, classifyBlenderFailure, classifyMeshyFailure } from './cad.js';
export { classifyDeviceFailure } from './device.js';
export { classifyInternalFailure } from './internal.js';

import { classifyOpenAIFailure } from './openai.js';
import { classifyAnthropicFailure } from './anthropic.js';
import { classifyGoogleAIFailure, classifyGeminiFailure } from './google.js';
import { classifyCursorFailure } from './cursor.js';
import { classifyGitHubFailure } from './github.js';
import { classifyCloudflareFailure } from './cloudflare.js';
import { classifyDockerFailure } from './docker.js';
import { classifyGcpFailure } from './gcp.js';
import { classifyCadFailure } from './cad.js';
import { classifyDeviceFailure } from './device.js';
import { classifyInternalFailure } from './internal.js';
import { classifyProviderFailure } from './provider.js';

export function classifyFailure(source, evidence = {}, context = {}) {
  const key = String(source || '').toLowerCase();
  switch (key) {
    case 'openai': return classifyOpenAIFailure(evidence, context);
    case 'anthropic': return classifyAnthropicFailure(evidence, context);
    case 'google':
    case 'google_ai': return classifyGoogleAIFailure(evidence, context);
    case 'gemini': return classifyGeminiFailure(evidence, context);
    case 'cursor': return classifyCursorFailure(evidence, context);
    case 'github': return classifyGitHubFailure(evidence, context);
    case 'cloudflare': return classifyCloudflareFailure(evidence, context);
    case 'docker': return classifyDockerFailure(evidence, context);
    case 'gcp':
    case 'google_cloud': return classifyGcpFailure(evidence, context);
    case 'freecad':
    case 'openscad':
    case 'blender':
    case 'meshy': return classifyCadFailure(key, evidence, context);
    case 'device':
    case 'execos_device': return classifyDeviceFailure(evidence, context);
    case 'agentsam':
    case 'agentsam-sdk':
    case 'inneranimalmedia':
    case 'execos': return classifyInternalFailure(evidence, { ...context, system: key });
    default: return classifyProviderFailure(key || 'provider', evidence, context);
  }
}
