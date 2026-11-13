import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateCanvasDocument, blankCanvasDocument } from './work-canvas.js';
import { canvasToThemeProject } from './work-canvas-cms.js';
import { projectSideStageContribution } from './plugin-side-stages.js';
const sql = readFileSync(new URL('../migrations/1364_design_canvas_native_unification.sql', import.meta.url), 'utf8');

function htmlDocument(html = '<!doctype html><html><head></head><body>Hello</body></html>') {
  return { ...blankCanvasDocument(), artboards:[{id:'board_unified',name:'Imported source',x:0,y:0,width:1200,height:900,background:'#fff',nodes:[{id:'node_html',type:'html',name:'Source HTML',x:0,y:0,width:1200,height:900,sourceHtml:html,sourceBase:'/design-canvas/sources/agentsam/'}]}] };
}

test('source-backed HTML artboards are valid and kept in owner-backed Canvas documents',()=>{
  assert.equal(validateCanvasDocument(htmlDocument()), true);
  assert.equal(validateCanvasDocument(htmlDocument('')), false);
  assert.equal(validateCanvasDocument({...htmlDocument(),artboards:[{...htmlDocument().artboards[0],nodes:[{...htmlDocument().artboards[0].nodes[0],sourceHtml:'A'.repeat(200001)}]}]}), false);
  assert.equal(validateCanvasDocument({...htmlDocument(),artboards:[{...htmlDocument().artboards[0],nodes:[{...htmlDocument().artboards[0].nodes[0],sourceBase:'https://evil.example/'}]}]}), false);
});

test('unmapped HTML source cannot become live CMS blocks through converter',()=>{
  const doc = htmlDocument();
  const source = {canvasId:'canvas_test', revision:1,contentHash:'a'.repeat(64)};
  assert.throws(()=>canvasToThemeProject(doc,source,'canvas_test'),/canvas_cms_incompatible|unsupported|unmapped|node_type/i);
});

test('installed Design Canvas becomes the native editor while preserving app installation data',()=>{
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE agentsam_plugins(id TEXT,plugin_key TEXT,plugin_kind TEXT,family_key TEXT,display_name TEXT,metadata_json TEXT,description TEXT,updated_at INTEGER);');
    db.exec('CREATE TABLE agentsam_plugin_installations(account_id TEXT,plugin_id TEXT,enabled INTEGER);');
    const metadata={source:'https://agentsam.inneranimalmedia.com',app:{nav:{href:'/admin/design-canvas/',label:'Design Canvas'},surfaces:['admin-nav','add-apps']},side_stage:{version:1,id:'design-canvas',renderer:'embed',href:'https://agentsam.inneranimalmedia.com/admin/design-canvas/',icon:'layout'},other:'keep'};
    db.prepare('INSERT INTO agentsam_plugins VALUES (?,?,?,?,?,?,?,0)').run('plg_1234567890abcdef','agentsam-design-canvas','native','build','Design Canvas',JSON.stringify(metadata),'old description');
    db.prepare('INSERT INTO agentsam_plugin_installations VALUES (?,?,?)').run('account_one','plg_1234567890abcdef',1);
    db.exec(sql); db.exec(sql);
    const row=db.prepare('SELECT * FROM agentsam_plugins').get();
    const next=JSON.parse(row.metadata_json);
    assert.equal(next.app.nav.href,'/canvas?library=sources');
    assert.equal(next.side_stage.renderer,'builtin');
    assert.equal(next.side_stage.tab_kind,'design');
    assert.equal(next.side_stage.href,undefined);
    assert.equal(next.other,'keep');
    assert.deepEqual({...db.prepare('SELECT * FROM agentsam_plugin_installations').get()},{account_id:'account_one',plugin_id:'plg_1234567890abcdef',enabled:1});
    const stage=projectSideStageContribution({...row});
    assert.equal(stage.renderer,'builtin');
    assert.equal(stage.tabKind,'design');
    assert.equal(stage.id,'agentsam-design-canvas');
    assert.equal(projectSideStageContribution({...row,plugin_key:'other-design'}),null);
  } finally { db.close(); }
});
