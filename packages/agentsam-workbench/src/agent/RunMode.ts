import type { AgentRunMode } from '@inneranimalmedia/agentsam-contracts';

export type AgentRunModeTone = 'blue' | 'yellow' | 'red' | 'multicolor' | 'green';

export type AgentRunModeProfile = Readonly<{
  id: AgentRunMode;
  label: string;
  description: string;
  tone: AgentRunModeTone;
}>;

/**
 * Presentation metadata for the canonical AgentSam run modes.
 * Runtime meaning remains owned by @inneranimalmedia/agentsam-contracts.
 */
export const AGENT_RUN_MODE_PROFILES: readonly AgentRunModeProfile[] = Object.freeze([
  { id: 'agent', label: 'Agent', description: 'Execute and open surfaces', tone: 'blue' },
  { id: 'plan', label: 'Plan', description: 'Design technical plans', tone: 'yellow' },
  { id: 'debug', label: 'Debug', description: 'Inspect, prove, and fix', tone: 'red' },
  { id: 'multitask', label: 'Multitask', description: 'Coordinate managed workflows', tone: 'multicolor' },
  { id: 'ask', label: 'Ask', description: 'Talk and answer questions', tone: 'green' },
]);

export function agentRunModeProfile(mode: AgentRunMode): AgentRunModeProfile {
  return AGENT_RUN_MODE_PROFILES.find((profile) => profile.id === mode) ?? AGENT_RUN_MODE_PROFILES[0]!;
}
