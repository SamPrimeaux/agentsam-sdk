/** Portable CAD format identity and operation contract. */
export type { CadSourceRole, CadFormatOperation, CadFormatAdapter } from '@inneranimalmedia/agentsam-contracts/source-types/cad';
export {
  CAD_SOURCE_FORMATS,
  CAD_FORMAT_OPERATIONS,
  identifyCadFileFormat,
  cadOutputFormatReference,
  isCadAutoDiscoveryCandidate,
  runCadFormatOperation,
} from '@inneranimalmedia/agentsam-contracts/source-types/cad';
