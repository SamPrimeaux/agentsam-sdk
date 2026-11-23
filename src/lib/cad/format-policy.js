/**
 * Compatibility facade. All CAD-related file identities and operation-gating
 * now live in the published, portable AgentSam Contracts source-types catalog.
 * Never add a second extension map to this SDK entry point.
 */
export {
  CAD_SOURCE_FORMATS,
  CAD_FORMAT_OPERATIONS,
  identifyCadFileFormat,
  cadOutputFormatReference,
  isCadAutoDiscoveryCandidate,
  runCadFormatOperation,
} from '@inneranimalmedia/agentsam-contracts/source-types/cad';
