import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

// Local-only acceptance: uses an isolated Chrome profile and creates a temporary test project.
// It never publishes code or uses your normal browser profile.
const host=(process.env.PRIMETECH_QA_HOST || 'http://127.0.0.1:4549').replace(/\/$/,'');
const screenshotDir=process.env.PRIMETECH_QA_SCREENSHOTS || join(process.env.HOME || tmpdir(),'Downloads');

const dir=mkdtempSync(join(tmpdir(),'primetech-wave1-chrome-'));
const gpuMode=process.env.PRIMETECH_QA_GPU==="1";
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--no-sandbox',...(gpuMode?['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--disable-gpu']),'--disable-extensions',
  '--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  '--remote-allow-origins=*', '--window-size=1648,928','--user-data-dir='+dir,
  host+'/?studio=new',
],{stdio:'ignore'});
const pending=new Map();
const browserErrors=[];
let ws;
try {
  const portFile=join(dir,'DevToolsActivePort');
  for(let i=0;i<100&&!existsSync(portFile);i++) await sleep(100);
  if(!existsSync(portFile)) throw Error('Chrome did not open DevTools');
  const port=readFileSync(portFile,'utf8').split('\n')[0];
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const tab=tabs.find(t=>t.type==='page');
  if(!tab) throw Error('No Chrome page target');
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==="Runtime.exceptionThrown")browserErrors.push(msg.params.exceptionDetails?.text||"runtime exception");
    if(msg.method==="Runtime.consoleAPICalled"&&msg.params.type==="error")browserErrors.push(msg.params.args?.map(x=>x.value||x.description||"error").join(" ")||"console error");
    if(msg.id&&pending.has(msg.id)){
      const p=pending.get(msg.id);pending.delete(msg.id);
      msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);
    }
  };
  let id=0;
  function cmd(method,params={}){
    return new Promise((resolve,reject)=>{
      const next=++id;pending.set(next,{resolve,reject});
      ws.send(JSON.stringify({id:next,method,params}));
      setTimeout(()=>{if(pending.has(next)){pending.delete(next);reject(Error(method+' timeout'));}},6000);
    });
  }
  async function evaluate(expression){
    const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  }
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  const measure=`(()=>{
    const rect=(q)=>{const e=document.querySelector(q);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}};
    const nav=document.querySelector('.mm-tools-scroll');
    return {viewport:{width:innerWidth,height:innerHeight},mode:document.querySelector('.copro-studio')?.dataset.studioMode,
      modeBar:rect('.mm-studio-modes'),globalToolbar:rect('.mm-studio-commandbar'),
      categories:rect('.mm-editor-categories'),browser:rect('#copro-tool-browser'),
      player:rect('.mm-player-pane'),timeline:rect('.copro-timeline-shell'),
      categoryCount:document.querySelectorAll('.mm-tools-scroll>button').length,
      navScroll:{client:nav?.clientWidth,full:nav?.scrollWidth},
      categoryLabels:[...document.querySelectorAll('.mm-tools-scroll>button')].map(e=>e.textContent?.trim()),
      browserTitle:document.querySelector('.mm-browser-top')?.textContent?.trim(),
      modeButtons:document.querySelectorAll('.mm-studio-modes button').length
    };
  })()`;
  for(let i=0;i<45;i++){if(await evaluate('Boolean(document.querySelector(".mm-studio-modes"))'))break;await sleep(160);}
  const desktop=await evaluate(measure);
  const shellShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(screenshotDir,'PrimeTech-wave1-shell.png'),Buffer.from(shellShot.data,'base64'));
  const click=await evaluate('(()=>{const b=[...document.querySelectorAll(".mm-studio-modes button")].find(x=>x.textContent.includes("Generate")); if(!b)return false;b.click();return true})()');
  await sleep(250);
  const afterClick=await evaluate(measure);
  await sleep(400);
  const localModelCount=await evaluate('document.querySelectorAll(".mm-model-gallery-card").length');
  const localModelNames=await evaluate('[...document.querySelectorAll(".mm-model-gallery-card strong")].map(x=>x.textContent)');
  const clickedModel=await evaluate('(()=>{const button=[...document.querySelectorAll(".mm-model-gallery-card button")].find(b=>b.textContent.includes("Import into project"));if(!button)return false;button.click();return true;})()');
  for(let i=0;i<30;i++){
    if(await evaluate('document.querySelectorAll("[data-copro-clip]").length > 0'))break;
    await sleep(180);
  }
  const importedClipCount=await evaluate('document.querySelectorAll("[data-copro-clip]").length');
  const importError=await evaluate('document.querySelector(".copro-source-storage-warning")?.textContent||null');
  const postImport=await evaluate('({url:location.href,rootLength:document.querySelector("#root")?.innerHTML.length,body:document.body.innerText.slice(-500),mode:document.querySelector(".copro-studio")?.dataset.studioMode,clipCount:document.querySelectorAll("[data-copro-clip]").length,loading:document.querySelectorAll(".mm-model-gallery-card button:disabled").length})');
  const objectInspector=await evaluate(`({name:document.querySelector(".mm-inspector-dock-header strong")?.textContent,tool:document.querySelector("#copro-tool-inspector")?.dataset.inspectorTool,fields:[...document.querySelectorAll(".mm-world3d-axis>span")].map(x=>x.textContent),visibility:!!document.querySelector('[aria-label="3D object visible"]')})`);
  // Simulate a real user change event on the existing scene-space Z coordinate.
  const editedZ=await evaluate(`(()=>{
    const input=document.querySelector('input[aria-label="Z world3d"]');
    if(!input)return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1.25');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`);
  await sleep(350);
  const zInInspector=await evaluate(`document.querySelector('input[aria-label="Z world3d"]')?.value`);
  const skyTabOpened=await evaluate(`(()=>{
    const b=[...document.querySelectorAll('.mm-selection-tabs button')].find(el=>el.textContent.trim()==='Scene look');
    if(!b)return false;b.click();return true;
  })()`);
  await sleep(180);
  const singleSceneInspector=await evaluate(`({tool:document.querySelector('#copro-tool-inspector')?.dataset.inspectorTool,
    right:!!document.querySelector('#copro-tool-inspector .mm-stage-look'),
    duplicateLeft:!!document.querySelector('#copro-tool-browser .mm-stage-look')})`);
  const environmentTabOpened=await evaluate(`(()=>{
    const b=[...document.querySelectorAll('.mm-scene-tabs button')].find(el=>el.textContent.includes('Environment'));
    if(!b)return false;b.click();return true;
  })()`);
  await sleep(100);
  const skySliderLabels=await evaluate(`[...document.querySelectorAll('.mm-look-sky-controls input[type="range"]')].map(el=>el.getAttribute('aria-label'))`);
  const changedGalaxy=await evaluate(`(()=>{
    const input=document.querySelector('input[aria-label="Galaxy & nebula"]');
    if(!input)return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.72');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`);
  await sleep(350);
  const galaxyAfterChange=await evaluate(`document.querySelector('input[aria-label="Galaxy & nebula"]')?.value`);
  const liveSkyState=await evaluate('({webgl:document.querySelector("[data-world3d-scene]")?.dataset.world3dScene,canvas:!!document.querySelector(".mm-world3d-player canvas")})');
  const localProjectState=await evaluate('({keyCount:localStorage.length,matchingKeys:[...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).filter(k=>k.includes("copro.project")).slice(0,4)})');
  await sleep(500);
  await cmd('Page.reload',{ignoreCache:true});
  // Page.reload can resolve before the old React tree is replaced. Wait for the
  // restored clip, not merely an element that may belong to the previous page.
  await sleep(500);
  for(let i=0;i<45;i++){
    if(await evaluate('Boolean(document.querySelector(".copro-studio") && document.querySelectorAll("[data-copro-clip]").length>0)'))break;
    await sleep(170);
  }
  const afterReload=await evaluate(`({url:location.href,mode:document.querySelector(".copro-studio")?.dataset.studioMode,clipCount:document.querySelectorAll("[data-copro-clip]").length,rootLength:document.querySelector("#root")?.innerHTML.length,worldState:document.querySelector("[data-world3d-scene]")?.dataset.world3dScene,z:document.querySelector('input[aria-label="Z world3d"]')?.value,project:document.querySelector(".copro-title-block strong")?.textContent})`);
  const restoredSkyPanel=await evaluate(`(()=>{
    const b=[...document.querySelectorAll('.mm-selection-tabs button')].find(el=>el.textContent.trim()==='Scene look');
    if(!b)return false;b.click();return true;
  })()`);
  await sleep(150);
  await evaluate(`[...document.querySelectorAll('.mm-scene-tabs button')].find(el=>el.textContent.includes('Environment'))?.click()`);
  await sleep(100);
  const galaxyAfterReload=await evaluate(`document.querySelector('input[aria-label="Galaxy & nebula"]')?.value`);
  const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(screenshotDir,'PrimeTech-wave1-webgl-fallback.png'),Buffer.from(shot.data,'base64'));
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const mobile=await evaluate(measure);
  const mobileSceneClicked=await evaluate('(()=>{const b=[...document.querySelectorAll(".mm-studio-modes button")].find(x=>x.textContent.includes("3D Scene"));if(!b)return false;b.click();return true})()');
  await sleep(220);
  const mobileScene=await evaluate(measure);
  const savedProjectUrl=await evaluate('location.href');
  const tourHref=await evaluate('document.querySelector(".mm-studio-tour-trigger")?.href');
  const tourClicked=await evaluate('(()=>{const a=document.querySelector(".mm-studio-tour-trigger");if(!a)return false;a.click();return true})()');
  await sleep(600);
  for(let i=0;i<35;i++){if(await evaluate('document.body?.dataset?.view==="tour"'))break;await sleep(160);}
  const realTour=await evaluate('({url:location.href,active:document.body.dataset.view,hero:!!document.querySelector("#hero"),enter:!!document.querySelector("[data-enter]")})');
  const tourShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(screenshotDir,'PrimeTech-wave1-real-3d-tour.png'),Buffer.from(tourShot.data,'base64'));
  const resumeClicked=await evaluate('(()=>{const b=document.querySelector("[data-enter]");if(!b)return false;b.click();return true})()');
  await sleep(550);
  for(let i=0;i<45;i++){if(await evaluate('Boolean(document.querySelector(".copro-studio"))'))break;await sleep(170);}
  const resumedProject=await evaluate('({url:location.href,clipCount:document.querySelectorAll("[data-copro-clip]").length})');
  const mobileShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(screenshotDir,'PrimeTech-wave1-mobile.png'),Buffer.from(mobileShot.data,'base64'));
  // The same four modes must be reachable from the single PrimeTech home.
  await evaluate(`document.querySelector('[aria-label="Back to projects"]')?.click()`);
  for(let i=0;i<45;i++){if(await evaluate('Boolean(document.querySelector(".mm-prime-home-actions"))'))break;await sleep(140);}
  const homeLauncherLabels=await evaluate('[...document.querySelectorAll(".mm-prime-home-actions button strong")].map(x=>x.textContent)');
  const homeGenerateClicked=await evaluate('(()=>{const button=[...document.querySelectorAll(".mm-prime-home-actions button")].find(x=>x.textContent.includes("Generate"));if(!button)return false;button.click();return true;})()');
  for(let i=0;i<45;i++){if(await evaluate(`Boolean(document.querySelector('.copro-studio[data-studio-mode="generate"]'))`))break;await sleep(160);}
  const homeLaunch=await evaluate('({mode:document.querySelector(".copro-studio")?.dataset.studioMode,project:document.querySelector(".copro-title-block strong")?.textContent,url:location.href})');
  const checks={
    desktopFullWidthCategories:desktop.categoryCount>=11 && desktop.categories?.x>=desktop.modeBar?.width && desktop.navScroll?.full<=desktop.navScroll?.client,
    projectModeChangeInPlace:click && afterClick.mode==='generate' && afterClick.browserTitle?.startsWith('Models'),
    realSceneInventory:localModelCount>=5 && localModelNames.includes('primetech-hero-chamber.glb'),
    modelInEditableTimeline:clickedModel && importedClipCount>=1 && !importError && postImport.rootLength>0,
    importedModelHasEditableInspector:objectInspector.tool==='world3d' && objectInspector.name==='3D object' && objectInspector.fields.includes('X') && objectInspector.fields.includes('Y') && objectInspector.fields.includes('Z') && objectInspector.visibility,
    skyEnvironmentHasOneRealInspector:skyTabOpened&&singleSceneInspector.tool==='stage'&&singleSceneInspector.right&&!singleSceneInspector.duplicateLeft&&environmentTabOpened,
    samSceneSkyControlsPersist:skySliderLabels.includes('Sky time / phase')&&skySliderLabels.includes('Galaxy & nebula')&&skySliderLabels.includes('Polar aurora')&&changedGalaxy&&galaxyAfterChange==='0.72'&&restoredSkyPanel&&galaxyAfterReload==='0.72',
    projectSurvivesReload:afterReload.clipCount>=1 && afterReload.mode==='generate' && afterReload.rootLength>0,
    mobileSharedWorkspace:mobile.globalToolbar?.width===390 && mobileSceneClicked && mobileScene.browser?.width===390 && mobileScene.timeline?.width===390,
    spatialEditSurvivesReload:editedZ && zInInspector==='1.25' && afterReload.z==='1.25',
    immersiveTourReturnsToProject:tourClicked && Boolean(tourHref) && realTour.active==='tour' && realTour.hero && resumeClicked && resumedProject.url===savedProjectUrl && resumedProject.clipCount>=1,
    homeOpensSharedStudio:homeLauncherLabels.join('|')==='Video|3D Scene|Design|Generate' && homeGenerateClicked && homeLaunch.mode==='generate' && homeLaunch.url.includes('project='),
  };
  console.log(JSON.stringify({checks,desktop,clickedGenerate:click,afterClick,localModelCount,localModelNames,clickedModel,importedClipCount,importError,postImport,objectInspector,editedZ,zInInspector,skyTabOpened,singleSceneInspector,environmentTabOpened,skySliderLabels,changedGalaxy,galaxyAfterChange,galaxyAfterReload,liveSkyState,localProjectState,afterReload,browserErrors,mobile,mobileSceneClicked,mobileScene,tourClicked,tourHref,realTour,resumeClicked,resumedProject,homeLauncherLabels,homeGenerateClicked,homeLaunch},null,2));
  if(Object.values(checks).some(ok=>!ok))throw Error('PrimeTech visual acceptance failed: '+Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k).join(', '));
} catch(error) {
  console.error('BROWSER_QA_ERROR',String(error?.stack??error));
  process.exitCode=1;
} finally {
  try{ws?.close()}catch{}
  chrome.kill('SIGTERM');
  await sleep(250);
  try{rmSync(dir,{recursive:true,force:true})}catch{}
}
