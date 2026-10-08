/** Read a connected plugin's own workspace. No chat/project history mixing. */
import { getOwnedCatalogPlugin, runRemotePluginTool } from "./plugin-oauth.js";

export async function readPluginWorkspace(env,accountId,pluginId,fetcher=fetch) {
  const plugin=await getOwnedCatalogPlugin(env.DB,accountId,pluginId);
  if(plugin.setup_status!=="connected"||plugin.is_enabled!==1)
    throw new Error("plugin_workspace_not_connected");
  const rows=await env.DB.prepare(`SELECT * FROM agentsam_tools
    WHERE account_id=? AND plugin_id=? AND is_active=1
    AND tool_key LIKE '%.get_context' ORDER BY sort_priority ASC LIMIT 5`)
    .bind(accountId,pluginId).all();
  const contextTool=(rows.results||[]).find(row=>{
    const cfg=typeof row.handler_config==="string"
      ? JSON.parse(row.handler_config||"{}"):row.handler_config;
    return cfg?.remote_tool===row.tool_key && cfg?.server_url===plugin.endpoint_url;
  });
  if(!contextTool)throw new Error("plugin_workspace_context_tool_unavailable");
  const result=await runRemotePluginTool(env,accountId,contextTool,{},fetcher);
  return {pluginKey:plugin.plugin_key,pluginId,contextTool:contextTool.tool_key,result};
}
