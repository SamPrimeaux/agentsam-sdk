import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const file=readFileSync(new URL('../frontend/static/js/onboarding-preview.js',import.meta.url),'utf8');
const ID='cprev_'+'a'.repeat(24);
const pause=()=>new Promise(done=>setTimeout(done,0));
async function until(condition,iterations=45){
 for(let i=0;i<iterations;i++){
  if(condition())return;
  await pause();
 }
 throw Error('UI state was not reached');
}
test('a real offer advances through five customer123 screens and never calls a payment endpoint',async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{
  runScripts:'outside-only',url:'https://cms.test/admin/onboarding-preview?site_id=site-a',
  pretendToBeVisual:true
 });
 const w=dom.window,doc=w.document;
 const calls=[];
 let preview=null;
 const offers=[
  {id:'starter',name:'Studio Starter',description:'An actual offering',price_cents:250000,billing_interval:'one_time',category:'studio_services'},
  {id:'monthly',name:'Hosting Basic',description:'Monthly plan',price_cents:4900,billing_interval:'month',category:'hosting'}
 ];
 const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
 w.renderShell=(_,markup)=>{doc.body.innerHTML=markup;};
 w.fetch=async(url,options={})=>{
  const route=new URL(url);
  const path=route.pathname;
  const body=options.body?JSON.parse(options.body):null;
  calls.push({path,method:options.method||'GET',body});
  assert.equal(route.searchParams.get('site_id'),'site-a');
  if(path.endsWith('/offers'))return response({ok:true,mode:'preview',offers});
  if(path==='/api/admin/cms/checkout-previews' && options.method==='POST'){
   assert.deepEqual(body,{customer_label:'customer123',offer_id:'starter'});
   preview={
    id:ID,site_id:'site-a',customer_label:body.customer_label,
    selected_offer_sku:body.offer_id,step:'start-trial',status:'draft',
    revision:1,journey:{offer:offers[0],goals:[],site_name:'InnerAnimal Media'}
   };
   return response({ok:true,mode:'preview',preview},201);
  }
  if(path.endsWith('/'+ID)&&options.method==='PATCH'){
   assert.equal(body.expected_revision,preview.revision);
   preview={...preview,step:body.step,revision:preview.revision+1,
    status:body.step==='first-run'?'completed':'draft',
    journey:{...preview.journey,
     ...(body.goals?{goals:body.goals}:{}),
     ...(body.site_name?{site_name:body.site_name}:{})}};
   return response({ok:true,mode:'preview',preview});
  }
  throw Error('Unexpected endpoint: '+path);
 };
 const button=text=>[...doc.querySelectorAll('.customer-preview button')].find(e=>e.textContent===text);
 try{
  w.eval(file);
  await until(()=>doc.querySelectorAll('.cp-offer').length===2);
  assert.equal(doc.querySelector('[data-checkout-mode]').dataset.checkoutMode,'preview');
  assert.match(doc.body.textContent,/Studio Starter/);
  assert.match(doc.body.textContent,/\$2,500\.00/);
  assert.equal(doc.querySelector('#cp-style-spec').hidden,true);
  button('Choose this plan').click();
  await until(()=>doc.querySelector('.cp-summary'));
  assert.match(doc.body.textContent,/No card details are collected/);
  assert.equal(doc.querySelectorAll('input[type="password"],input[autocomplete="cc-number"]').length,0);
  button('Continue without payment').click();
  await until(()=>doc.querySelectorAll('.cp-check').length>0);
  doc.querySelector('input[value="website"]').checked=true;
  doc.querySelector('input[value="branding"]').checked=true;
  button('Continue to setup').click();
  await until(()=>doc.querySelector('#cp-site-name'));
  doc.querySelector('#cp-site-name').value='customer123 website';
  doc.querySelector('form.cp-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>preview?.status==='completed' && doc.body.textContent.includes('No payment, paid subscription'));
  assert.equal(preview.journey.site_name,'customer123 website');
  assert.deepEqual(preview.journey.goals,['website','branding']);
  assert.match(doc.body.textContent,/No payment, paid subscription, real purchase/);
  assert.ok(calls.every(call=>call.path.startsWith('/api/admin/cms/checkout-previews')));
  assert.ok(!calls.some(call=>call.path.includes('/api/store/')||call.path.includes('stripe')));
  button('View style specification').click();
  assert.equal(doc.querySelector('#cp-style-spec').hidden,false);
  assert.ok(doc.querySelector('#cp-progress [aria-current="step"]'));
 }finally{w.close();}
});
