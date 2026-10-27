// Compatibility export for existing SDK AgentSam provider tools.
// ONE implementation: src/core/client.ts builds to dist/client.js.
export {
  DEFAULT_COMPLETEFUL_API_ORIGIN,
  CompletefulApiError,
  CompletefulContractError,
  completefulApiBase,
  completefulKeyMode,
  createCompletefulClient,
  COMPLETEFUL_CONTRACT,
  COMPLETEFUL_OPERATIONS,
} from '../dist/client.js';
