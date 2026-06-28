// @inneranimalmedia/agentsam-sdk — public API

import pkg from '../package.json' with { type: 'json' };

export { AgentSam } from './agent.js';
export { scaffoldProject } from './lib/scaffold.js';

export const version = pkg.version;
export const name = pkg.name;
