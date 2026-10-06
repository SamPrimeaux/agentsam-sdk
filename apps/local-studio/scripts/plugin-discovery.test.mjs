import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredPluginCatalogSources,
  normalizeDiscoveredPlugin,
  discoverPublicPlugins,
  installFromCatalog,
  removeCatalogInstallation,
} from '../backend/worker/plugin-discovery.js';

const SOURCE = 'https://plugins.example.org/catalog/plugins';
const item = Object.freeze({
  plugin_key:'agentsam-example',
  version:'1.0.0',
  display_name:'AgentSam Example',
  short_description:'Example package',
  description:'Uses a real MCP endpoint.',
  developer_name:'Inner Animal Media',
  category:'Productivity',
  keywords:['example','tools'],
  capabilities:['Read sample data'],
  example_prompts:['Inspect this project.'],
  tools:['example.inspect'],
  tool_count:1,
  skill_count:2,
  endpoint_url:'https://plugins.example.org/mcp/example',
  transport:'streamable-http',
  auth_type:'oauth',
  privacy_url:'https://plugins.example.org/privacy',
});
const env = {AGENTSAM_PLUGIN_CATALOG_URLS:JSON.stringify([SOURCE])};
const fetcher = async (_url, options) => {
  assert.equal(options.redirect,'error');
  return new Response(JSON.stringify({schema:'agentsam.plugin-catalog/v1',plugins:[item]}),{
    status:200,headers:{'content-type':'application/json'},
  });
};

test('catalog source is operator-configured HTTPS with bounded path',()=>{
  assert.deepEqual(configuredPluginCatalogSources(env).map(x=>x.href),[SOURCE]);
  assert.throws(()=>configuredPluginCatalogSources({AGENTSAM_PLUGIN_CATALOG_URLS:'["http://localhost/catalog/plugins"]'}),/source_url_invalid/);
  assert.throws(()=>configuredPluginCatalogSources({AGENTSAM_PLUGIN_CATALOG_URLS:'["https://127.0.0.1/catalog/plugins"]'}),/source_url_invalid|source_url_invalid/);
  assert.throws(()=>configuredPluginCatalogSources({AGENTSAM_PLUGIN_CATALOG_URLS:'{"url":"https://plugins.example.org"}'}),/sources_invalid/);
});
test('catalog icons must remain on the verified catalog origin',()=>{
  const own=normalizeDiscoveredPlugin({...item,icon_url:'https://plugins.example.org/catalog/icons/agentsam-example.png?v=1'},SOURCE);
  assert.ok(own.iconUrl?.includes('/catalog/icons/agentsam-example.png'));
  const untrusted=normalizeDiscoveredPlugin({...item,icon_url:'https://tracking.example/spy.png'},SOURCE);
  assert.equal(untrusted.iconUrl,null);
});
test('catalog rejects cross-origin endpoints and unsupported authorization',()=>{
  assert.equal(normalizeDiscoveredPlugin(item,SOURCE).pluginKey,'agentsam-example');
  assert.throws(()=>normalizeDiscoveredPlugin({...item,endpoint_url:'https://evil.example/mcp/steal'},SOURCE),/endpoint_invalid/);
  assert.throws(()=>normalizeDiscoveredPlugin({...item,endpoint_url:'https://plugins.example.org/admin'},SOURCE),/endpoint_invalid/);
  assert.throws(()=>normalizeDiscoveredPlugin({...item,auth_type:'api_key'},SOURCE),/protocol_unsupported/);
});
test('multiple trusted catalog sources compose generically without domain-specific code',async()=>{
  const endpoints=[
    'https://plugins.example.org/catalog/plugins',
    'https://other.example.org/catalog/plugins',
  ];
  const multiEnv={AGENTSAM_PLUGIN_CATALOG_URLS:JSON.stringify(endpoints)};
  const result=await discoverPublicPlugins(multiEnv,async url=>
    new Response(JSON.stringify({
      schema:'agentsam.plugin-catalog/v1',
      plugins:[{
        ...item,
        plugin_key:url.startsWith(endpoints[0])?'agentsam-example':'agentsam-analytics',
        endpoint_url:url.startsWith(endpoints[0])?
          'https://plugins.example.org/mcp/example':'https://other.example.org/mcp/analytics',
      }],
    }),{status:200})
  );
  assert.equal(result.plugins.length,2);
  assert.deepEqual(result.plugins.map(p=>p.pluginKey),['agentsam-example','agentsam-analytics']);
});
test('discovery uses only declared source and never creates executable tools',async()=>{
  const result=await discoverPublicPlugins(env,fetcher);
  assert.equal(result.plugins.length,1);
  assert.equal(result.plugins[0].toolCount,1);
  assert.equal(result.plugins[0].availability,'requires_connection');
  assert.deepEqual(result.errors,[]);
  const missing=await discoverPublicPlugins(env,async()=>{throw new Error('network_error')});
  assert.equal(missing.plugins.length,0);
  assert.equal(missing.errors.length,1);
});

function mockDb() {
  const calls=[];
  let installedId='plg_mock123';
  const db={
    prepare(sql) {
      return {
        args:[],
        bind(...args){this.args=args;return this},
        async all(){return {results:[]}},
        async first(){
          if(sql.includes('SELECT id FROM agentsam_plugins') && sql.includes('installation_key'))return null;
          if(sql.includes('SELECT * FROM agentsam_plugins'))return {id:installedId,account_id:'au_user',is_enabled:0,metadata_json:'{}',capabilities_json:'[]',tool_lanes_json:'[]'};
          return null;
        },
        async run(){calls.push({sql,args:this.args});return {success:true}},
      }
    },
  };
  return {db,calls};
}
test('installation saves an account-scoped, disabled record without executable tools', async()=>{
  const {db,calls}=mockDb();
  const result=await installFromCatalog({...env,DB:db},'au_user','agentsam-example',fetcher);
  assert.equal(result.pluginKey,'agentsam-example');
  assert.equal(result.status,'requires_connection');
  const insert=calls.find(row=>row.sql.includes('INSERT INTO agentsam_plugins'));
  assert.ok(insert);
  assert.ok(insert.args.includes('au_user'));
  assert.ok(insert.args.includes('agentsam-example'));
  assert.equal(calls.filter(row=>row.sql.includes('INSERT INTO agentsam_tools')).length,0);
  assert.ok(calls.some(row=>row.sql.includes('is_enabled=?') && row.args.includes(0)));
});
test('deletion only removes account-owned catalog installations', async()=>{
  const queries=[];
  const db={
    prepare(sql){return {
      bind(...args){queries.push({sql,args});return this},
      async first(){
        if(sql.includes('SELECT id FROM agentsam_plugins'))return {id:'plg_mock123'};
        return {total:0};
      },
      async run(){return {success:true}},
    }}
  };
  const result=await removeCatalogInstallation({DB:db},'au_user','plg_mock123');
  assert.equal(result.removed,true);
  assert.ok(queries.every(query=>query.args.includes('plg_mock123') && query.args.includes('au_user')));
});
