import test from 'node:test';
import assert from 'node:assert/strict';
import { FORM_STARTERS, normalizeFormDocument, handleAgentSamFormsApi,
  handleAgentSamFormsPublic } from './agentsam-forms.js';

const site = 'https://agentsam.inneranimalmedia.com';
function call(path, { method='GET', data, origin=site }={}) {
  return new Request(site+path, {
    method, headers: { origin, ...(data===undefined?{}:{'content-type':'application/json'}) },
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
  });
}
async function body(res) { return res.json(); }
function fakeDb(installedAccounts=['acc_a']) {
  const forms=new Map(), submissions=[];
  let seq=0;
  const next = ()=>'frm_'+(++seq).toString(16).padStart(16,'0');
  function sqlExec(query,args,operation) {
    if(query.includes('FROM agentsam_plugin_installations')) return installedAccounts.includes(args[0])?{exists:1}:null;
    if(query.startsWith('SELECT * FROM agentsam_forms WHERE account_id=')) {
      const row=forms.get(args[1]);
      return row?.account_id===args[0]?{...row}:null;
    }
    if(query.startsWith('SELECT * FROM agentsam_forms WHERE id=')) {
      const row=forms.get(args[0]);
      return row?.status==='published'?{...row}:null;
    }
    if(query.startsWith('SELECT id,key,title,description,status')) {
      return [...forms.values()].filter(f=>f.account_id===args[0]).map(f=>({
        id:f.id,key:f.key,title:f.title,description:f.description,status:f.status,
        version:f.version,created_at:f.created_at,updated_at:f.updated_at,published_at:f.published_at,
        submission_count:submissions.filter(s=>s.form_id===f.id).length,
      }));
    }
    if(query.startsWith('INSERT OR IGNORE INTO agentsam_forms')) {
      const [account,key,title,description,document_json]=args;
      if([...forms.values()].some(f=>f.account_id===account && f.key===key))return {meta:{changes:0}};
      const id=next();
      forms.set(id,{id,account_id:account,key,title,description,status:'draft',
        document_json,version:1,created_at:1,updated_at:1,published_at:null});
      return {meta:{changes:1}};
    }
    if(query.startsWith('UPDATE agentsam_forms SET title=')) {
      const [title,description,document_json,id,account,version]=args;
      const row=forms.get(id);
      if(row?.account_id!==account || row.version!==version || row.status!=='draft')
        return {meta:{changes:0}};
      Object.assign(row,{title,description,document_json,version:version+1});
      return {meta:{changes:1}};
    }
    if(query.startsWith('UPDATE agentsam_forms SET status=')) {
      const [status,published_at,id,account]=args; const row=forms.get(id);
      if(row.account_id!==account)return {meta:{changes:0}};
      Object.assign(row,{status,published_at});
      return {meta:{changes:1}};
    }
    if(query.startsWith('SELECT id,payload_json,is_test,created_at FROM agentsam_form_submissions')) {
      return submissions.filter(s=>s.account_id===args[0] && s.form_id===args[1]).map(s=>({...s}));
    }
    if(query.startsWith('INSERT INTO agentsam_form_submissions')) {
      const [account_id,form_id,payload_json]=args;
      submissions.push({id:'fsub_'+(submissions.length+1),account_id,form_id,payload_json,
        is_test:query.includes('VALUES (?,?,?,1)')?1:0,created_at:10+submissions.length});
      return {meta:{last_row_id:submissions.length,changes:1}};
    }
    throw Error('Unhandled fake SQL: '+query);
  }
  const db={
    prepare(sql) {
      return {bind(...args) {
        return { first:async()=>sqlExec(sql,args,'first'),
          all:async()=>({results:sqlExec(sql,args,'all')}),
          run:async()=>sqlExec(sql,args,'run') };
      }};
    },
    async batch(statements) {return Promise.all(statements.map(s=>s.run()));},
  };
  return {db,forms,submissions};
}

test('five useful, unique, validated forms have actionable fields',()=>{
  assert.equal(FORM_STARTERS.length,5);
  assert.equal(new Set(FORM_STARTERS.map(f=>f.key)).size,5);
  for(const sample of FORM_STARTERS){
    const d=normalizeFormDocument(sample.document);
    assert.ok(d.fields.length>=3);
    assert.ok(d.fields.some(f=>f.required));
    assert.ok(d.fields.every(f=>f.key && f.label));
  }
  const newsletter=FORM_STARTERS.find(x=>x.key==='newsletter-signup');
  assert.equal(newsletter.document.fields.find(f=>f.key==='consent').required,true);
  const merch=FORM_STARTERS.find(x=>x.key==='custom-merch-request');
  assert.ok(merch.document.fields.some(f=>f.key==='quantity'));
});
test('invalid content, duplicate fields and unsafe field types fail closed',()=>{
  const d=structuredClone(FORM_STARTERS[0].document);
  d.fields[1].key=d.fields[0].key;
  assert.throws(()=>normalizeFormDocument(d),/field_key_invalid/);
  d.fields[1].key='email';d.fields[1].type='script';
  assert.throws(()=>normalizeFormDocument(d),/field_type_invalid/);
});
test('nonmembers cannot list or bootstrap account forms',async()=>{
  const {db}=fakeDb();
  assert.equal((await body(await handleAgentSamFormsApi(call('/api/forms'),{DB:db},null))).error,'unauthorized');
  const r=await body(await handleAgentSamFormsApi(call('/api/forms'),{DB:db},'acc_b'));
  assert.equal(r.installed,false); assert.deepEqual(r.forms,[]);
  const denied=await handleAgentSamFormsApi(call('/api/forms/bootstrap',{method:'POST'}),{DB:db},'acc_b');
  assert.equal(denied.status,403);
});
test('install owner seeds exactly five once and isolates other accounts',async()=>{
  const {db,forms}=fakeDb();
  let r=await handleAgentSamFormsApi(call('/api/forms/bootstrap',{method:'POST'}),{DB:db},'acc_a');
  assert.equal(r.status,200);assert.equal((await body(r)).forms.length,5);
  r=await handleAgentSamFormsApi(call('/api/forms/bootstrap',{method:'POST'}),{DB:db},'acc_a');
  assert.equal((await body(r)).forms.length,5);
  assert.equal(forms.size,5);
  const other=await body(await handleAgentSamFormsApi(call('/api/forms'),{DB:db},'acc_b'));
  assert.deepEqual(other.forms,[]);
});
test('versioned editing, test submissions, public publish lifecycle are real',async()=>{
  const {db,forms,submissions}=fakeDb();
  await handleAgentSamFormsApi(call('/api/forms/bootstrap',{method:'POST'}),{DB:db},'acc_a');
  const form=[...forms.values()].find(f=>f.key==='newsletter-signup');
  const id=form.id;
  const document=JSON.parse(form.document_json);
  document.title='Join our updates';
  let r=await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'PUT',data:{version:1,document}}),{DB:db},'acc_a');
  assert.equal(r.status,200);assert.equal((await body(r)).form.version,2);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'PUT',data:{version:1,document}}),{DB:db},'acc_a');
  assert.equal(r.status,409);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id+'/test',{method:'POST',
    data:{name:'Pat',email:'pat@example.com',consent:true}}),{DB:db},'acc_a');
  assert.equal(r.status,201);assert.equal(submissions.length,1);
  let publicResponse=await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db});
  assert.equal(publicResponse.status,404);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id+'/publish',{method:'POST'}),{DB:db},'acc_a');
  assert.equal(r.status,200);
  publicResponse=await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db});
  assert.equal(publicResponse.status,200);
  assert.match(await publicResponse.text(),/Join our updates/);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id,{method:'PUT',data:{version:2,document}}),{DB:db},'acc_a');
  assert.equal(r.status,409);
  const realBody=new URLSearchParams({name:'Taylor',email:'taylor@example.com',consent:'on'});
  publicResponse=await handleAgentSamFormsPublic(new Request(site+'/api/forms/public/'+id,{
    method:'POST',headers:{origin:site,'content-type':'application/x-www-form-urlencoded'},body:realBody,
  }),{DB:db});
  assert.equal(publicResponse.status,200);
  assert.equal(submissions.length,2);
  assert.equal(submissions[1].is_test,0);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id+'/submissions'),{DB:db},'acc_a');
  const fetched=(await body(r)).submissions;
  assert.equal(fetched.length,2);
  assert.deepEqual(fetched.map(s=>s.is_test),[true,false]);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id),{DB:db},'acc_b');
  assert.equal(r.status,403);
  r=await handleAgentSamFormsApi(call('/api/forms/'+id+'/unpublish',{method:'POST'}),{DB:db},'acc_a');
  assert.equal(r.status,200);
  publicResponse=await handleAgentSamFormsPublic(call('/forms/embed/'+id),{DB:db});
  assert.equal(publicResponse.status,404);
});
