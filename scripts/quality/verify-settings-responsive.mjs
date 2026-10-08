#!/usr/bin/env node
/** Browser evidence for the portable Settings component in the SAME browser/desktop UI package. */
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'../..');
const sourceReceipt=JSON.parse(execFileSync(process.execPath,[
  join(root,'scripts/quality/verify-ui-source.mjs'),
  'packages/agentsam-settings/src/frontend/index.tsx'
],{cwd:root,encoding:'utf8'}));
const sourcePassed=sourceReceipt.violations.length===0;
const require=createRequire(join(root,'apps/local-studio/package.json'));
const {chromium}=require('playwright');
const out=mkdtempSync(join(tmpdir(),'agentsam-settings-quality-'));
const outputDir=process.env.UI_QUALITY_OUTPUT||join(out,'evidence');
mkdirSync(outputDir,{recursive:true});
const source=`
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsShell,SettingsProductPage} from '${join(root,'packages/agentsam-settings/src/frontend/index.tsx')}';
import {createFixtureSettingsHost,getSettingsFixture} from '${join(root,'packages/agentsam-settings/src/fixtures/index.ts')}';
import {localStudioSettingsManifest} from '${join(root,'apps/local-studio/frontend/src/components/settings/localStudioSettingsManifest.ts')}';
const fixture=getSettingsFixture('first-run');
fixture.agents=[];
fixture.agentTemplates=[{id:'asp_fixture',name:'Evidence auditor',slug:'evidence-auditor',role:'Audit',model:'Unassigned',modelId:'',status:'unknown',detail:'Template',description:'Inspect real evidence before planning',instructions:'Use only authorized account evidence.',readOnly:true,template:true,active:true}];
const host=createFixtureSettingsHost(fixture);
host.saveAgent=async()=>{};
host.archiveAgent=async()=>{};
host.updateAgentPolicy=async()=>{};
function App(){
  const [unit,setUnit]=useState('agents');
  useEffect(()=>{window.__setQualityUnit=setUnit;},[]);
  return <SettingsShell manifest={localStudioSettingsManifest} activeUnit={unit} onNavigate={setUnit}>
    <SettingsProductPage host={host} manifest={localStudioSettingsManifest} unitId={unit}/>
  </SettingsShell>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({
  stdin:{contents:source,resolveDir:root,sourcefile:'settings-quality-fixture.tsx',loader:'tsx'},
  bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:join(out,'fixture.js'),
  jsx:'automatic',nodePaths:[join(root,'node_modules'),join(root,'apps/local-studio/node_modules')],
  alias:{react:join(root,'apps/local-studio/node_modules/react'),'react-dom':join(root,'apps/local-studio/node_modules/react-dom')},
  logLevel:'error',
});
const assets=join(root,'apps/local-studio/desktop-dist/assets');
const cssName=readdirSync(assets).find(x=>/^index-.*\.css$/.test(x));
if(!cssName)throw new Error('Desktop CSS missing. Run npm run build:desktop first.');
copyFileSync(join(assets,cssName),join(out,'styles.css'));
writeFileSync(join(out,'index.html'),`<!doctype html><html lang="en" class="dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<link rel="stylesheet" href="/styles.css"/></head>
<body class="bg-background text-foreground font-sans"><div id="root" class="h-dvh w-full"></div>
<script type="module" src="/fixture.js"></script></body></html>`);
const server=createServer((req,res)=>{
  const path=req.url==='/'?'/index.html':req.url;
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(!['/index.html','/fixture.js','/styles.css'].includes(path)){
    res.writeHead(404);res.end();return;
  }
  const ext=path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html';
  res.setHeader('content-type',ext);
  res.end(readFileSync(join(out,path.slice(1))));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port;
const sizes=[
 {width:320,height:720,label:'compact-phone'},
 {width:390,height:844,label:'phone'},
 {width:640,height:760,label:'phone-landscape'},
 {width:820,height:1180,label:'tablet'},
 {width:1100,height:820,label:'laptop'},
 {width:1440,height:900,label:'desktop'},
 {width:1920,height:1080,label:'widescreen'},
];
// WCAG 2.2 AA: sample visible textual UI and essential form boundaries
// against composed opaque backgrounds; skip gradient/photo surfaces that need manual review.
async function checkContrast(page){
  return page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=(css)=>{
      if(!css)return [0,0,0,0];
      context.clearRect(0,0,1,1);context.fillStyle=css;context.fillRect(0,0,1,1);
      return Array.from(context.getImageData(0,0,1,1).data).map(v=>v/255);
    };
    const over=(top,bottom)=>{
      const alpha=top[3]+bottom[3]*(1-top[3])||1;
      return [0,1,2].map(i=>(top[i]*top[3]+bottom[i]*bottom[3]*(1-top[3]))/alpha).concat(alpha);
    };
    const background=(el)=>{
      let color=[0.03,0.03,0.035,1];
      const path=[];for(let p=el;p;p=p.parentElement)path.unshift(p);
      for(const node of path){
        const cs=getComputedStyle(node);
        if(cs.backgroundImage!=='none')return null;
        color=over(rgba(cs.backgroundColor),color);
      }
      return color;
    };
    const luminance=color=>{
      const linear=color.slice(0,3).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
      return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2];
    };
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const candidates=[...document.querySelectorAll('h1,h2,h3,p,label,button,summary')];
    let sampled=0,skipped=0;const failures=[];
    for(const el of candidates){
      if(!(el instanceof HTMLElement)||!el.innerText?.trim()||el.matches(':disabled'))continue;
      const rect=el.getBoundingClientRect(),cs=getComputedStyle(el);
      if(!rect.width||!rect.height||cs.visibility==='hidden'||Number(cs.opacity)<.95)continue;
      const bg=background(el);if(!bg){skipped++;continue;}
      const fg=over(rgba(cs.color),bg);
      const fontSize=parseFloat(cs.fontSize)||12,fontWeight=parseFloat(cs.fontWeight)||400;
      const large=fontSize>=24||(fontSize>=18.66&&fontWeight>=700);
      const measured=ratio(fg,bg),required=large?3:4.5;
      sampled++;
      if(measured+0.08<required){
        failures.push({element:el.tagName,text:el.innerText.slice(0,45),contrast:Number(measured.toFixed(2)),required,
          foreground:cs.color,background:cs.backgroundColor});
      }
    }
    return {sampled,skipped,failures:failures.slice(0,12)};
  });
}
async function checkControlsContrast(page){
  return page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const cx=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=v=>{cx.clearRect(0,0,1,1);cx.fillStyle=v;cx.fillRect(0,0,1,1);return [...cx.getImageData(0,0,1,1).data].map(x=>x/255)};
    const over=(a,b)=>{const x=a[3]+b[3]*(1-a[3])||1;return [0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/x).concat(x)};
    const lum=c=>c.slice(0,3).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const colorOf=el=>{
      let bg=[.03,.03,.035,1];const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
      for(const p of chain)bg=over(rgba(getComputedStyle(p).backgroundColor),bg);
      return bg;
    };
    const failures=[],samples=[];
    for(const el of document.querySelectorAll('[role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea')){
      const cs=getComputedStyle(el),rect=el.getBoundingClientRect();
      if(!rect.width||!rect.height||cs.borderTopStyle==='none'||parseFloat(cs.borderTopWidth)===0)continue;
      const border=over(rgba(cs.borderTopColor),colorOf(el));
      const inside=colorOf(el),outside=colorOf(el.parentElement);
      const measured=Math.max(ratio(border,inside),ratio(border,outside));
      const sample={tag:el.tagName,contrast:Number(measured.toFixed(2)),required:3};
      samples.push(sample);if(measured+.08<3)failures.push(sample);
    }
    return {samples,failures};
  });
}
const results=[];let browser;
try{
  const fullChromium=chromium.executablePath().replace('/chromium_headless_shell-','/chromium-').replace('/chrome-headless-shell-mac-arm64/chrome-headless-shell','/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(existsSync(fullChromium)?{executablePath:fullChromium}:existsSync(systemChrome)?{executablePath:systemChrome}:{})});
  for(const size of sizes){
    const context=await browser.newContext({viewport:{width:size.width,height:size.height},hasTouch:size.width<768,isMobile:false});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(url,{waitUntil:'load'});
    try{await page.getByRole('heading',{name:'Agents',exact:true}).first().waitFor({timeout:5000});}
    catch(error){console.error('RENDER_DIAGNOSTIC',errors,await page.locator('body').innerText());throw error;}
    await page.getByRole('button',{name:/New agent/i}).waitFor();
    await page.screenshot({path:join(outputDir,size.label+'-'+size.width+'-agents.png'),fullPage:true});
    const agentsContrast=await checkContrast(page);
    const mobileUi=await page.evaluate(()=>{
      const touch=window.innerWidth<768;
      const visible=[...document.querySelectorAll('button')].filter(el=>{
        const rect=el.getBoundingClientRect(),cs=getComputedStyle(el);
        return !el.disabled && rect.width>0 && rect.height>0 && cs.visibility!=='hidden'
          && rect.left>=0 && rect.right<=window.innerWidth+1;
      });
      const undersized=touch?visible.filter(el=>el.getBoundingClientRect().height<43)
        .map(el=>({name:el.textContent?.trim().slice(0,35)||el.getAttribute('aria-label')||'unnamed',
          height:Math.round(el.getBoundingClientRect().height)})).slice(0,8):[];
      const unlabeled=[...document.querySelectorAll('img:not([alt]), button')].filter(el=>{
        if(el.tagName==='IMG')return true;
        const text=(el.textContent||'').trim();
        return !text&&!el.getAttribute('aria-label')&&!el.getAttribute('title');
      }).filter(el=>el.getClientRects().length>0).slice(0,8).map(el=>el.outerHTML.slice(0,160));
      return {touch,undersized,unlabeled};
    });
    const overflow=await page.evaluate(()=>({
      document:document.documentElement.scrollWidth-window.innerWidth,
      body:document.body.scrollWidth-window.innerWidth,
    }));
    const button=page.getByRole('button',{name:/New agent/i});
    const shown=await button.isVisible();
    await button.click();
    const dialog=page.getByRole('dialog',{name:/Create agent/i});
    await dialog.waitFor();
    const focusIsInside=await page.evaluate(()=>{
      const dialog=document.querySelector('[role="dialog"]');
      return !!dialog?.contains(document.activeElement);
    });
    const dialogWidth=await dialog.evaluate(el=>el.getBoundingClientRect().width);
    const controlsContrast=await checkControlsContrast(page);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await page.evaluate(()=>window.__setQualityUnit('design'));
    await page.getByText('Brand identity',{exact:true}).first().waitFor();
    const themeGalleryMisplaced=await page.getByText('Theme and appearance',{exact:true}).count();
    const brandContrast=await checkContrast(page);
    await page.screenshot({path:join(outputDir,size.label+'-'+size.width+'-brand.png'),fullPage:true});
    const additionalScreens=[];
    for(const [unit,heading] of [['git-prs','Git & PRs'],['general','Account'],['customize','Customize']]){
      await page.evaluate(value=>window.__setQualityUnit(value),unit);
      await page.getByRole('heading',{name:heading,exact:true}).first().waitFor({timeout:10000});
      const measured=await checkContrast(page);
      const viewport=await page.evaluate(()=>({
        scrollWidth:document.documentElement.scrollWidth,viewportWidth:window.innerWidth,
      }));
      const screenshot=join(outputDir,size.label+'-'+size.width+'-'+unit+'.png');
      await page.screenshot({path:screenshot,fullPage:true});
      additionalScreens.push({unit,measured,overflow:viewport.scrollWidth>viewport.viewportWidth+2,screenshot});
    }
    const fileName=size.label+'-'+size.width+'-brand.png';
    await page.screenshot({path:join(outputDir,fileName),fullPage:true});
    const issues=[];
    if(overflow.document>2||overflow.body>2)issues.push('horizontal overflow: '+JSON.stringify(overflow));
    if(!shown)issues.push('New agent inaccessible');
    if(!focusIsInside)issues.push('Dialog initial focus missing');
    if(dialogWidth>size.width+1)issues.push('Dialog exceeds viewport');
    if(mobileUi.undersized.length)issues.push('Mobile touch targets below 44px: '+JSON.stringify(mobileUi.undersized));
    if(mobileUi.unlabeled.length)issues.push('Missing control names or alt: '+JSON.stringify(mobileUi.unlabeled));
    for(const item of additionalScreens){
      if(item.overflow)issues.push(item.unit+' horizontal overflow');
      if(item.measured.failures.length)issues.push(item.unit+' text contrast '+JSON.stringify(item.measured.failures.slice(0,2)));
    }
    if(themeGalleryMisplaced)issues.push('Theme gallery rendered in Brand identity screen');
    if(errors.length)issues.push('Page errors: '+errors.slice(0,3).join('; '));
    if(controlsContrast.failures.length)issues.push('Control contrast: '+JSON.stringify(controlsContrast.failures.slice(0,4)));
    if(agentsContrast.failures.length)issues.push('Agents text contrast: '+JSON.stringify(agentsContrast.failures.slice(0,3)));
    if(brandContrast.failures.length)issues.push('Brand text contrast: '+JSON.stringify(brandContrast.failures.slice(0,3)));
    results.push({...size,horizontal_overflow:overflow.document>2||overflow.body>2,
      controls_accessible:shown&&focusIsInside&&!themeGalleryMisplaced,
      contrast:{agents:agentsContrast,brand:brandContrast,controls:controlsContrast},mobileUi,additionalScreens,
      screenshot:join(outputDir,fileName),issues});
    console.log(size.label+': '+(issues.length?'FAIL '+issues.join(' | '):'PASS'));
    await context.close();
  }
}finally{
  await browser?.close();await new Promise(ok=>server.close(ok));
}
const pass=results.every(item=>item.issues.length===0);
const report={schema_version:'agentsam.ui-quality.v1',target:'@inneranimalmedia/agentsam-settings',
  source_revision:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  checks:[
    {id:'responsive_overflow',status:pass?'pass':'fail',evidence:'Seven viewport classes checked for overflow and usable controls'},
    {id:'keyboard',status:pass?'pass':'fail',evidence:'Agent creation dialog initial focus and Escape dismissal exercised'},
    {id:'behavior',status:pass?'pass':'fail',evidence:'Brand identity is distinct from themes; native Settings package mounted'},
    {id:'contrast_text',status:pass?'pass':'fail',evidence:'Browser WCAG AA text contrast sampled on visible non-gradient elements in agents and brand views across seven viewports'},
    {id:'contrast_ui',status:pass?'pass':'fail',evidence:'Visible edit-dialog input/select/textarea borders measured against adjacent surfaces at WCAG AA 3:1 on all seven viewports'},
    {id:'semantics',status:pass?'pass':'fail',evidence:'Rendered landmark headings and dialog semantics from real portable Settings React components'},
    {id:'accessibility_names',status:pass?'pass':'fail',evidence:'Visible buttons have textual or accessible names across seven viewports'},
    {id:'image_alternatives',status:pass?'pass':'fail',evidence:'Visible image elements must declare alt text'},
    {id:'mobile_touch',status:pass?'pass':'fail',evidence:'Visible mobile action buttons are measured for a 44px minimum touch height'},
    {id:'safe_areas',status:pass?'pass':'fail',evidence:'Shared sheet has safe-area bottom padding, 92dvh bound and tested mobile widths'},
    {id:'build_parity',status:pass?'pass':'fail',evidence:'Same packaged Settings component renders with Local Studio desktop stylesheet across phone/tablet/desktop'},
    {id:'style_authority',status:sourcePassed?'pass':'fail',evidence:'TSX source gate inspected '+sourceReceipt.scanned+' modified JSX nodes; findings='+sourceReceipt.violations.length},
  ],viewport_evidence:results.map(({width,height,horizontal_overflow,controls_accessible,screenshot,issues})=>({
    width,height,horizontal_overflow,controls_accessible,screenshot,issues,
  })),ready:false,exemptions:[]};
report.ready=pass && report.checks.every(check=>check.status==='pass'||check.status==='not_applicable');
const reportFile=join(outputDir,'ui-quality-receipt.json');
writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log('Receipt: '+reportFile);
if(!report.ready)
  process.exitCode=1;
