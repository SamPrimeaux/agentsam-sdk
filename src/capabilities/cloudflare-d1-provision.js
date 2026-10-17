/**
 * Customer-installation owned Cloudflare D1 database creation.
 * Resolve account/token from the authenticated installation's provider
 * connection at call time. Never accept account IDs/tokens from tool input.
 *
 * This is a real Cloudflare REST provisioning adapter; actual live creation
 * requires a host to connect its customer Cloudflare credential resolver.
 */
const fail = (code,message) => Object.assign(new Error(message||code),{code});
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
export function createCloudflareD1Provisioner({resolveAccountForInstallation,fetchImpl=globalThis.fetch}={}) {
  if(typeof resolveAccountForInstallation!=='function')throw new TypeError('d1_installation_account_resolver_required');
  if(typeof fetchImpl!=='function')throw new TypeError('d1_fetch_required');
  return async function provisionD1({name,confirm_name,jurisdiction,installation}={}) {
    if(!installation?.installationId||!installation?.actorId)
      throw fail('d1_authenticated_installation_required');
    if(typeof name!=='string'|| !/^[a-z][a-z0-9-]{0,63}$/.test(name))
      throw fail('d1_name_invalid');
    if(confirm_name!==name)throw fail('d1_create_confirmation_required');
    if(jurisdiction!==undefined&&!['eu','fedramp'].includes(jurisdiction))
      throw fail('d1_jurisdiction_invalid');
    // The host determines account and credential; arguments do not supply them.
    const account=await resolveAccountForInstallation(installation);
    if(!account || !ACCOUNT_ID.test(account.accountId||'') ||
       typeof account.apiToken!=='string'||account.apiToken.length<12)
      throw fail('d1_customer_cloudflare_connection_required');
    if(account.installationId!==installation.installationId)
      throw fail('d1_provider_installation_mismatch');
    const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account.accountId)+'/d1/database';
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{'Authorization':'Bearer '+account.apiToken,
        'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({name,...(jurisdiction?{jurisdiction}: {})}),
      signal:AbortSignal.timeout(30000),
    });
    if(!response || typeof response.json!=='function')throw fail('d1_provider_invalid_response');
    const data=await response.json().catch(()=>null);
    if(!response.ok || data?.success!==true)throw fail(
      response.status===403?'d1_provider_forbidden':
      response.status===409?'d1_name_conflict':'d1_provider_error');
    const id=data?.result?.uuid||data?.result?.id;
    if(!ID.test(id||''))throw fail('d1_provider_database_id_missing');
    return {ok:true,database_id:id,name,receipt:data?.result?.uuid||null,
      cloudflare_account_id:account.accountId};
  };
}
