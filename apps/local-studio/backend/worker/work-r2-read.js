import { listCloudflareConnectionRecords, resolveCloudflareCredential } from '@inneranimalmedia/agentsam-connector-cloudflare/credential';
const safe = value => String(value ?? '').trim();

/**
 * An account's connected Cloudflare R2 assets are read through its OAuth grant.
 * This is intentionally NOT a Worker R2 binding: buckets are selected at
 * request time and no ambient CLI/CI token may authorize account-owned reads.
 */
export async function readOauthR2Artifact(env, owner, row, key, accountId = '', options = {}) {
  const bucketName = safe(row.r2_bucket);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,62}$/.test(bucketName) ||
      !key || key.length > 1024 || key.startsWith('/') ||
      /[\\\u0000-\u001f\u007f]/.test(key) || key.split('/').includes('..')) {
    return Response.json({error:'r2_reference_invalid'},{status:400});
  }
  const listConnections = options.listConnections || listCloudflareConnectionRecords;
  const resolveCredential = options.resolveCredential || resolveCloudflareCredential;
  const fetchImpl = options.fetchImpl || fetch;
  const connections = (await listConnections(env, owner)).filter(record =>
    record.status === 'connected' && /^[a-f0-9]{32}$/i.test(record.cloudflareAccountId || ''));
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || '{}') || {}; } catch { /* old metadata is optional */ }
  const recordedAccount = safe(metadata.cloudflare_account_id || metadata.cloudflareAccountId);
  if (accountId && recordedAccount && accountId !== recordedAccount) {
    return Response.json({error:'cloudflare_account_mismatch'},{status:403});
  }
  const selectedAccount = accountId || recordedAccount ||
    (connections.length === 1 ? connections[0].cloudflareAccountId : '');
  if (!selectedAccount) {
    return Response.json({error:connections.length > 1 ? 'cloudflare_account_selection_required' : 'cloudflare_oauth_required',
      connect_url:'/api/connections/cloudflare/start?packs=media,data&return_to=/admin/media'},
    {status:connections.length > 1 ? 409 : 401});
  }
  if (!connections.some(record => record.cloudflareAccountId === selectedAccount)) {
    return Response.json({error:'cloudflare_connection_not_authorized'},{status:403});
  }
  const credential = await resolveCredential({
    env, ownerId:owner, authMode:'oauth', explicitAccountId:selectedAccount, fetchImpl,
  });
  if (credential.status !== 'ready' || !credential.bearerToken || credential.accountId !== selectedAccount) {
    return Response.json({error:'cloudflare_reconnect_required'},{status:401});
  }
  if (!credential.grantedScopes?.includes('workers-r2-bucket-item.read')) {
    return Response.json({error:'cloudflare_r2_permission_missing'},{status:403});
  }
  const objectPath = key.split('/').map(encodeURIComponent).join('/');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + selectedAccount +
    '/r2/buckets/' + encodeURIComponent(bucketName) + '/objects/' + objectPath;
  const response = await fetchImpl(url, {headers:{authorization:'Bearer ' + credential.bearerToken}});
  if (!response.ok) {
    return Response.json({error:response.status === 404 ? 'file_unavailable' : 'cloudflare_r2_read_failed'},
      {status:response.status === 404 ? 404 : response.status === 403 ? 403 : 502});
  }
  return {body:response.body,httpMetadata:{contentType:response.headers.get('content-type') || ''}};
}

