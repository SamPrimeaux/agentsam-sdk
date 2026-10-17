export function createIdentityRepository(sql, manifest) {
  const accounts = manifest.accounts || {};
  const maxDepth = Number(accounts.maxDepth || 3);
  function requireKnown(list, value, label) {
    if (!list.includes(value)) throw new Error(label + " not in registry");
  }
  async function walk(id, seen) {
    if (seen.has(id)) throw new Error("cycle refused");
    seen.add(id);
    const row = await sql.first("SELECT parent_account_id FROM accounts WHERE id = ?", [id]);
    if (row && row.parent_account_id) return 1 + await walk(row.parent_account_id, seen);
    return 1;
  }
  return {
    async createAccount(input) {
      requireKnown(accounts.kinds, input.kind || "organization", "kind");
      requireKnown(Object.keys(accounts.plans), input.plan_key || "free", "plan");
      if (input.parent_account_id) {
        const depth = await walk(input.parent_account_id, new Set());
        if (depth + 1 > maxDepth) throw new Error("depth cap");
      }
      const root = input.parent_account_id ? (await sql.first("SELECT root_account_id, id FROM accounts WHERE id = ?", [input.parent_account_id])).root_account_id || input.parent_account_id : null;
      await sql.run("INSERT INTO accounts (id, slug, display_name, kind, parent_account_id, root_account_id, plan_key) VALUES (?, ?, ?, ?, ?, ?, ?)", [input.id, input.slug, input.display_name, input.kind || "organization", input.parent_account_id || null, root, input.plan_key || "free"]);
      const plan = accounts.plans[input.plan_key || "free"] || {};
      for (const [key, value] of Object.entries(plan.entitlements || {})) {
        await sql.run("INSERT INTO account_entitlements (account_id, entitlement_key, value_json, source) VALUES (?, ?, ?, 'plan')", [input.id, key, JSON.stringify(value)]);
      }
      return { id: input.id, root_account_id: root };
    },
    async resolveAccountByHostname(hostname) {
      return sql.first("SELECT a.* FROM accounts a JOIN account_domains d ON d.account_id = a.id WHERE d.hostname = ?", [hostname]);
    },
    async getBrand(accountId) {
      const brand = {};
      let current = accountId;
      const seen = new Set();
      while (current && !seen.has(current)) {
        seen.add(current);
        const rows = await sql.all("SELECT setting_key, value_json FROM account_settings WHERE account_id = ? AND setting_key LIKE 'brand.%'", [current]);
        for (const row of rows) if (!(row.setting_key in brand)) brand[row.setting_key] = JSON.parse(row.value_json);
        const parent = await sql.first("SELECT parent_account_id FROM accounts WHERE id = ?", [current]);
        current = parent && parent.parent_account_id;
      }
      return brand;
    },
    async hasEntitlement(accountId, key) {
      const row = await sql.first("SELECT value_json FROM account_entitlements WHERE account_id = ? AND entitlement_key = ?", [accountId, key]);
      return row ? JSON.parse(row.value_json) : false;
    },
    async addMember(input) {
      requireKnown(accounts.roles, input.role, "role");
      await sql.run("INSERT INTO account_members (account_id, principal_id, role, status) VALUES (?, ?, ?, 'active')", [input.account_id, input.principal_id, input.role]);
      return { ok: true };
    },
  };
}
