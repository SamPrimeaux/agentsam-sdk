// @inneranimalmedia/agentsam-sdk — public API

import pkg from '../package.json' with { type: 'json' };

export { AgentSam } from './AgentSam.js';
export { routeIntent } from './lib/router.js';
export { getToolCatalog } from './lib/tools.js';
export { scaffoldProject } from './lib/scaffold.js';
export {
  collectNpmDependencies,
  createOsvQueries,
  findSecurityManifests,
  formatSecurityReport,
  queryOsv,
  scanProjectSecurity,
  summarizeVulnerabilities,
} from './security/sca.js';

export const version = pkg.version;
export const name = pkg.name;
