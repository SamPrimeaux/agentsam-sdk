/** Portable Ecommerce CMS merchant onboarding surface.
 * The CMS owns HTML, client behavior and the protocol. Each authenticated host
 * supplies its own route projection and static asset binding. No Local Studio
 * URL, provider, or identity implementation is embedded in this module.
 */

const assetFiles = new Map([
  ['store-start.html', 'text/html; charset=utf-8'],
  ['store-start.js', 'text/javascript; charset=utf-8'],
  ['store-start.css', 'text/css; charset=utf-8'],
]);
const originPath = value => typeof value === 'string' && /^\/(?!\/)[^?#\u0000-\u001f]*$/.test(value);
function requireLocalPath(value, key) {
  if (!originPath(value)) throw new Error(`merchant_onboarding_route_invalid:${key}`);
  return value;
}
function checkedMount(input) {
  const mount = requireLocalPath(input,'entry').replace(/\/+$/,'');
  if (!mount || mount === '/') throw new Error('merchant_onboarding_mount_invalid');
  return mount;
}
/** Each destination contains {site_id} once, never a default account/site. */
function destination(value, key) {
  if (typeof value !== 'string' || value.split('{site_id}').length !== 2 ||
      !/^\/(?!\/)[^#\u0000-\u001f]+$/.test(value.replace('{site_id}','site-one')) ||
      !new URL(value.replace('{site_id}','site-one'),'https://merchant.example').pathname.startsWith('/')) {
    throw new Error(`merchant_onboarding_destination_invalid:${key}`);
  }
  return value;
}
export function projectMerchantOnboarding(config) {
  const entry = checkedMount(config?.entry);
  const identity = {
    me: requireLocalPath(config?.identity?.me, 'identity.me'),
    login: requireLocalPath(config?.identity?.login, 'identity.login'),
    signup: requireLocalPath(config?.identity?.signup, 'identity.signup'),
  };
  const sites = {
    list: requireLocalPath(config?.sites?.list,'sites.list'),
    create: requireLocalPath(config?.sites?.create,'sites.create'),
  };
  const destinations = {
    store: destination(config?.destinations?.store, 'store'),
    pages: destination(config?.destinations?.pages, 'pages'),
    themes: destination(config?.destinations?.themes, 'themes'),
  };
  const selection = typeof config?.selectionStorageKey === 'string'
    && /^[A-Za-z0-9_.:-]{1,128}$/.test(config.selectionStorageKey)
    ? config.selectionStorageKey : null;
  const siteIdParam = typeof config?.siteIdParam === 'string' && /^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/.test(config.siteIdParam)
    ? config.siteIdParam : 'site_id';
  const selectionEvent = typeof config?.selectionEvent === 'string' && /^[a-zA-Z][a-zA-Z0-9:-]{0,99}$/.test(config.selectionEvent)
    ? config.selectionEvent : null;
  return Object.freeze({
    entry: entry + '/', identity, sites, destinations,
    siteIdParam,selectionStorageKey: selection,selectionEvent,
    branding: { name: String(config?.branding?.name || 'Store Builder').slice(0,80) },
  });
}

const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cache-control': 'private, no-store',
};

/**
 * @param {Request} request
 * @param {{ assets:{fetch:(request:Request)=>Promise<Response>}, assetPrefix:string, config:object }} options
 * @returns {Promise<Response|null>}
 */
export async function serveMerchantOnboarding(request,{assets,assetPrefix,config}) {
  const projected = projectMerchantOnboarding(config);
  const url = new URL(request.url);
  const base = projected.entry.slice(0,-1);
  if (url.pathname !== base && !url.pathname.startsWith(projected.entry)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{
    status:405,headers:{allow:'GET, HEAD','cache-control':'private, no-store'},
  });
  if (url.pathname === base) {
    const destination = new URL(url);
    destination.pathname = projected.entry;
    return new Response(null, {status:308,headers:{location:destination.toString(),'cache-control':'private, no-store'}});
  }
  if (url.pathname === projected.entry + 'config') {
    return new Response(request.method === 'HEAD'?null:JSON.stringify(projected), {
      headers:{...securityHeaders,'content-type':'application/json; charset=utf-8'},
    });
  }
  const file = url.pathname === projected.entry ? 'store-start.html' : url.pathname.slice(projected.entry.length);
  const contentType = assetFiles.get(file);
  if (!contentType) return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
  if (!assets?.fetch) return new Response('Merchant onboarding assets unavailable',{status:503});
  const prefix = requireLocalPath(assetPrefix,'assetPrefix').replace(/\/+$/,'');
  const path = prefix + '/' + file;
  const resourceUrl = new URL(path,url.origin);
  const asset = await assets.fetch(new Request(resourceUrl,{method:request.method}));
  if (!asset.ok) return new Response('Merchant onboarding asset unavailable',{status:503,headers:{'cache-control':'no-store'}});
  return new Response(request.method === 'HEAD'?null:asset.body, {
    status:asset.status, headers:{...securityHeaders,'content-type':contentType},
  });
}
