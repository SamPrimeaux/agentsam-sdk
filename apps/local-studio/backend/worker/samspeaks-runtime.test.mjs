import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSamSpeaksRequest } from '../../../../src/models/samspeaks-runtime.js';
const post=(op,body)=>new Request('https://studio.test/api/samspeaks/'+op,{method:'POST',body:JSON.stringify(body)});
const reply=parts=>Response.json({candidates:[{content:{parts}}]});
test('not connected, validation and unknown operation are truthful',async()=>{
  const fail=()=>assert.fail('provider must not be called');
  assert.equal((await handleSamSpeaksRequest(post('tts',{text:'Hello'}),{fetcher:fail})).status,503);
  assert.equal((await handleSamSpeaksRequest(post('tts',{}),{fetcher:fail})).status,400);
  assert.equal((await handleSamSpeaksRequest(post('unknown',{}),{fetcher:fail})).status,404);
  const health=await handleSamSpeaksRequest(new Request('https://studio.test/api/samspeaks/health'));
  assert.equal((await health.json()).hasApiKey,false);
});
test('dual speaker TTS preserves voice assignments and wraps provider PCM as WAV',async()=>{
  const response=await handleSamSpeaksRequest(post('tts',{mode:'dual',text:'Alex: Hello\nSam: Hi',voiceA:'Puck',voiceB:'Kore'}),{apiKey:'test-key',fetcher:async(url,init)=>{
    assert.equal(init.headers['x-goog-api-key'],'test-key');assert.ok(!url.includes('test-key'));
    const b=JSON.parse(init.body);
    assert.deepEqual(b.generationConfig.responseModalities,['AUDIO']);
    assert.deepEqual(b.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs.map(s=>s.speaker),['Alex','Sam']);
    return reply([{inlineData:{mimeType:'audio/L16;rate=24000',data:'AAAAAA=='}}]);
  }});
  assert.equal(response.status,200);
  const audio=await response.json();const b=Buffer.from(audio.audioBase64,'base64');
  assert.equal(audio.mimeType,'audio/wav');assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt32LE(24),24000);
  assert.equal(b.readUInt32LE(40),4);
});
test('script and image storyboard use provider response, not synthetic success',async()=>{
 const context={apiKey:'test-key',fetcher:async(_,init)=>{
   const payload=JSON.parse(init.body);
   if(payload.generationConfig.responseSchema){
     assert.ok(payload.contents[0].parts[0].inlineData);
     return reply([{text:JSON.stringify({movieTitle:'Test scene',beats:[{title:'Intro',script:'A scene'}]})}]);
   }
   return reply([{text:'A studio narration.'}]);
 }};
 assert.equal((await (await handleSamSpeaksRequest(post('script-assist',{}),context)).json()).script,'A studio narration.');
 const composition=await (await handleSamSpeaksRequest(post('compose',{prompt:'Scene',images:[{mimeType:'image/png',data:'AAAA'}]}),context)).json();
 assert.equal(composition.movieTitle,'Test scene');
});
test('provider model not found falls back, quota failure does not retry or leak credentials',async()=>{
 let calls=0;
 const response=await handleSamSpeaksRequest(post('script-assist',{}),{apiKey:'secret-do-not-log',fetcher:async()=>{
   calls++;return calls===1?new Response(null,{status:404}):reply([{text:'Success'}]);
 }});
 assert.equal(response.status,200);assert.equal(calls,2);
 calls=0;
 const quota=await handleSamSpeaksRequest(post('tts',{text:'Hello'}),{apiKey:'secret-do-not-log',fetcher:async()=>{calls++;return new Response('secret-do-not-log',{status:429});}});
 assert.equal(quota.status,429);assert.equal(calls,1);assert.ok(!(await quota.text()).includes('secret-do-not-log'));
});
