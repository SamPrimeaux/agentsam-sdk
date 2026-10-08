import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRepositoryCrawl, machineEvidence } from '../src/crawl.js';
import { findRefineryCandidates } from '../src/refinery.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const fixture = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-crawl-test-'));
  const facts = [];
  for (const [name, content] of Object.entries(files)) {
    const dest = path.join(root, name);
    fs.mkdirSync(path.dirname(dest), { recursive:true });
    fs.writeFileSync(dest, content);
    facts.push({ id:`file:${name}`, fs_kind:'file', path:name, sha256:hash(content), size:Buffer.byteLength(content),
      source:{kind:'code',type:'javascript'}, classification:{generated:false} });
  }
  const receipt = { schema:'agentsam.machine.receipt.v1', capability:'machine.inspect', root,run_id:'run_test',
    facts,edges:[],errors:[],summary:{facts_total:facts.length,edges_total:0} };
  return { root, receipt, close:()=>fs.rmSync(root,{recursive:true,force:true}) };
};
const pkg = name => JSON.stringify({name,version:'1.0.0',dependencies:{'@example/util':'^1.0.0'}});
const implementation = "import { widget } from '@example/util';\nexport function renderWidget(a) { return widget(a); }\nexport function createWidget(b) { return b; }\n";

test('Machine receipts normalize to stable Repository graphs, manifest dependencies, symbols and imports', t => {
  const f = fixture({'package.json':pkg('@inneranimalmedia/media-kit'),'src/widget.js':implementation,'src/other.js':"import './widget.js';\n"});
  t.after(f.close);
  const first = createRepositoryCrawl(f.receipt,{repository:'one'});
  const second = createRepositoryCrawl({...f.receipt,facts:[...f.receipt.facts].reverse()},{repository:'one'});
  assert.equal(first.snapshot_hash,second.snapshot_hash);
  assert.equal(first.snapshot_id,second.snapshot_id);
  assert.equal(first.errors.length,0);
  assert.ok(first.resources.some(r=>r.kind==='package'&&r.name==='@inneranimalmedia/media-kit'));
  assert.ok(first.edges.some(e=>e.type==='imports'&&e.from==='file:src/other.js'&&e.to==='file:src/widget.js'));
  assert.ok(first.edges.some(e=>e.type==='depends_on'&&e.to==='dependency:@example/util'));
  assert.ok(first.edges.some(e=>e.type==='declares'&&e.to==='symbol:src/widget.js#renderWidget'));
  assert.ok(first.sources.some(s=>s.path==='src/widget.js'&&s.symbols.includes('createWidget')));
  assert.deepEqual(first.resources,[...first.resources].sort((a,b)=>a.id.localeCompare(b.id)));
});

test('miner finds exact reuse in independent repos with provenance and manifest-based owner', t => {
  const a=fixture({'package.json':pkg('@inneranimalmedia/media-kit'),'src/image.js':implementation});
  const b=fixture({'package.json':pkg('customer-store'),'lib/image.js':implementation});
  t.after(()=>{a.close();b.close();});
  const graphs=[createRepositoryCrawl(a.receipt,{repository:'sdk'}), createRepositoryCrawl(b.receipt,{repository:'customer'})];
  const mined=findRefineryCandidates(graphs);
  assert.equal(mined.counts.candidate_pairs,1);
  const [candidate]=mined.candidates;
  assert.equal(candidate.match.type,'exact_hash');
  assert.equal(candidate.likely_owner.package,'@inneranimalmedia/media-kit');
  assert.equal(candidate.promotion.approval_required,true);
  assert.equal(candidate.promotion.source_mutated,false);
  assert.equal(candidate.implementations[0].source_hash,hash(implementation));
  assert.equal(fs.readFileSync(path.join(a.root,'src/image.js'),'utf8'),implementation);
});

test('token normalized matches tolerate trivia but not changed string literals', t => {
  const a=fixture({'src/example.js':implementation});
  const b=fixture({'src/example.js':implementation.replace('return widget(a);','return  /* same */ widget(a);')});
  const c=fixture({'src/example.js':implementation.replace("'@example/util'","'@other/util'")});
  t.after(()=>{a.close();b.close();c.close();});
  const ga=createRepositoryCrawl(a.receipt,{repository:'A'});
  const gb=createRepositoryCrawl(b.receipt,{repository:'B'});
  const gc=createRepositoryCrawl(c.receipt,{repository:'C'});
  assert.equal(findRefineryCandidates([ga,gb]).candidates[0].match.type,'normalized_hash');
  assert.notEqual(ga.sources[0].normalized_hash,gc.sources[0].normalized_hash);
});

test('miner rejects unrelated exports and protects safety boundaries', t => {
  const a=fixture({'src/a.js':'export function a() { return 1 }'});
  const b=fixture({'src/b.js':'export function b() { return 2 }'});
  t.after(()=>{a.close();b.close();});
  assert.equal(findRefineryCandidates([createRepositoryCrawl(a.receipt,{repository:'A'}),createRepositoryCrawl(b.receipt,{repository:'B'})]).counts.candidate_pairs,0);
  assert.throws(()=>machineEvidence({...a.receipt,root:b.root},{root:a.root}),/root mismatch/);
  a.receipt.facts[0].sha256='0'.repeat(64);
  const g=createRepositoryCrawl(a.receipt);
  assert.equal(g.sources.length,0);
  assert.ok(g.errors.some(e=>e.reason.includes('hash mismatch')));
});

test('Wrangler JSONC and migration/capability manifests produce config-only, source-linked evidence', t => {
  const sample = fixture({
    'wrangler.jsonc':'{ // worker config\n "name":"sample-worker", "r2_buckets":[{"binding":"ASSETS","bucket_name":"site-assets",}],\n "vars":{"PRIVATE_TOKEN":"never-include-secret"}, }',
    'db/migrations/0001_init.sql':'-- CREATE TABLE fake;\nCREATE TABLE IF NOT EXISTS real_orders (id TEXT);',
    'protocol/capabilities/manifest.json':JSON.stringify({capabilities:{'site.scrape':{status:'stable'}}}),
  });
  t.after(sample.close);
  const g = createRepositoryCrawl(sample.receipt,{repository:'sample'});
  assert.equal(g.errors.length,0);
  assert.ok(g.resources.some(r=>r.kind==='worker' && r.name==='sample-worker' && r.evidence_status==='configured_not_deployed'));
  assert.ok(g.resources.some(r=>r.kind==='r2_bucket' && r.name==='site-assets' && r.evidence_status==='configured_not_verified'));
  assert.ok(g.edges.some(e=>e.type==='binds_to' && e.to==='binding:wrangler.jsonc:ASSETS'));
  assert.ok(g.edges.some(e=>e.type==='defines' && e.to==='database_table:real_orders'));
  assert.ok(g.resources.some(r=>r.id==='capability:site.scrape'));
  assert.ok(!JSON.stringify(g).includes('never-include-secret'));
  assert.ok(!g.resources.some(r=>r.id==='database_table:fake'));
});

test('quality aggregator uses existing receipt evidence and never invents a pass', async () => {
  const { aggregateRefineryQuality } = await import('../src/refinery.js');
  const candidate = {candidate_id:'cand_test',implementations:[{repository:'A',path:'src/a.js'}]};
  assert.equal(aggregateRefineryQuality(candidate).status,'awaiting_approval');
  assert.equal(aggregateRefineryQuality(candidate,{approved:true}).status,'incomplete');
  const checks=['package.audit','package.verify','security.scan','consumer.parity','product.proof'].map(tool=>({tool,status:'passed',receipt_ref:`receipt:${tool}`}));
  const result=aggregateRefineryQuality(candidate,{approved:true,checks});
  assert.equal(result.status,'verified');
  assert.equal(result.source_mutated,false);
  assert.equal(aggregateRefineryQuality(candidate,{approved:true,checks:[...checks.slice(0,1),{...checks[1],status:'failed'},...checks.slice(2)]}).status,'blocked');
  assert.equal(aggregateRefineryQuality(candidate,{approved:true,checks:[{tool:'package.audit',status:'passed'}]}).status,'incomplete');
});
