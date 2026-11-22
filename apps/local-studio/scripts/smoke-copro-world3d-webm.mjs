import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=[
 "import {createWorld3DRenderer} from './packages/copro-render/src/world3d.js';",
 "import {Input,BlobSource,WebMInputFormat,EncodedPacketSink} from 'mediabunny';",
 "window.renderProof=async()=>{",
 "const canvas=document.createElement('canvas'); canvas.width=96;canvas.height=64;",
 "const ctx=canvas.getContext('2d');let count=0;",
 "const project={schema:'copro.project.v1',id:'proof',tracks:[{id:'world',visible:true,clips:[{id:'clip',assetId:'scene',startUs:0,durationUs:500000,inUs:0,playbackRate:1,volume:1,metadata:{sourceKind:'samscene-timeline-cue',sceneCue:{kind:'scene-object',objectId:'scene'}}}]}]};",
 "const renderer=createWorld3DRenderer({canvas,applyFrame:()=>{ctx.fillStyle=count++%2?'#f80':'#068';ctx.fillRect(0,0,96,64)}});",
 "const result=await renderer.record(project,{frameRate:10});",
 "const bytes=new Uint8Array(await result.blob.arrayBuffer());",
 "const input=new Input({source:new BlobSource(result.blob),formats:[new WebMInputFormat()]});",
 "const tracks=await input.getVideoTracks();const duration=await input.computeDuration();",
 "let packetCount=0;let lastTimestamp=-1;for await(const packet of new EncodedPacketSink(tracks[0]).packets()){if(packet.timestamp<lastTimestamp)throw Error('timestamps_not_monotonic');lastTimestamp=packet.timestamp;packetCount++;}",
 "return {size:result.blob.size,frames:result.frameCount,mime:result.mimeType,magic:Array.from(bytes.slice(0,4)),tracks:tracks.length,packetCount,lastTimestamp,width:tracks[0]?.displayWidth,height:tracks[0]?.displayHeight,duration}};",
].join('\n');
const {outputFiles}=await build({stdin:{contents:source,sourcefile:'proof.js',resolveDir:root,loader:'js'},bundle:true,write:false,platform:'browser',format:'esm',target:'es2022'});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://copro-smoke.invalid/**',route=>route.fulfill({
  status:200,contentType:route.request().url().endsWith('/test.js')?'text/javascript':'text/html',
  body:route.request().url().endsWith('/test.js')?outputFiles[0].text:'<!doctype html><script type="module" src="/test.js"></script>'
 }));
 await page.goto('https://copro-smoke.invalid/',{waitUntil:'load'});
 await page.waitForFunction(()=>typeof window.renderProof==='function',{timeout:15000});
 const result=await page.evaluate(()=>window.renderProof());
 assert.deepEqual(result.magic,[26,69,223,163]);
 assert.equal(result.tracks,1);assert.equal(result.width,96);assert.equal(result.height,64);
 assert.equal(result.frames,5);assert.equal(result.packetCount,5);assert.equal(result.mime,'video/webm');assert.ok(result.duration>=.4&&result.duration<=.6);
 assert.ok(result.size>250, `unexpected small valid WebM: ${result.size} bytes`);assert.deepEqual(errors,[]);
 console.log('[copro-world3d-webm] PASS '+JSON.stringify(result));
}finally{await browser.close()}
