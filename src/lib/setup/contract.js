/**
 * Agent Sam capability install planner — Homebrew-style orchestration.
 * Agent Sam owns discover → plan → explain → approve → execute → verify + receipt.
 * Native package managers own the actual install (brew / apt / winget / npm / …).
 */

export const SETUP_PLAN_SCHEMA = 'agentsam-setup-plan-v1';
export const SETUP_RECEIPT_SCHEMA = 'agentsam-setup-receipt-v1';

/**
 * @typedef {{
 *   id: string,
 *   displayName: string,
 *   description: string,
 *   risk: 'low'|'medium'|'high',
 *   requiresApproval: boolean,
 *   capabilityProvided: string[],
 *   detect: (ctx: object) => Promise<{ ok: boolean, detail?: string, version?: string }>,
 *   supportedPlatforms: string[],
 *   installPlans: Record<string, { provider: string, packages?: string[], commands?: string[], notes?: string[] }>,
 *   dependencies?: string[],
 *   mutations?: string[],
 *   verify: (ctx: object) => Promise<{ ok: boolean, detail?: string, version?: string }>,
 *   uninstallHint?: () => string,
 * }} InstallableCapability
 */
