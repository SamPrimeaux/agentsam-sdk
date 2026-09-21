const BASE = 'https://vxapi.completeful.com/v1';
function clean(value) { return value == null ? '' : String(value).trim(); }

const ROUTES = Object.freeze({
  'catalog.list': ['GET', '/catalog/products'],
  'catalog.read': ['GET', '/catalog/products/:id'],
  'catalog.search': ['GET', '/catalog/products/semantic'],
  'catalog.sync': ['POST', '/catalog/sync'],
  'design.create': ['POST', '/designs'],
  'product.publish': ['POST', '/products/publish'],
  'product.sync': ['POST', '/products/sync'],
  'order.quote': ['POST', '/orders/quote'],
  'order.create': ['POST', '/orders'],
});

export async function executeCompletefulNative(env, tool, args = {}, options = {}) {
  const token = clean(env?.COMPLETEFUL_API_KEY || env?.COMPLETEFUL_API_TOKEN);
  if (!token) throw new Error('completeful_credential_missing');
  const operation = clean(tool?.handler_config?.operation || tool?.handler_key);
  const route = ROUTES[operation];
  if (!route) throw new Error(`completeful_operation_unsupported:${operation}`);
  const [method, pathTemplate] = route;
  const path = pathTemplate.replace(':id', encodeURIComponent(clean(args.id || args.product_id)));
  const url = new URL(`${BASE}${path}`);
  const body = { ...args };
  if (method === 'GET') {
    for (const [key, value] of Object.entries(body)) if (value != null) url.searchParams.set(key, String(value));
  }
  const response = await (options.fetchImpl || fetch)(url, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(method === 'GET' ? {} : { 'content-type': 'application/json' }) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`completeful_http_${response.status}`);
  return payload;
}
