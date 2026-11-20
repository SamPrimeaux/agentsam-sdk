import { projectSideStageContribution } from './plugin-side-stages.js';

/** First-party entertainment installations use existing plugin + Side Stage records.
 * Strict key/provider/transport validation keeps this separate from OAuth MCP
 * discovery. Game pages never gain executable local or device permissions.
 */
export const ENTERTAINMENT_PLUGIN_KEYS = Object.freeze([
  'inneranimalmedia-meauxgames',
  'inneranimalmedia-wizard-chess-3d',
]);
export async function installFirstPartyEntertainment(env,accountId,pluginKey) {
  if(!accountId)throw Error('plugin_account_required');
  if(!ENTERTAINMENT_PLUGIN_KEYS.includes(pluginKey))throw Error('plugin_catalog_entry_not_found');
  const plugin=await env.DB.prepare(
    "SELECT id,plugin_key,family_key,plugin_kind,display_name,description,icon_url,metadata_json,sort_priority" +
    " FROM agentsam_plugins WHERE plugin_key=? AND provider_key='inneranimalmedia'" +
    " AND plugin_kind='native' AND category='entertainment'" +
    " AND transport='native' AND auth_type='none' LIMIT 1"
  ).bind(pluginKey).first();
  if(!plugin || !projectSideStageContribution(plugin))throw Error('plugin_catalog_entry_not_found');
  await env.DB.prepare(
    "INSERT INTO agentsam_plugin_installations" +
    " (account_id,plugin_id,instance_key,enabled,setup_status,health_status,composer_visible,settings_visible)" +
    " VALUES (?,?,'entertainment-v1',1,'configured','healthy',0,1)" +
    " ON CONFLICT(account_id,plugin_id,instance_key)" +
    " DO UPDATE SET enabled=1,setup_status='configured',updated_at=unixepoch()"
  ).bind(accountId,plugin.id).run();
  // Separate stage preference preserves the user's disabled/enabled choice.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO agentsam_plugin_installations" +
    " (account_id,plugin_id,instance_key,enabled,setup_status,health_status,composer_visible,settings_visible)" +
    " VALUES (?,?,'side-stage-v1',1,'configured','healthy',0,1)"
  ).bind(accountId,plugin.id).run();
  return {pluginId:plugin.id,pluginKey,status:'installed',installed:true,enabled:true};
}


/** Uninstall only this account's game, also clearing the associated stage preference. */
export async function removeFirstPartyEntertainment(env,accountId,pluginId){
  if(!accountId || !/^plg_[a-f0-9]{8,}$/i.test(String(pluginId)))throw Error('plugin_installation_not_found');
  const plugin=await env.DB.prepare(
    "SELECT plugin_key FROM agentsam_plugins WHERE id=? AND provider_key='inneranimalmedia' AND category='entertainment' LIMIT 1"
  ).bind(pluginId).first();
  if(!ENTERTAINMENT_PLUGIN_KEYS.includes(plugin?.plugin_key))throw Error('plugin_installation_not_found');
  const own=await env.DB.prepare(
    "SELECT instance_key FROM agentsam_plugin_installations WHERE account_id=? AND plugin_id=? AND instance_key='entertainment-v1' LIMIT 1"
  ).bind(accountId,pluginId).first();
  if(!own)throw Error('plugin_installation_not_found');
  const tools=await env.DB.prepare("SELECT COUNT(*) AS total FROM agentsam_tools WHERE plugin_key=? AND account_id=?")
    .bind(plugin.plugin_key,accountId).first();
  if(Number(tools?.total||0)>0)throw Error('plugin_remove_requires_disconnect');
  await env.DB.prepare(
    "DELETE FROM agentsam_plugin_installations WHERE account_id=? AND plugin_id=? AND instance_key='entertainment-v1'"
  ).bind(accountId,pluginId).run();
  await env.DB.prepare(
    "DELETE FROM agentsam_plugin_installations WHERE account_id=? AND plugin_id=? AND instance_key='side-stage-v1'"
  ).bind(accountId,pluginId).run();
  return {pluginId,removed:true};
}
