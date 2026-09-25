/**
 * Hosted SkillStore adapter contract — ownership lives here, not in agentsam.skill.v1.
 * Portable runtime works with null store (local registry only).
 *
 * IAM migration: implement this against real account_id rows only.
 * Never use account_id IN ('platform','system').
 */

/**
 * @typedef {{
 *   listForAccount: (accountId: string) => Promise<Array<{ id: string, trigger: string, manifest: object }>>,
 *   getByTrigger: (accountId: string, trigger: string) => Promise<object|null>,
 *   put: (accountId: string, manifest: object, trigger: string) => Promise<void>,
 *   remove: (accountId: string, skillId: string) => Promise<void>,
 * }} HostedSkillStore
 */

/**
 * No-op store for local / offline. Hosts inject a real D1-backed adapter later.
 * @returns {HostedSkillStore}
 */
export function createNullHostedSkillStore() {
  return {
    async listForAccount() {
      return [];
    },
    async getByTrigger() {
      return null;
    },
    async put() {
      throw new Error('hosted_skill_store_unavailable');
    },
    async remove() {
      throw new Error('hosted_skill_store_unavailable');
    },
  };
}
