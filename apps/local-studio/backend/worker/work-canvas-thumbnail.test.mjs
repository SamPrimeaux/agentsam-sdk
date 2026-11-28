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
