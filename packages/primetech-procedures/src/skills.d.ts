/** TypeScript declarations for the packaged PrimeTech skills. */
export interface PrimeTechSkillManifest {
  schema: 'agentsam.skill.v1';
  package: '@inneranimalmedia/primetech-procedures';
  id: string;
  name: string;
  description: string;
  icon?: string;
  slash: { suggested: string };
  instructions: { source: 'local_file'; ref: 'SKILL.md' };
  execution: { mode: 'turn'; tools: string[]; operations: string[]; capabilities: string[] };
  provenance: { source: string; status: string; notice?: string };
  metadata?: Record<string, unknown>;
}
export interface PrimeTechSkill {
  directory: string;
  manifest: PrimeTechSkillManifest;
  markdown: string;
  path: string;
}
export interface PrimeTechSkillValidationEntry {
  id: string;
  name: string;
  slash: string | null;
  errors: string[];
  valid: boolean;
}
export interface PrimeTechSkillPackageValidation {
  schema: 'agentsam.primetech.skill-catalog-validation.v1';
  valid: boolean;
  count: number;
  validCount: number;
  invalidCount: number;
  errors: string[];
  skills: PrimeTechSkillValidationEntry[];
}
export interface LoadPrimeTechSkillCatalogOptions { root?: string; }
export interface ValidatePrimeTechSkillPackageOptions {
  root?: string;
  knownTools?: string[] | null;
  knownOperations?: string[] | null;
  knownCapabilities?: string[] | null;
  expectedCount?: number | null;
}
export function loadPrimeTechSkillCatalog(options?: LoadPrimeTechSkillCatalogOptions): Promise<PrimeTechSkill[]>;
export function validatePrimeTechSkillPackage(options?: ValidatePrimeTechSkillPackageOptions): Promise<PrimeTechSkillPackageValidation>;
export function getPrimeTechSkill(options: { root?: string; id: string }): Promise<PrimeTechSkill | null>;
export const PRIMETECH_SKILL_CONTRACT_SECTIONS: readonly string[];
