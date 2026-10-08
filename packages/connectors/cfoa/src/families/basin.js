/**
 * Read-only Basin Catalog/Pipelines discovery from an authenticated Cloudflare
 * connector client. Do not persist tokens or assume account permissions.
 */
export async function discoverBasinResources(client) {
  if (!client || typeof client.request !== 'function' || !client.accountId) {
    return { enabled: false, status: 'unavailable', source: 'not configured', warehouses: [], pipelines: [], catalogTables: [], checkedAt: null };
  }
  const account=encodeURIComponent(client.accountId);
  const [catalog,pipelines]=await Promise.allSettled([
    client.request('GET', `/accounts/${account}/basin-catalog`,{operation:'basin.catalog.list'}),
    client.request('GET', `/accounts/${account}/pipelines/v1/pipelines`,{operation:'basin.pipelines.list'}),
  ]);
  if (catalog.status==='rejected'&&pipelines.status==='rejected') {
    return {enabled:true,status:'permission_required',source:'Cloudflare Basin API',
      warehouses:[],pipelines:[],catalogTables:[],checkedAt:null};
  }
  const warehouses=Array.isArray(catalog.value?.result?.warehouses)?catalog.value.result.warehouses.map(w=>({
    id:String(w.id),label:String(w.name||w.bucket||w.id),status:String(w.status||'unknown'),
  })):[];
  const response=pipelines.status==='fulfilled'?pipelines.value:{};
  const list=Array.isArray(response.result)?response.result:
    Array.isArray(response.result?.results)?response.result.results:[];
  return {enabled:true,status:catalog.status==='fulfilled'?'connected':'permission_required',
    source:'Cloudflare Basin API',warehouses,
    pipelines:list.map(p=>({id:String(p.id),label:String(p.name||p.id),status:String(p.status||'unknown'),lastEventAt:null})),
    // Catalog table list needs separately authorized Iceberg catalog discovery.
    // Never turn a warehouse into fictitious tables.
    catalogTables:[],checkedAt:new Date().toISOString()};
}
