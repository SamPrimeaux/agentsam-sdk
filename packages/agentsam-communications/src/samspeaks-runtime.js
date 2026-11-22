// SamSpeaks provider operations shared by the local Express and hosted Worker adapters.
// No UI, credentials, Node APIs, or account state are owned by this module.
const VOICES = new Set(['Puck','Charon','Kore','Fenrir','Zephyr','Aoede','Leda','Orus','Callirrhoe','Autonoe','Sulafat','Enceladus','Gacrux','Despina','Umbriel']);
const MAX_BODY = 15 * 1024 * 1024;
const json = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'private, no-store'}});
const text = (value, fallback = '', max = 4000) => typeof value === 'string' ? value.trim().slice(0,max) : fallback;
const voice = (value, fallback) => VOICES.has(value) ? value : fallback;
const providerText = data => (data?.candidates?.[0]?.content?.parts || []).map(part=>part.text || '').join('').trim();
const schema = {
  type:'OBJECT', required:['movieTitle','beats'],
  properties:{movieTitle:{type:'STRING'},beats:{type:'ARRAY',items:{
    type:'OBJECT',required:['title','script','ttsMode','voiceName','voiceStyle','cameraShot','transitionType','mood','explodeAmount'],
    properties:Object.fromEntries(['title','script','ttsMode','voiceName','voiceStyle','cameraShot','transitionType','mood','explodeAmount'].map(key=>[key,{type:key==='explodeAmount'?'NUMBER':'STRING'}]))
  }}}
};
class ProviderError extends Error {
  constructor(status){super('SamSpeaks provider request failed.');this.status=status;}
}
async function generate(key, models, contents, generationConfig, systemInstruction, fetcher) {
  const payload = {contents:typeof contents==='string'?[{role:'user',parts:[{text:contents}]}]:contents,generationConfig};
  if(systemInstruction)payload.systemInstruction={parts:[{text:systemInstruction}]};
  for(const model of [...new Set(models.filter(Boolean))]){
    const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
      method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)
    });
    if(response.ok)return {data:await response.json(),model};
    // Only retry when the configured model does not exist; never repeat quota or credential failures.
    if(response.status===404 && model!==models.at(-1))continue;
    throw new ProviderError(response.status);
  }
  throw new ProviderError(404);
}
function audioOutput(part) {
  const mime=part.mimeType || 'audio/wav';
  if(!/^(audio\/(L16|pcm|raw))\b/i.test(mime))return {audioBase64:part.data,mimeType:mime};
  const rate=Number(mime.match(/rate=(\d+)/i)?.[1] || 24000);
  const raw=atob(part.data), bytes=new Uint8Array(44+raw.length), view=new DataView(bytes.buffer);
  const tag=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
  tag(0,'RIFF');view.setUint32(4,36+raw.length,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,raw.length,true);
  for(let i=0;i<raw.length;i++)bytes[44+i]=raw.charCodeAt(i);
  let binary='';for(let i=0;i<bytes.length;i+=0x4000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
  return {audioBase64:btoa(binary),mimeType:'audio/wav'};
}
export async function handleSamSpeaksRequest(request,{apiKey,ttsModel,textModel,fetcher=fetch}={}) {
  const operation=new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  if(!['health','tts','script-assist','compose'].includes(operation))return json({error:'not_found'},404);
  const ttsModels=[ttsModel || 'gemini-3.8-flash-tts','gemini-2.5-flash-preview-tts'];
  const textModels=[textModel || 'gemini-4-hydrogen','gemini-3.1-flash-lite','gemini-2.5-flash-lite'];
  if(operation==='health'){
    if(request.method!=='GET')return json({error:'method_not_allowed'},405);
    return json({ok:true,hasApiKey:Boolean(apiKey),ttsModel:ttsModels[0],provider:'gemini'});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(Number(request.headers.get('content-length'))>MAX_BODY)return json({error:'request_too_large'},413);
  let body;
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return json({error:'request_too_large'},413);
    body=JSON.parse(raw);
    if(!body || typeof body!=='object' || Array.isArray(body))throw new Error('invalid');
  }catch{return json({error:'invalid_json'},400);}
  if(operation==='tts' && (!text(body.text)||body.text.length>4000))return json({error:'Enter a script of 1–4000 characters.'},400);
  if(operation==='compose' && !text(body.prompt) && !(Array.isArray(body.images)&&body.images.length))return json({error:'Enter a movie prompt or add a reference image.'},400);
  if(!apiKey)return json({error:'Connect Gemini in Settings > Keys to use voice, script, and storyboard generation.',code:'gemini_not_connected'},503);
  try{
    if(operation==='tts'){
      const dual=body.mode==='dual';
      const speakerA=text(body.speakerA,'Alex',24)||'Alex';
      const speakerB=text(body.speakerB,'Sam',24)||'Sam';
      if(dual&&speakerA===speakerB)return json({error:'Speaker names must be distinct.'},400);
      const styleA=text(body.styleA,'',300),styleB=text(body.styleB,'',300),style=text(body.stylePrompt,'',300);
      let prompt=body.text.trim();
      const speechConfig=dual?{multiSpeakerVoiceConfig:{speakerVoiceConfigs:[
        {speaker:speakerA,voiceConfig:{prebuiltVoiceConfig:{voiceName:voice(body.voiceA,'Puck')}}},
        {speaker:speakerB,voiceConfig:{prebuiltVoiceConfig:{voiceName:voice(body.voiceB,'Kore')}}}
      ]}}:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice(body.voiceName,'Kore')}}};
      if(dual){
        const lines=prompt.split(/\r?\n+/).map(line=>line.trim()).filter(Boolean);
        prompt=lines.map((line,i)=>{
          const match=/^([^:]{1,23}):\s*(.+)$/.exec(line);
          const prefix=match?.[1]?.toLowerCase();
          const speaker=prefix===speakerA.toLowerCase()?speakerA:prefix===speakerB.toLowerCase()?speakerB:i%2?speakerB:speakerA;
          return speaker+': '+(match?.[2]||line);
        }).join('\n');
        if(styleA||styleB)prompt='Perform this dialogue with '+speakerA+' style: '+(styleA||'natural')+' and '+speakerB+' style: '+(styleB||'natural')+'. Read only the dialogue:\n'+prompt;
      }else if(style)prompt='Read the following text in this style: '+style+'. Read only the text:\n'+prompt;
      const {data,model}=await generate(apiKey,ttsModels,prompt,{responseModalities:['AUDIO'],speechConfig},null,fetcher);
      const part=data?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData;
      if(!part)return json({error:'Gemini returned no audio data.'},502);
      return json({...audioOutput(part),model});
    }
    if(operation==='script-assist'){
      const subject=text(body.subjectTitle,'Harmonic Astrolabe',150),description=text(body.subjectDescription,'a kinetic spatial sculpture',1200),topic=text(body.topic,'',1000);
      const prompt=body.mode==='dual'
        ? `Write a concise, lively 2-turn creative studio dialogue between Alex and Sam reacting to "${subject}" (${description}). ${topic?'Focus on: '+topic+'.':''} Format as two lines starting with "Alex: " and "Sam: ". Keep under 45 words total.`
        : `Write a vivid, cinematic 2-sentence studio showcase narration about "${subject}" (${description}). ${topic?'Focus on: '+topic+'.':''} Keep under 38 words total.`;
      const {data}=await generate(apiKey,textModels,prompt,{},'You are a creative director writing concise expressive voiceover scripts for a 3D XR design studio. Return only script text.',fetcher);
      const script=providerText(data);return script?json({script}):json({error:'No script text returned.'},502);
    }
    const parts=[];
    for(const img of (Array.isArray(body.images)?body.images.slice(0,4):[])){
      if(typeof img?.data!=='string'||!/^image\/(jpeg|png|webp|gif)$/.test(img.mimeType||''))return json({error:'Unsupported reference image.'},400);
      const base64=img.data.includes(',')?img.data.split(',')[1]:img.data;
      if(!base64||!/^[A-Za-z0-9+/=]+$/.test(base64))return json({error:'Invalid reference image.'},400);
      parts.push({inlineData:{mimeType:img.mimeType,data:base64}});
    }
    parts.push({text:[
      'Compose a 3–4 beat cinematic 3D guided movie walkthrough and audio storyboard for SamSpeaks.',
      'Centerpiece: '+text(body.subjectLabel,'Astrolabe',150)+'. Atmosphere: '+text(body.mood,'studio',30)+'.',
      'Creative brief: '+text(body.prompt,'Use the reference images.',4000),
      'Use any reference images in the narration, mood and camera direction.',
      'Each beat needs title, script of 1–2 spoken sentences under 35 words, ttsMode (single or dual), voiceName (one of '+[...VOICES].join(', ')+'), voiceStyle, cameraShot (establishing, hero, closeup, lowAngle, overhead, leftProp, rightProp), transitionType (glide, dolly, orbit, crane, cut), mood (studio, sunset, twilight, noir, dawn), explodeAmount (0–0.85).',
      'For dual narration use two lines prefixed Alex: and Sam:.'
    ].join('\n')});
    const {data}=await generate(apiKey,textModels,[{role:'user',parts}],{responseMimeType:'application/json',responseSchema:schema},'You are miniAgentSam, a 3D movie director. Return valid JSON matching the schema.',fetcher);
    const result=JSON.parse(providerText(data)||'{}');
    if(!Array.isArray(result.beats)||!result.beats.length)return json({error:'No storyboard returned.'},502);
    return json({movieTitle:result.movieTitle||'Untitled Spatial Story',beats:result.beats});
  }catch(error){
    const status=error instanceof ProviderError?error.status:0;
    return json({error:status===401||status===403?'Gemini credentials were rejected. Check Settings > Keys.':status===429?'Gemini quota exceeded. Try again later.':'SamSpeaks generation failed. Check the configured Gemini model and try again.',code:'samspeaks_provider_error'},status===429?429:502);
  }
}
