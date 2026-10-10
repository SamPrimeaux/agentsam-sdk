/**
 * Transactional local Node adapter using the existing @inneranimalmedia/cms-runtime
 * SQLite v1 schema. No sam_cms_* tables or alternate CMS storage authority.
 *
 * The schema is pinned verbatim as a distributable snapshot; SDK tests assert
 * byte-for-byte correspondence with packages/cms-runtime.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const serialize=JSON.stringify;
const parse=JSON.parse;
const digest=x=>createHash('sha256').update(serialize(x)).digest('hex');
const physicalSite=ctx=>'site_'+digest([ctx.accountId,ctx.installationId]).slice(0,32);
const physicalPage=(ctx,id)=>'page_'+digest([ctx.accountId,ctx.installationId,id]).slice(0,32);
const revId=(type,phys,version)=>type+'_'+phys+'_'+String(version).padStart(12,'0');
const identity=ctx=>{
  if(!ctx?.actorId||!ctx?.accountId||!ctx?.installationId) throw new Error('cms_trusted_identity_required');
  return ctx;
};
export async function createNodeSqliteCmsRepository({filename}={}) {
  if(!filename||!path.isAbsolute(filename)) throw new Error('cms_absolute_database_path_required');
  await mkdir(path.dirname(filename),{recursive:true});
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const schema=await readFile(new URL('./schema/cms-local-runtime.v1.sql',import.meta.url),'utf8');
  db.exec(schema);

  const readDraft=db.prepare("SELECT snapshot_json FROM cms_revisions WHERE page_id=? AND kind='draft' ORDER BY id DESC LIMIT 1");
  const readRevision=db.prepare("SELECT snapshot_json FROM cms_revisions WHERE id=? AND page_id=? AND kind='draft'");
  const addRevision=db.prepare('INSERT INTO cms_revisions(id,page_id,kind,created_at,label,snapshot_json) VALUES(?,?,?,?,?,?)');
  const getPage=(ctx,pageId)=>{
    identity(ctx);
    const row=readDraft.get(physicalPage(ctx,pageId));
    return row?parse(row.snapshot_json):null;
  };
  const run=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try{const output=fn();db.exec('COMMIT');return output;}
    catch(error){db.exec('ROLLBACK');throw error;}
  };
  const appendRevision=(ctx,physical,doc,effect,now)=>{
    addRevision.run(revId('drev',physical,doc.version),physical,'draft',now,
      serialize({version:doc.version,effect,actorId:ctx.actorId,sha256:digest(doc)}),serialize(doc));
  };
  const project=(ctx,physical,doc,effect)=>{
    db.prepare('UPDATE cms_pages SET title=?,slug=?,status=? WHERE id=? AND site_id=?')
      .run(doc.title,doc.slug,effect==='live_publish'?'published':'draft',physical,physicalSite(ctx));
    // Keep the established content tables materialized for the ordinary CMS UI.
    db.prepare('DELETE FROM cms_sections WHERE page_id=?').run(physical);
    const sectionInsert=db.prepare('INSERT INTO cms_sections(id,page_id,name,type,visible,fields_json,sort_order) VALUES(?,?,?,?,?,?,?)');
    const blockInsert=db.prepare('INSERT INTO cms_blocks(id,section_id,type,visible,data_json,sort_order) VALUES(?,?,?,?,?,?)');
    for(const [index,section] of doc.sections.entries()){
      const sectionId='section_'+digest([physical,section.id]).slice(0,32);
      sectionInsert.run(sectionId,physical,section.definitionKey,section.definitionKey,
        section.visible?1:0,serialize({...section.settings,__samComponentId:section.id}),index);
      for(const [blockIndex,block] of (section.blocks||[]).entries()){
        const blockId='block_'+digest([physical,block.id]).slice(0,32);
        blockInsert.run(blockId,sectionId,block.definitionKey,block.visible?1:0,
          serialize({...block.settings,__samComponentId:block.id}),blockIndex);
      }
    }
  };
  const createPage=(ctx,{pageId,title,slug,idempotencyKey})=>{
    identity(ctx);
    return run(()=>{
      const prev=getPage(ctx,pageId);
      if(prev){
        if(idempotencyKey&&prev.createKey===idempotencyKey&&prev.slug===slug&&prev.title===title)
          return {document:prev,duplicate:true};
        throw Object.assign(new Error('cms_page_already_exists'),{code:'cms_page_already_exists'});
      }
      const site=physicalSite(ctx),phys=physicalPage(ctx,pageId),now=new Date().toISOString();
      db.prepare("INSERT OR IGNORE INTO cms_sites(id,name,initials) VALUES(?,'CMS Installation','CMS')").run(site);
      db.prepare("INSERT INTO cms_pages(id,site_id,title,slug,status) VALUES(?,?,?,?,'draft')").run(phys,site,title,slug);
      const doc={id:pageId,title,slug,version:1,sections:[],publishedVersion:null,
        createdAt:now,updatedAt:now,createKey:idempotencyKey||null,dedupe:{}};
      appendRevision(ctx,phys,doc,'draft_create',now);
      return {document:doc,duplicate:false};
    });
  };
  const mutate=(ctx,{pageId,expectedVersion,effect,idempotencyKey=null,fingerprint=null,apply})=>{
    identity(ctx);
    if(!Number.isInteger(expectedVersion)||expectedVersion<1) throw Object.assign(new Error('cms_expected_version_required'),{code:'cms_expected_version_required'});
    return run(()=>{
      const before=getPage(ctx,pageId);
      if(!before) throw Object.assign(new Error('cms_page_not_found'),{code:'cms_page_not_found'});
      if(idempotencyKey&&before.dedupe?.[idempotencyKey]){
        const record=before.dedupe[idempotencyKey];
        if(record.fingerprint!==fingerprint) throw Object.assign(new Error('cms_idempotency_key_conflict'),{code:'cms_idempotency_key_conflict'});
        return {document:before,result:record.result,duplicate:true};
      }
      if(before.version!==expectedVersion) throw Object.assign(new Error('cms_version_conflict'),{code:'cms_version_conflict',expectedVersion,currentVersion:before.version});
      const next=structuredClone(before),result=apply(next);
      if(result?.then) throw new Error('cms_transaction_apply_must_be_synchronous');
      const now=new Date().toISOString(),phys=physicalPage(ctx,pageId);
      next.version=before.version+1;next.updatedAt=now;
      if(idempotencyKey){
        next.dedupe ||= {};
        next.dedupe[idempotencyKey]={fingerprint,result:{...result,version:next.version}};
        const keys=Object.keys(next.dedupe);
        if(keys.length>128) for(const old of keys.slice(0,keys.length-128)) delete next.dedupe[old];
      }
      appendRevision(ctx,phys,next,effect,now);
      project(ctx,phys,next,effect);
      if(effect==='live_publish'){
        // The live projection contains only the approved prior draft revision.
        const publishedVersion=before.version;
        const pubDocument={...before,dedupe:{},createKey:null};
        const publicationId=revId('prev',phys,publishedVersion);
        addRevision.run(publicationId,phys,'publication',now,
          serialize({version:publishedVersion,effect,actorId:ctx.actorId,sha256:digest(pubDocument)}),serialize(pubDocument));
        db.prepare(`INSERT INTO cms_publications(page_id,publication_id,route,revision_num,theme,sections_json,published_at,metadata_json)
          VALUES(?,?,?,?,'default',?,?,?)
          ON CONFLICT(page_id) DO UPDATE SET publication_id=excluded.publication_id,route=excluded.route,
          revision_num=excluded.revision_num,sections_json=excluded.sections_json,
          published_at=excluded.published_at,metadata_json=excluded.metadata_json`)
          .run(phys,publicationId,pubDocument.slug,publishedVersion,serialize(pubDocument.sections),now,
            serialize({digest:digest(pubDocument),source:'sam-cms-operation-engine'}));
      }
      return {document:next,result,duplicate:false};
    });
  };
  const history=(ctx,pageId,limit=30)=>{
    identity(ctx);
    return db.prepare("SELECT label,created_at AS createdAt FROM cms_revisions WHERE page_id=? AND kind='draft' ORDER BY id DESC LIMIT ?")
      .all(physicalPage(ctx,pageId),limit).map(row=>({...parse(row.label),createdAt:row.createdAt}));
  };
  const getRevision=(ctx,pageId,version)=>{
    identity(ctx);
    const phys=physicalPage(ctx,pageId);
    const row=readRevision.get(revId('drev',phys,version),phys);
    return row?parse(row.snapshot_json):null;
  };
  const getPublication=(ctx,pageId,version=null)=>{
    identity(ctx);
    const phys=physicalPage(ctx,pageId);
    const row=version==null
      ? db.prepare("SELECT snapshot_json FROM cms_revisions WHERE page_id=? AND kind='publication' ORDER BY id DESC LIMIT 1").get(phys)
      : db.prepare("SELECT snapshot_json FROM cms_revisions WHERE id=? AND page_id=? AND kind='publication'").get(revId('prev',phys,version),phys);
    if(!row) return null;
    const document=parse(row.snapshot_json);
    return {document,version:document.version,digest:digest(document)};
  };
  return Object.freeze({createPage,readPage:getPage,mutate,history,getRevision,getPublication,close:()=>db.close(),digest});
}
