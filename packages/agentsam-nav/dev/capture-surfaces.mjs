/*
 * Capture ACTUAL rendered UI from packaged components or public first-party pages.
 * Unauthenticated/private app routes never become falsely labeled screenshots.
 * Run after preview:components, with an existing static server on 4176.
 */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(fileURLToPath(new URL('../../../apps/local-studio/package.json',import.meta.url)));
const {chromium}=require('playwright');
const folder=join(cwd,'.generated','surface-previews');
await mkdir(folder,{recursive:true});
const manifest={schema:'agentsam.visual-captures.v1',capturedAt:new Date().toISOString(),items:[]};
const record=(name,group,owner,source,url,slug,status,detail='')=>manifest.items.push({
  id:'visual:'+slug,name,group,owner,source,url,status,detail,capturedAt:new Date().toISOString(),
  image:status==='captured'?'/dev/.generated/surface-previews/'+slug+'.png':null,
});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
let page=await ctx.newPage();
try{
  await page.goto('http://127.0.0.1:4176/dev/',{waitUntil:'networkidle',timeout:18000});
  await page.getByRole('button',{name:'Live component lab',exact:true}).first().click();
  await page.getByRole('heading',{name:'Packaged components'}).waitFor();
  await page.getByRole('button',{name:'Disabled: true'}).click().catch(()=>{});
  await page.locator('.preview-composer').screenshot({path:join(folder,'chat-composer.png')});
  record('Chat composer','Chat & Work','agentsam-workbench','packages/agentsam-workbench/src/agent/Composer.tsx','/dev/','chat-composer','captured','Real AgentComposer rendered in dev component lab · Chat mode');
  await page.getByRole('button',{name:'Mode: chat'}).click();
  await page.locator('.preview-composer').screenshot({path:join(folder,'work-composer.png')});
  record('Work composer','Chat & Work','agentsam-workbench','packages/agentsam-workbench/src/agent/Composer.tsx','/dev/','work-composer','captured','Same packaged composer, Work mode with extended options');
  await page.getByRole('button',{name:'Conversation options'}).click();
  await page.getByRole('menuitem',{name:'Rename'}).waitFor();
  await page.screenshot({path:join(folder,'conversation-actions.png'),clip:{x:725,y:84,width:710,height:585}});
  record('Conversation actions','Chat & Work','agentsam-nav','packages/agentsam-nav/src/Nav.tsx','/dev/','conversation-actions','captured','Actual typed Nav conversation actions dropdown');
  await page.keyboard.press('Escape');
  const pinned=page.getByRole('button',{name:/pinned summary/i});
  if(await pinned.count()){
    await pinned.first().click();await page.screenshot({path:join(folder,'pinned-summary.png'),clip:{x:720,y:84,width:710,height:580}});
    record('Outputs and sources','Chat & Work','agentsam-nav','packages/agentsam-nav/src/Nav.tsx','/dev/','pinned-summary','captured','Actual NavPinnedSummary component');
  }else record('Outputs and sources','Chat & Work','agentsam-nav','packages/agentsam-nav/src/Nav.tsx','/dev/','pinned-summary','unavailable','Pinned summary trigger not found during capture');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Tools and attachments'}).click();
  if(await page.getByRole('menu').count()){
    await page.screenshot({path:join(folder,'attachments-menu.png'),clip:{x:330,y:320,width:810,height:610}});
    record('Attachments and tools menu','Chat & Work','agentsam-nav','packages/agentsam-nav/src/Nav.tsx','/dev/','attachments-menu','captured','Real Nav.OverflowMenu with nested actions');
  }
}catch(error){
 console.log('Component capture incomplete:',error.message);
}finally{await page.close();}
if(process.env.COMPONENTS_ONLY==='1') { await browser.close(); await writeFile(join(folder,'component-manifest.json'),JSON.stringify(manifest,null,2)+'\n'); console.log('COMPONENT CAPTURES',manifest.items.map(x=>x.id+' '+x.status).join(' | '));process.exit(0);}
const publicPages=[
 {name:'AgentSam — public site',slug:'agentsam-public',group:'Products & Apps',owner:'local-studio',source:'apps/local-studio',url:'https://agentsam.inneranimalmedia.com/'},
 {name:'CAD Creator — public preview',slug:'cad-public',group:'Products & Apps',owner:'cad-creator',source:'apps/cad-creator',url:'https://cad.inneranimalmedia.com/#aspiration'},
 {name:'InnerAnimalMedia — website',slug:'inneranimal-public',group:'Commerce & Themes',owner:'inneranimalmedia',source:'apps/ecommerce-cms-agentsam',url:'https://inneranimalmedia.com/'},
 {name:'Theme packages — public preview',slug:'themes-public',group:'Commerce & Themes',owner:'ecommerce-cms-agentsam',source:'apps/ecommerce-cms-agentsam/frontend',url:'https://themes.inneranimalmedia.com/'},
 {name:'Growth — authenticated SPA',slug:'growth-app',group:'Products & Apps',owner:'ecommerce-cms-agentsam',source:'apps/ecommerce-cms-agentsam/apps/growth/agentsam.app.json',url:'https://agentsam.inneranimalmedia.com/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fgrowth'},
 {name:'SamSketch — authenticated editor',slug:'samsketch-app',group:'Products & Apps',owner:'samsketch',source:'apps/samsketch/agentsam.app.json',url:'https://agentsam.inneranimalmedia.com/samsketch'},
 {name:'MovieMode — authenticated workspace',slug:'moviemode-app',group:'Products & Apps',owner:'agentsam-copro-studio',source:'apps/agentsam-copro-studio/agentsam.app.json',url:'https://agentsam.inneranimalmedia.com/admin/moviemode'},
];
for(const item of publicPages){
 page=await ctx.newPage();
 try{
  const res=await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:12000});
  await page.waitForTimeout(1500);
  const destination=page.url();
  const html=await page.locator('body').innerText().catch(()=>'');
  const blocked=/\/auth\/login|sign\s?in\s+to|authorization required/i.test(destination)||(/Sign in/i.test(html.slice(0,400))&&html.length<1600);
  if(blocked){record(item.name,item.group,item.owner,item.source,item.url,item.slug,'auth-required','Authenticated application — no screenshot available without account session');continue;}
  if(!res || !res.ok()){record(item.name,item.group,item.owner,item.source,item.url,item.slug,'unavailable','HTTP '+(res?.status()||'?'));continue;}
  await page.screenshot({path:join(folder,item.slug+'.png')});
  record(item.name,item.group,item.owner,item.source,item.url,item.slug,'captured','Public first-party page rendered from '+destination+' · not an authenticated editor');
 }catch(error){record(item.name,item.group,item.owner,item.source,item.url,item.slug,'unavailable',String(error.message).slice(0,200));}
 finally{await page.close();}
}
await browser.close();
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('CAPTURE MANIFEST',manifest.items.map(x=>x.slug+' '+x.status).join(' | '));
