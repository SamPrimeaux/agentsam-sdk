import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';

const migration=readFileSync(new URL('../migrations/1393_live_workbench_widget_sources.sql',import.meta.url),'utf8');

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE agentsam_widget_catalog(widget_key TEXT PRIMARY KEY,data_adapter_key TEXT);
    CREATE TABLE agentsam_widget_installations(
      id INTEGER PRIMARY KEY,account_id TEXT,widget_key TEXT,surface TEXT,instance_key TEXT,enabled INTEGER
    );
    CREATE TABLE agentsam_widget_preferences(installation_id INTEGER PRIMARY KEY,preferences_json TEXT);
    INSERT INTO agentsam_widget_catalog VALUES
      ('queues','fixture.queue'),('pull-request-summary','widget.configuration.snapshot'),
      ('release-readiness','widget.configuration.snapshot');
    INSERT INTO agentsam_widget_installations VALUES
      (1,'alice','queues','agentsam_stage','default',1),
      (2,'alice','pull-request-summary','agentsam_stage','default',1),
      (3,'alice','release-readiness','agentsam_stage','default',1),
      (4,'bob','pull-request-summary','agentsam_stage','default',1),
      (5,'bob','release-readiness','agentsam_stage','default',1);
  `);
  const insert=db.prepare('INSERT INTO agentsam_widget_preferences VALUES (?,?)');
  insert.run(2,JSON.stringify({repository:'alice/current',pullNumber:11,githubAccount:'alice-gh',snapshot:{repository:'alice/legacy',number:42,title:'stale'}}));
  insert.run(3,JSON.stringify({snapshot:{repository:'alice/release-legacy',ref:'release/2026'}}));
  insert.run(4,JSON.stringify({snapshot:{repository:'bob/repo',number:7}}));
  insert.run(5,JSON.stringify({snapshot:{}}));
  return db;
}
function preferences(db,id){
  return JSON.parse(db.prepare('SELECT preferences_json FROM agentsam_widget_preferences WHERE installation_id=?').get(id).preferences_json);
}

test('1393 installs live adapters and migrates old snapshots into validated account-scoped configuration',()=>{
  const db=fixture();
  db.exec(migration);
  const adapters=Object.fromEntries(db.prepare('SELECT widget_key,data_adapter_key FROM agentsam_widget_catalog').all().map(row=>[row.widget_key,row.data_adapter_key]));
  assert.deepEqual(adapters,{
    queues:'queues.observability',
    'pull-request-summary':'github.pull-request',
    'release-readiness':'github.commit-readiness',
  });

  const alicePr=preferences(db,2);
  assert.deepEqual(alicePr,{repository:'alice/current',pullNumber:11,githubAccount:'alice-gh'});
  const aliceRelease=preferences(db,3);
  assert.deepEqual(aliceRelease,{repository:'alice/release-legacy',ref:'release/2026',githubAccount:'alice-gh'});

  const bobPr=preferences(db,4);
  assert.deepEqual(bobPr,{repository:'bob/repo',pullNumber:7,githubAccount:null});
  const bobRelease=preferences(db,5);
  assert.deepEqual(bobRelease,{repository:'bob/repo',ref:'main',githubAccount:null});
  assert.equal(db.prepare('SELECT data_adapter_key FROM agentsam_widget_catalog WHERE widget_key=?').get('queues').data_adapter_key,'queues.observability');
  db.close();
});
