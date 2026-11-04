import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { planCmsCollectionAlignment } from '../db/schema/migrations/cms-collections.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function parseD1CommandOutput(output) {
  // File imports can emit upload progress before Wrangler's --json payload.
  const start=output.search(/^[\[{]\s*$/m);
  const value=JSON.parse(start<0?output:output.slice(start));
  const results=Array.isArray(value)?value:[value];
  if(results.some(row=>row.success===false))throw new Error('D1 query failed');
  return results.flatMap(row=>row.results||[]);
}

export async function runCollectionMigration(args) {
  const flag=name=>args.includes(name);
  const value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  if(flag('--help')||(!value('--sqlite')&&!value('--d1'))) {
    console.log('ecommerce collections:migrate --sqlite <file> | --d1 <database> [--config <wrangler>] [--remote] [--legacy-site-id <id>] [--claim-unscoped-products] [--out <sql>] [--apply --backup <file>]');
    return;
  }
  const database=value('--d1'),sqlite=value('--sqlite'),apply=flag('--apply'),remote=flag('--remote');
  if(Boolean(database)===Boolean(sqlite))throw new Error('Select exactly one database');
  if(apply&&!value('--backup'))throw new Error('Applying requires an explicit --backup path');
  const backup=value('--backup');
  if(backup&&fs.existsSync(backup))throw new Error('Backup already exists; choose a new filename');
  let db=null;
  const executeD1=(command,{json=true}={})=>{
    const wrangler=path.join(app,'node_modules/wrangler/bin/wrangler.js');
    const argv=[wrangler,'d1',...command];
    if(value('--config'))argv.push('--config',value('--config'));
    const result=spawnSync(process.execPath,argv,{encoding:'utf8',maxBuffer:16*1024*1024});
    if(result.status!==0)throw new Error(result.stderr||result.stdout||'D1 command failed');
    if(!json)return result.stdout;
    return parseD1CommandOutput(result.stdout);
  };
  const d1Flags=remote?['--remote']:['--local'];
  const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
  const sql=sqlite ? {
    all:async(q,params=[])=>db.prepare(q).all(...params),
  }:{
    all:async(q,params=[])=>{let i=0;const bound=q.replace(/\?/g,()=>quote(params[i++]));
      if(i!==params.length)throw new Error('Migration parameter mismatch');
      return executeD1(['execute',database,...d1Flags,'--command',bound,'--json']);},
  };
  if(sqlite)db=new DatabaseSync(path.resolve(sqlite),{readOnly:!apply});
  try {
    const plan=await planCmsCollectionAlignment(sql,{legacySiteId:value('--legacy-site-id'),claimUnscopedProducts:flag('--claim-unscoped-products')});
    if(value('--out'))fs.writeFileSync(value('--out'),plan.sql+'\n',{flag:'wx'});
    if(!apply) {console.log(JSON.stringify({...plan,applied:false},null,2));return plan;}
    if(sqlite) {
      // The CLI has not written anything yet. VACUUM INTO captures a consistent snapshot.
      db.exec('VACUUM INTO '+quote(path.resolve(backup)));
      db.exec('BEGIN IMMEDIATE');
      try{db.exec(plan.sql);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    } else {
      const existing=new Set((await sql.all("SELECT name FROM sqlite_master WHERE type='table'")).map(row=>row.name));
      const backupTables=['accounts','cms_sites','cms_collections','cms_collection_items','cms_collection_assets','products','store_collections','store_collection_products']
        .filter(table=>existing.has(table));
      executeD1(['export',database,...d1Flags,'--output',backup,'--table',...backupTables],{json:false});
      if(!fs.existsSync(backup)||fs.statSync(backup).size===0)throw new Error('Backup verification failed');
      // Wrangler submits a file as one D1 import transaction; no request-time DDL.
      const {tmpdir}=await import('node:os');
      const temporary=fs.mkdtempSync(path.join(tmpdir(),'cms-collections-'));
      try {
        const file=path.join(temporary,'alignment.sql');fs.writeFileSync(file,plan.sql+'\n');
        executeD1(['execute',database,...d1Flags,'--file',file,'--json']);
      } finally {fs.rmSync(temporary,{recursive:true,force:true});}
    }
    const ownership=await sql.all('SELECT c.id FROM cms_collections c LEFT JOIN cms_sites s ON s.id=c.site_id AND s.account_id=c.account_id WHERE s.id IS NULL LIMIT 1');
    if(ownership.length)throw new Error('Collection ownership verification failed');
    const counts=await sql.all('SELECT count(*) AS collections FROM cms_collections');
    console.log(JSON.stringify({applied:true,backup,backup_scope:sqlite?'database':'affected tables and ownership records',legacy_site_id:plan.legacy_site_id,...counts[0]},null,2));
    return {applied:true};
  } finally {db?.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runCollectionMigration(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
