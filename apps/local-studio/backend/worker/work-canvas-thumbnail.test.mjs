import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCanvasThumbnailSvg} from './work-canvas-thumbnail.js';

const board=(overrides={})=>({id:'a',name:'Main',width:1200,height:800,background:'#ffffff',nodes:[],...overrides});
test('Canvas thumbnails are deterministic inert SVG from actual artboards, not HTML execution',()=>{
 assert.equal(renderCanvasThumbnailSvg({artboards:[]}),null);
 const original={artboards:[board({nodes:[
   {id:'title',type:'text',name:'Title',x:20,y:20,width:850,height:80,text:'Welcome <script>alert("x")</script> & more',style:{fontSize:50,color:'#212121'}},
   {id:'image',type:'image',name:'Background',x:20,y:120,width:400,height:260,src:'https://evil.example/foo',style:{background:'url(https://evil.example/foo)'}},
   {id:'html',type:'html',name:'Embedded iframe',x:20,y:400,width:400,height:250,sourceHtml:'<iframe src="https://evil.example"></iframe>'},
 ]})]};
 const svg=renderCanvasThumbnailSvg(original);
 assert.ok(svg);
 assert.match(svg,/width="512" height="320"/);
 assert.match(svg,/Welcome &lt;script&gt;/);
 assert.doesNotMatch(svg,/<script|<iframe|onerror=|onload=|url\(|https:\/\/evil/);
 assert.equal(svg,renderCanvasThumbnailSvg(original));
});
test('rendering remains bounded for many artboards or deeply nested nodes',()=>{
 const nested={id:'deep',type:'frame',name:'frame',x:0,y:0,width:30,height:30,children:[]};
 let child=nested;
 for(let i=0;i<40;i++){child.children=[{...child,id:'child-'+i,children:[]}];child=child.children[0];}
 const doc={artboards:Array.from({length:64},(_,i)=>board({id:'board-'+i,nodes:[nested]}))};
 const svg=renderCanvasThumbnailSvg(doc);
 assert.ok(svg);
 assert.ok(svg.length<100_000);
 assert.match(svg,/\+60/);
});


test('native creative Page, Document and Spreadsheet artifacts receive inert thumbnails',()=>{
 const artifacts=[
  {type:'page',name:'To-do List',data:{title:'To-do List',blocks:[{type:'task_list',items:[{text:'A task',checked:false}]}]}},
  {type:'document',name:'Project Brief',data:{title:'Project Brief',blocks:[{type:'heading',text:'Overview'},{type:'paragraph',text:'Describe the project.'}]}},
  {type:'spreadsheet',name:'Project Tracker',data:{activeSheetId:'sheet_a',sheets:[{id:'sheet_a',name:'Tracker',columns:[{label:'Task'},{label:'Status'}],rows:[{cells:{}}]}]}},
 ];
 for(const artifact of artifacts){
  const svg=renderCanvasThumbnailSvg({name:artifact.name,artboards:[],creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact}});
  assert.ok(svg);
  assert.match(svg,/width="512" height="320"/);
  assert.ok(svg.includes(artifact.data.title||artifact.name)||svg.includes('Tracker'));
  assert.doesNotMatch(svg,/<script|<iframe|onerror=|onload=/);
 }
});


test('native Slides and Design artifacts render representative editable content as multi-page previews',()=>{
 const slides=Array.from({length:5},(_,index)=>({
  id:'slide-'+index,name:index===0?'Cover':index===3?'Applications':'Slide '+index,
  background:index===0?'#101820':'#ffffff',
  objects:[
   {id:'title-'+index,type:'text',name:'Title',x:70,y:70,w:700,h:90,text:index===0?'Brand Guidelines':index===3?'Applications':'Section '+index,fontSize:52,color:index===0?'#ffffff':'#172033'},
   {id:'shape-'+index,type:'shape',name:'Accent',x:70,y:190,w:280,h:120,fill:'#123456',shape:'rect'},
   {id:'remote-image-'+index,type:'image',name:'Remote image',x:400,y:190,w:300,h:180,src:'https://evil.example/preview.png'},
  ],notes:'',comments:[],
 }));
 const svg=renderCanvasThumbnailSvg({name:'Brand Guidelines',creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact:{type:'slides',name:'Brand Guidelines',data:{slides}}}});
 assert.ok(svg);
 assert.match(svg,/Brand Guidelines/);
 assert.match(svg,/Applications/);
 assert.match(svg,/\+1/);
 assert.match(svg,/#123456/);
 assert.doesNotMatch(svg,/evil\.example|<script|<iframe|onerror=|onload=/);
});

test('native Design and Whiteboard artboards render CreativeObject geometry rather than blank legacy boards',()=>{
 for (const type of ['design','whiteboard']) {
  const svg=renderCanvasThumbnailSvg({name:'Canvas',creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact:{type,name:'Canvas',data:{artboards:[{
   id:'board',name:'Main',width:1200,height:900,background:'#f7f8fa',objects:[
    {id:'title',type:'text',name:'Title',x:80,y:70,w:760,h:100,text:'Real canvas artwork',fontSize:48,color:'#172033'},
    {id:'accent',type:'shape',name:'Accent',x:80,y:230,w:280,h:180,fill:'#25a783',shape:'rect'},
   ]
  }]}}}});
  assert.ok(svg);
  assert.match(svg,/Real canvas artwork/);
  assert.match(svg,/#25a783/);
  assert.doesNotMatch(svg,/<script|<iframe|onerror=|onload=/);
 }
});

test('native Design System and Code artifacts receive content-aware previews',()=>{
 const system=renderCanvasThumbnailSvg({name:'PrimeTech System',creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact:{type:'system',name:'PrimeTech System',data:{
  description:'A reusable identity system',
  colors:[{id:'primary',name:'Primary',value:'#123456'}],
  typography:[{id:'display',role:'Display',family:'Inter',size:42,weight:700}],
 }}}});
 assert.match(system,/PrimeTech System/);
 assert.match(system,/#123456/);
 assert.match(system,/Inter/);
 const code=renderCanvasThumbnailSvg({name:'Code Workspace',creativeWorkspace:{schema:'agentsam.creative-workspace.v1',artifact:{type:'code',name:'Code Workspace',data:{
  files:[{id:'main',name:'main.ts',content:'const answer = 42;\nexport default answer;'}],activeFileId:'main'
 }}}});
 assert.match(code,/main\.ts/);
 assert.match(code,/const answer = 42/);
 assert.doesNotMatch(code,/<script|<iframe|onerror=|onload=/);
});
