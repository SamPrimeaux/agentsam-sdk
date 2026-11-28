/** Read a connected plugin's own workspace. No chat/project history mixing. */
import { D1BrandRegistryAdapter } from "@inneranimalmedia/agentsam-brand/registry";
import { getOwnedCatalogPlugin, runRemotePluginTool } from "./plugin-oauth.js";

function record(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function workspacePayload(value) {
  const direct = record(value);
  const structured = record(direct.structuredContent);
  if (Object.keys(structured).length) return structured;
  const content = Array.isArray(value)
    ? value
    : Array.isArray(direct.content)
      ? direct.content
      : [];
  const textBlock = content.find((item) => item?.type === "text" && typeof item.text === "string");
  const parsedText = textBlock ? record(textBlock.text) : {};
  if (Object.keys(parsedText).length) return parsedText;
  return direct;
}

/**
 * Prefer the purpose-built Brand workspace tool when the installation has it,
 * but keep the already-shipped brand.get_context contract working. Existing
 * connected installations are not guaranteed to refresh their tool inventory
 * at the same time as this Worker deploys.
 */
export function selectPluginWorkspaceContextTool(plugin, candidates = []) {
  const valid = candidates.filter((row) => {
    const config = record(row.handler_config);
    return config.remote_tool === row.tool_key && config.server_url === plugin.endpoint_url;
  });
  if (plugin.plugin_key === "agentsam-brand") {
    const purposeBuilt = valid.find((row) => row.tool_key === "brand.workspace.build");
    if (purposeBuilt) return purposeBuilt;
  }
  return (
    valid.find(
      (row) => typeof row.tool_key === "string" && row.tool_key.endsWith(".get_context"),
    ) || null
  );
}

/** Only send a brand selector when the selected remote tool declares it. */
export function buildPluginWorkspaceArgs(tool, options = {}) {
  const brandSlug = typeof options.brandSlug === "string" ? options.brandSlug.trim() : "";
  if (!brandSlug) return {};
  const properties = record(record(tool.input_schema).properties);
  if (Object.prototype.hasOwnProperty.call(properties, "brandSlug")) return { brandSlug };
  if (Object.prototype.hasOwnProperty.call(properties, "brand_slug"))
    return { brand_slug: brandSlug };
  return {};
}

/**
 * The brands table is the identity authority; remote Brand context enriches it
 * with saved BrandContracts. Never let a plugin response invent a second brand
 * identity or hide a registry row that already exists in D1.
 */
export function mergeBrandWorkspaceResult(
  remoteResult,
  registryBrands = [],
  unmatchedAssetSlugs = [],
  warning = "",
) {
  const payload = workspacePayload(remoteResult);
  const source = record(payload.data);
  const data = Object.keys(source).length ? source : payload;
  const candidates = [data.brands, data.brandContracts, data.contracts]
    .filter(Array.isArray)
    .flat()
    .map(record);
  if (Object.keys(record(data.latestContract)).length) candidates.push(record(data.latestContract));
  if (Object.keys(record(data.brand)).length) candidates.push(record(data.brand));

  const brands = registryBrands.map((registryBrand) => {
    const remote =
      candidates.find((candidate) => {
        const nested = record(candidate.brand);
        const ids = [candidate.brandId, candidate.brand_id, candidate.id, nested.id]
          .filter(Boolean)
          .map(String);
        const slugs = [candidate.slug, candidate.brandSlug, candidate.brand_slug, nested.slug]
          .filter(Boolean)
          .map(String);
        return ids.includes(String(registryBrand.id)) || slugs.includes(String(registryBrand.slug));
      }) || {};
    const contract = record(
      remote.contract ||
        remote.latestContract ||
        remote.brandContract ||
        (remote.visual_system || remote.tokens || remote.schema ? remote : null),
    );
    const revisions = Array.isArray(remote.contractRevisions)
      ? remote.contractRevisions
      : Array.isArray(remote.revisions)
        ? remote.revisions
        : registryBrand.contractRevisions || [];
    return {
      ...remote,
      ...registryBrand,
      contract: Object.keys(contract).length ? contract : registryBrand.contract || {},
      contractRevision:
        remote.contractRevision ||
        remote.latestContract ||
        (Object.keys(contract).length ? contract : registryBrand.contractRevision || {}),
      contractRevisions: revisions,
      contractStatus:
        remote.contractStatus ||
        remote.contract_status ||
        remote.contractRevision?.status ||
        contract.status ||
        registryBrand.contractStatus ||
        "not_defined",
      colors: remote.colors ?? registryBrand.colors ?? {},
      assets: registryBrand.assets ?? remote.assets ?? [],
      sources: remote.sources ?? registryBrand.sources ?? [],
      themes: remote.themes ?? registryBrand.themes ?? [],
    };
  });

  const warnings = Array.isArray(data.warnings) ? [...data.warnings] : [];
  if (warning) warnings.push(warning);
  return {
    data: {
      ...data,
      brands,
      unmatchedAssetSlugs,
      warnings,
      registrySource: "brands",
    },
  };
}

export async function readPluginWorkspace(env, accountId, pluginId, fetcher = fetch, options = {}) {
  const plugin = await getOwnedCatalogPlugin(env.DB, accountId, pluginId);
  if (plugin.setup_status !== "connected" || plugin.is_enabled !== 1)
    throw new Error("plugin_workspace_not_connected");

  const isBrand = plugin.plugin_key === "agentsam-brand";
  const preferredTool = isBrand ? "brand.workspace.build" : null;
  const rows = preferredTool
    ? await env.DB.prepare(
        `SELECT * FROM agentsam_tools
        WHERE account_id=? AND plugin_key=? AND is_active=1
          AND (tool_key=? OR tool_key LIKE '%.get_context')
        ORDER BY CASE WHEN tool_key=? THEN 0 ELSE 1 END, sort_priority ASC LIMIT 5`,
      )
        .bind(accountId, plugin.plugin_key, preferredTool, preferredTool)
        .all()
    : await env.DB.prepare(
        `SELECT * FROM agentsam_tools
        WHERE account_id=? AND plugin_key=? AND is_active=1
          AND tool_key LIKE '%.get_context'
        ORDER BY sort_priority ASC LIMIT 5`,
      )
        .bind(accountId, plugin.plugin_key)
        .all();

  const contextTool = selectPluginWorkspaceContextTool(plugin, rows.results || []);
  let remoteResult = null;
  let warning = "";
  if (contextTool) {
    try {
      remoteResult = await runRemotePluginTool(
        env,
        accountId,
        contextTool,
        buildPluginWorkspaceArgs(contextTool, options),
        fetcher,
      );
    } catch (error) {
      if (!isBrand) throw error;
      warning =
        "BrandContract context is temporarily unavailable; canonical registry identities and account-owned assets are still shown.";
    }
  } else if (!isBrand) {
    throw new Error("plugin_workspace_context_tool_unavailable");
  } else {
    warning =
      "No BrandContract context tool is registered; canonical registry identities and account-owned assets are shown.";
  }

  let result = remoteResult;
  if (isBrand) {
    const registry = new D1BrandRegistryAdapter({ db: env.DB, accountId });
    const [brands, unmatchedAssetSlugs] = await Promise.all([
      registry.list({
        accountId,
        includeArchived: false,
        includeAssets: true,
        limit: 500,
        assetLimit: 500,
      }),
      registry.listUnmatchedAssetSlugs({ accountId }),
    ]);
    result = mergeBrandWorkspaceResult(remoteResult, brands, unmatchedAssetSlugs, warning);
  }

  return {
    pluginKey: plugin.plugin_key,
    pluginId,
    contextTool: contextTool?.tool_key || "",
    result,
  };
}
