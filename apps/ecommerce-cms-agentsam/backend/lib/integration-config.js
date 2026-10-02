/**
 * Installed-integration resolvers — agentsam_plugins (+ mail_settings) authority.
 * Wrangler env may supply local/dev overrides only; production values live in D1.
 */

import { getCompany, companyDomain } from "./company.js";
import { resolveApplicationAccountId } from "./account-context.js";

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {any} env
 * @param {string} pluginKey
 */
export async function getPlugin(env, pluginKey, opts = {}) {
  if (!env?.DB || !pluginKey) return null;
  try {
    const accountId = await resolveApplicationAccountId(env, opts.accountId);
    if (!accountId) return null;
    return await env.DB.prepare(
      `SELECT * FROM agentsam_plugins
       WHERE account_id = ? AND plugin_key = ? AND is_enabled = 1
       LIMIT 1`,
    )
      .bind(accountId, pluginKey)
      .first();
  } catch (err) {
    console.error("[integration-config] plugin load failed", pluginKey, err?.message || err);
    return null;
  }
}

export async function listEnabledPlugins(env, opts = {}) {
  if (!env?.DB) return [];
  try {
    const accountId = await resolveApplicationAccountId(env, opts.accountId);
    if (!accountId) return [];
    const { results } = await env.DB.prepare(
      `SELECT * FROM agentsam_plugins
       WHERE account_id = ? AND is_enabled = 1
       ORDER BY display_name ASC, plugin_key ASC`,
    )
      .bind(accountId)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

/**
 * GitHub repository slug (owner/repo) from agentsam_plugins.
 * Optional env.AGENTSAM_GITHUB_REPO is a local-dev override only.
 */
export async function resolveGithubRepo(env, opts = {}) {
  const override = String(env?.AGENTSAM_GITHUB_REPO || "").trim();
  if (override && env?.ALLOW_INTEGRATION_ENV_OVERRIDE === "1") {
    return { ok: true, repo: override, source: "env_override" };
  }

  const plugin = await getPlugin(env, "github", opts);
  if (plugin) {
    const meta = parseJson(plugin.metadata_json);
    const cfg = parseJson(plugin.config_json);
    const fromMetaUrl = String(meta.repository_url || "")
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .trim();
    const fromCfg =
      String(cfg.repository || cfg.github_repo || cfg.repo || "").trim() ||
      fromMetaUrl;
    if (fromCfg) {
      return { ok: true, repo: fromCfg, source: "agentsam_plugins", plugin_key: "github" };
    }
  }

  // MCP plugin config may carry scoped github_repo for this install.
  const mcp = await getPlugin(env, "inneranimalmedia-mcp-server", opts);
  if (mcp) {
    const cfg = parseJson(mcp.config_json);
    const repo = String(cfg.github_repo || "").trim();
    if (repo) {
      return {
        ok: true,
        repo,
        source: "agentsam_plugins",
        plugin_key: "inneranimalmedia-mcp-server",
      };
    }
  }

  return { ok: false, error: "github_repo_not_configured", repo: null };
}

/**
 * Completeful API origin from plugin endpoint_url, else canonical production default.
 * env.CAPP_API_URL only when ALLOW_INTEGRATION_ENV_OVERRIDE=1 (dev/test).
 */
export async function resolveCompletefulApiOrigin(env) {
  if (env?.ALLOW_INTEGRATION_ENV_OVERRIDE === "1" && env?.CAPP_API_URL) {
    return {
      ok: true,
      origin: String(env.CAPP_API_URL).replace(/\/+$/, ""),
      source: "env_override",
    };
  }

  const plugin = await getPlugin(env, "completeful");
  const fromPlugin = String(plugin?.endpoint_url || "").trim().replace(/\/+$/, "");
  if (fromPlugin) {
    return { ok: true, origin: fromPlugin, source: "agentsam_plugins", plugin_key: "completeful" };
  }

  return {
    ok: true,
    origin: "https://vxapi.completeful.com",
    source: "canonical_default",
  };
}

/**
 * Resend From: mail_settings → company support/name → fail soft with company domain hello@
 */
export async function resolveResendFrom(env) {
  try {
    const row = await env.DB?.prepare(`SELECT settings_json FROM mail_settings WHERE id = 1`).first();
    if (row?.settings_json) {
      const settings = parseJson(row.settings_json);
      if (settings.resendFrom) {
        return { ok: true, from: settings.resendFrom, source: "mail_settings" };
      }
    }
  } catch {
    /* table optional */
  }

  if (env?.ALLOW_INTEGRATION_ENV_OVERRIDE === "1" && env?.RESEND_FROM) {
    return { ok: true, from: String(env.RESEND_FROM), source: "env_override" };
  }

  const company = await getCompany(env);
  if (company?.supportEmail) {
    const name = company.name || "Store";
    return {
      ok: true,
      from: `${name} <${company.supportEmail}>`,
      source: "company.support_email",
    };
  }

  const domain = companyDomain(company);
  if (domain && company?.name) {
    return {
      ok: true,
      from: `${company.name} <hello@${domain}>`,
      source: "company.website_url",
    };
  }

  return { ok: false, error: "resend_from_not_configured", from: null };
}
