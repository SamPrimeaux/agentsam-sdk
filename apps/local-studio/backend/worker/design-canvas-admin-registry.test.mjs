import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/1361_design_canvas_canonical_admin_entry.sql',import.meta.url),'utf8');
test('Canvas admin URL migration preserves app identity and installation metadata',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE agentsam_plugins(plugin_key TEXT,plugin_kind TEXT,metadata_json TEXT,updated_at INTEGER);');
  const oldMeta={app:{nav:{href:'/design-canvas/',label:'Design Canvas'},surfaces:['admin-nav','add-apps']},
    side_stage:{id:'design-canvas',renderer:'embed',href:'https://agentsam.inneranimalmedia.com/design-canvas/',icon:'layout'},
    other:{retain:true}};
  db.prepare('INSERT INTO agentsam_plugins VALUES (?,?,?,0)').run('agentsam-design-canvas','native',JSON.stringify(oldMeta));
  db.prepare('INSERT INTO agentsam_plugins VALUES (?,?,?,0)').run('unrelated-app','native',JSON.stringify(oldMeta));
  db.exec(sql);
  const updated=JSON.parse(db.prepare("SELECT metadata_json FROM agentsam_plugins WHERE plugin_key='agentsam-design-canvas'").get().metadata_json);
  assert.equal(updated.app.nav.href,'/admin/design-canvas/');
  assert.equal(updated.side_stage.href,'https://agentsam.inneranimalmedia.com/admin/design-canvas/');
  assert.equal(updated.app.nav.label,'Design Canvas');
  assert.deepEqual(updated.app.surfaces,['admin-nav','add-apps']);
  assert.deepEqual(updated.other,{retain:true});
  const other=JSON.parse(db.prepare("SELECT metadata_json FROM agentsam_plugins WHERE plugin_key='unrelated-app'").get().metadata_json);
  assert.deepEqual(other,oldMeta);
 }finally{db.close();}
});
