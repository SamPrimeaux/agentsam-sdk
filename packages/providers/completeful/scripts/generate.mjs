#!/usr/bin/env node
// The checked-in Completeful Partner OpenAPI document is the only operation/type authority.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('../', import.meta.url);
const source = readFileSync(new URL('openapi/openapi.json', base));
const spec = JSON.parse(source);
const operationMap = `
GET /referrals/summary referrals.summary
GET /referrals/tier1 referrals.tier1
GET /referrals/tier2 referrals.tier2
GET /referrals/payouts referrals.payouts
GET /shops shops.list
POST /shops shops.create
GET /shops/{shopId} shops.get
DELETE /shops/{shopId}/connection shops.disconnect
GET /catalog/products catalog.products
GET /catalog/products/semantic catalog.semantic
GET /catalog/products/{productId} catalog.product
GET /catalog/products/{productId}/variants catalog.variants
GET /catalog/products/{productId}/print-locations catalog.printLocations
GET /catalog/products/{productId}/mockups catalog.mockups
GET /catalog/products/{productId}/shipping catalog.shipping
POST /addresses/validate addresses.validate
POST /print-files/validate printFiles.validate
GET /designs designs.list
POST /designs designs.create
GET /designs/exports/{exportId} designs.getExport
POST /designs/{designId}/exports designs.createExport
GET /designs/{designId} designs.get
PATCH /designs/{designId} designs.update
DELETE /designs/{designId} designs.delete
POST /assets assets.create
POST /assets/from-url assets.fromUrl
GET /assets/{assetId} assets.get
GET /shops/{shopId}/products products.list
POST /shops/{shopId}/products products.create
GET /shops/{shopId}/products/{productId} products.get
PATCH /shops/{shopId}/products/{productId} products.update
DELETE /shops/{shopId}/products/{productId} products.delete
POST /shops/{shopId}/products/{productId}/publish products.publish
POST /shops/{shopId}/products/{productId}/publishing_succeeded products.ackPublishSuccess
POST /shops/{shopId}/products/{productId}/publishing_failed products.ackPublishFailure
POST /shops/{shopId}/products/{productId}/unpublish products.unpublish
GET /shops/{shopId}/orders orders.list
POST /shops/{shopId}/orders orders.create
GET /shops/{shopId}/orders/{orderId} orders.get
POST /shops/{shopId}/orders/{orderId}/cancel orders.cancel
GET /shops/{shopId}/webhooks webhooks.list
POST /shops/{shopId}/webhooks webhooks.create
GET /shops/{shopId}/webhooks/{webhookId} webhooks.get
PATCH /shops/{shopId}/webhooks/{webhookId} webhooks.update
DELETE /shops/{shopId}/webhooks/{webhookId} webhooks.delete
POST /shops/{shopId}/webhooks/{webhookId}/test webhooks.test
GET /shops/{shopId}/webhooks/{webhookId}/deliveries webhooks.deliveries
POST /mockups/renders mockups.render
GET /mockups/renders/{renderId} mockups.getRender
GET /catalog/products/by-sku/{sku} catalog.bySku
GET /catalog/products/{productId}/assets catalog.assets
POST /shops/{shopId}/orders/quote orders.quote
GET /shops/{shopId}/orders/lookup/{externalOrderId} orders.lookup
POST /shops/{shopId}/webhooks/{webhookId}/rotate-secret webhooks.rotateSecret
POST /shops/{shopId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver webhooks.redeliver
`.trim().split('\n').map(row => {
  const [method, path, name] = row.split(/\s+/); return {method, path, name};
});
const specKeys = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.keys(methods).filter(m=>['get','post','put','patch','delete'].includes(m)).map(m=>m.toUpperCase()+' '+path));
if (specKeys.length !== operationMap.length ||
  new Set(operationMap.map(x=>x.name)).size !== operationMap.length ||
  new Set(operationMap.map(x=>x.method+' '+x.path)).size !== operationMap.length ||
  specKeys.some(key=>!operationMap.some(row=>row.method+' '+row.path===key)))
  throw new Error('Completeful OpenAPI has changed, update the operation map deliberately');
const ref = value => {
  if (!value?.$ref) return value || {};
  if (!value.$ref.startsWith('#/components/')) throw new Error('External OpenAPI reference unsupported: '+value.$ref);
  return value.$ref.slice(2).split('/').reduce((v,key)=>v?.[key],spec)||{};
};
function ty(schema) {
  if (!schema) return 'unknown';
  if (schema.$ref) return schema.$ref.split('/').at(-1);
  if (schema.oneOf) return '('+schema.oneOf.map(ty).join(' | ')+')';
  if (schema.anyOf) return '('+schema.anyOf.map(ty).join(' | ')+')';
  if (schema.allOf) return '('+schema.allOf.map(ty).join(' & ')+')';
  if (schema.enum) return schema.enum.map(x=>JSON.stringify(x)).join(' | ');
  const t = schema.type;
  if (Array.isArray(t)) return '('+t.map(x=>ty({...schema,type:x})).join(' | ')+')';
  switch(t) {
    case 'integer':case 'number':return 'number';
    case 'string':return 'string';
    case 'boolean':return 'boolean';
    case 'null':return 'null';
    case 'array':return 'Array<'+ty(schema.items)+'>';
    case 'object':case undefined:{
      if (!schema.properties && schema.additionalProperties === undefined) return 'Record<string, unknown>';
      const fields=Object.entries(schema.properties||{}).map(([name,s])=>
        JSON.stringify(name)+(schema.required?.includes(name)?'':'?')+': '+ty(s));
      if(schema.additionalProperties)fields.push('[key: string]: '+(schema.additionalProperties===true?'unknown':ty(schema.additionalProperties)));
      return '{ '+fields.join('; ')+' }';
    }
    default:return 'unknown';
  }
}
const defs={};
for (const {method,path,name} of operationMap) {
  const op=spec.paths[path][method.toLowerCase()];
  const params=[...(spec.paths[path].parameters||[]),...(op.parameters||[])].map(ref).filter(p=>p.name&&p.in);
  const queryParams=params.filter(p=>p.in==='query');
  const body=op.requestBody?.content?.['application/json']?.schema;
  const resolvedBody=ref(body);
  defs[name]={
    method,path,
    pathParams:[...path.matchAll(/\{(\w+)\}/g)].map(m=>m[1]),
    queryParams:queryParams.map(p=>p.name),
    requiredQuery:queryParams.filter(p=>p.required).map(p=>p.name),
    querySchemas:Object.fromEntries(queryParams.map(p=>[p.name,ref(p.schema)])),
    bodyRequired:Boolean(op.requestBody?.required),
    requiredBodyFields:resolvedBody.required||[],
    summary:op.summary||'',
  };
}
const hash=createHash('sha256').update(source).digest('hex');
const opsText='// AUTO-GENERATED from openapi/openapi.json. Do not edit.\n'+
  'export const COMPLETEFUL_CONTRACT = '+JSON.stringify({
    title:spec.info.title,version:spec.info.version,sha256:hash,
    operationCount:operationMap.length,pathCount:Object.keys(spec.paths).length,
  },null,2)+' as const;\n'+
  'export const COMPLETEFUL_OPERATIONS = '+JSON.stringify(defs,null,2)+' as const;\n';
const schemaDefs=Object.entries(spec.components?.schemas||{}).map(([name,body])=>
  'export type '+name+' = '+ty(body)+';').join('\n');
function objectType(entries, required=[]) {
  return '{ '+entries.map(([name,t])=>JSON.stringify(name)+(required.includes(name)?'':'?')+': '+t).join('; ')+' }';
}
const methodTypes=operationMap.map(({name,method,path})=>{
  const op=spec.paths[path][method.toLowerCase()];
  const params=[...(spec.paths[path].parameters||[]),...(op.parameters||[])].map(ref).filter(p=>p.name&&p.in);
  const pathParams=params.filter(p=>p.in==='path');
  const query=params.filter(p=>p.in==='query');
  const responseEntry=Object.entries(op.responses||{}).find(([status])=>/^2\d\d$/.test(status));
  const resSchema=responseEntry?.[1]?.content?.['application/json']?.schema;
  const bodySchema=op.requestBody?.content?.['application/json']?.schema;
  const body=bodySchema?ty(bodySchema):'undefined';
  return JSON.stringify(name)+': { '+
    'path: '+objectType(pathParams.map(p=>[p.name,ty(p.schema)]),pathParams.map(p=>p.name))+'; '+
    'query: '+objectType(query.map(p=>[p.name,ty(p.schema)]),query.filter(p=>p.required).map(p=>p.name))+'; '+
    'body: '+body+'; bodyRequired: '+Boolean(op.requestBody?.required)+'; response: '+ty(resSchema)+'; }';
}).join('\n');
const typeText='// AUTO-GENERATED from openapi/openapi.json. Do not edit.\n'+
  schemaDefs+'\nexport interface CompletefulOperationTypes {\n'+methodTypes+'\n}\n';
for(const [name,out] of [['operations.generated.ts',opsText],['types.generated.ts',typeText]]) {
  const file=new URL('src/core/generated/'+name,base);
  if(process.argv.includes('--check')) {
    if(readFileSync(file,'utf8')!==out)throw new Error('Stale generated '+name);
  } else writeFileSync(file,out);
}
console.log((process.argv.includes('--check')?'Checked':'Generated')+' '+operationMap.length+' Completeful operations, '+Object.keys(spec.components?.schemas||{}).length+' schema types, sha256 '+hash.slice(0,12));
