import type { Artboard, CanvasDocument, CanvasNode } from '../../../apps/local-studio/frontend/src/components/workbench/canvas/model';

export type InventoryItem = {
  id: string; name: string; kind: 'app'|'component'|'embed'|'integration'|'theme'; family: string;
  owner: string; source: string; detail?: string; route?: string; evidence?: string;
  preview?: string|null; version?: string|null; capabilities?: string[]; surfaces?: string[];
};
export type Review = {state?:'keep'|'refine'|'repair'|'retire'; note?:string; favorite?:boolean; updatedAt?:string};
export type Inventory = {schema:string;sourceRevision:string;generatedAt:string;authority:string;items:InventoryItem[];families:string[];counts:Record<string,number>};

const ink='#172033',muted='#52617A',surface='#F4F7FC',blue='#2563EB';
function node(id:string,name:string,text:string,x:number,y:number,width:number,height:number,style:CanvasNode['style']={}):CanvasNode{
 return {id,type:'text',name,text,x,y,width,height,style:{fontFamily:'Inter, system-ui, sans-serif',color:ink,fontSize:22,...style}};
}
function rect(id:string,name:string,x:number,y:number,width:number,height:number,color:string,children:CanvasNode[]=[]):CanvasNode{
 return {id,type:'frame',name,x,y,width,height,style:{backgroundColor:color,borderRadius:16},children};
}
const basicTokens={'--brand':'#2563EB','--brand-strong':'#1D4ED8','--ink':ink,'--muted':muted,'--surface':'#FFFFFF','--surface-soft':surface,'--border':'#DCE4F0','--success':'#15803D'};
function doc(name:string,brief:string,artboards:Artboard[],provenance:Record<string,unknown>):CanvasDocument {
 return {version:1,name,host:'design',brief,artboards,tokens:{...basicTokens},components:[],assets:[],dataRequirements:[],provenance};
}
export function itemDocument(item:InventoryItem,review?:Review):CanvasDocument {
 const tag=review?.state ? review.state.toUpperCase() : 'NOT REVIEWED';
 const board:Artboard={id:'artboard-item',name:item.name+' · review sheet',x:0,y:0,width:1260,height:840,background:'#FFFFFF',route:item.route,
 nodes:[
  rect('item-header','Review header',0,0,1260,220,'#EDF3FF',[
   node('item-eyebrow','Source type',item.kind.toUpperCase()+'   /   '+item.family.toUpperCase(),64,42,1135,27,{fontSize:17,fontWeight:600,color:blue}),
   node('item-title','Catalog item',item.name,64,94,1120,75,{fontSize:47,fontWeight:700}),
  ]),
  node('item-state','Review state','REVIEW  /  '+tag,64,267,1100,34,{fontSize:20,fontWeight:700,color:review?.state==='repair'?'#B45309':blue}),
  node('item-owner-label','Owner heading','OWNER / PACKAGE',64,345,440,30,{fontSize:17,fontWeight:650,color:muted}),
  node('item-owner','Owner',item.owner,64,384,1080,35,{fontSize:24,fontWeight:600}),
  node('item-source-label','Implementation heading','IMPLEMENTATION SOURCE',64,465,1100,25,{fontSize:17,fontWeight:650,color:muted}),
  node('item-source','Real source path',item.source,64,508,1130,78,{fontSize:22}),
  rect('item-meta-bg','Metadata area',56,635,1145,132,surface),
  node('item-details','Manifest and export evidence',(item.evidence||'Source declaration')+' · '+(item.route||item.detail||'No public route claimed'),76,665,1090,85,{fontSize:19}),
 ]};
 return doc(item.name+' · component review','Source-backed inventory entry. This artboard is a review sheet, not a screenshot or implementation of the UI.',[board],
 {catalogId:item.id,source:item.source,kind:item.kind,owner:item.owner,review:review||{},reviewOnly:true});
}
export function overviewDocument(items:InventoryItem[],families:string[],reviews:Record<string,Review>){
 const index=new Map<string,string>();
 const boards:Artboard[]=[];
 families.forEach((family,at)=>{
  const entries=items.filter(i=>i.family===family);
  const pages=Math.max(1,Math.ceil(entries.length/12));
  for(let page=0;page<pages;page++){
   const slice=entries.slice(page*12,(page+1)*12);
   const boardId='family-'+at+'-'+page;
   const nodes:CanvasNode[]=[
    rect(boardId+'-heading','Family header',0,0,960,150,'#EEF3FF',[
     node(boardId+'-head1','Category',family,36,37,860,56,{fontSize:35,fontWeight:700}),
     node(boardId+'-head2','Catalog count',entries.length+' source-backed records   ·   page '+(page+1)+' / '+pages,37,104,855,30,{fontSize:17,color:muted}),
    ])
   ];
   slice.forEach((entry,i)=>{
    const col=i%2,row=Math.floor(i/2),x=30+col*465,y=180+row*120;
    const identity=boardId+'-'+i;
    index.set(identity,entry.id);
    nodes.push(rect(identity+'-card','Inventory source record',x,y,440,102,'#F4F7FC'));
    nodes.push(node(identity,'Select '+entry.name,entry.name,x+20,y+16,404,40,{fontSize:18,fontWeight:600,color:ink}));
    nodes.push(node(identity+'-caption','Real source evidence',entry.kind.toUpperCase()+'  ·  '+(reviews[entry.id]?.state||'unreviewed'),x+20,y+61,405,28,{fontSize:14,color:muted}));
    index.set(identity+'-card',entry.id);
    index.set(identity+'-caption',entry.id);
   });
   boards.push({id:boardId,name:family+' / '+(page+1),width:960,height:930,x:(boards.length%3)*1010,y:Math.floor(boards.length/3)*1000,background:'#fff',nodes});
  }
 });
 return {document:doc('InnerAnimalMedia · Component Atlas',
  'Spatial source inventory. Select a record to open its real source and live surface; cards are metadata, not mockups.',
  boards,{catalog:'source-scan',reviewOnly:true}),nodeRefs:index};
}
/**
 * An independent authoring document using the real AgentSam Canvas model.
 * Artboards are deliberately blank, not simulated UI screenshots or a copy
 * of the CMS Theme Editor. Any future CMS publication is optional.
 */
export function themeStarter(item?:InventoryItem):CanvasDocument{
 const boards:Artboard[]=[
  {id:'theme-home-desktop',name:'Home · desktop',x:0,y:0,width:1440,height:900,background:'#FFFFFF',route:'/',nodes:[]},
  {id:'theme-home-mobile',name:'Home · mobile',x:1480,y:0,width:390,height:844,background:'#FFFFFF',route:'/',nodes:[]},
  {id:'theme-sections',name:'Reusable sections',x:1910,y:0,width:1440,height:900,background:'#F8FAFC',nodes:[]},
  {id:'theme-components',name:'Theme components',x:3390,y:0,width:1440,height:900,background:'#FFFFFF',nodes:[]},
 ];
 const title=item?item.name+' · theme canvas':'Untitled Theme Canvas';
 return {
  ...doc(title,
  'Independent visual authoring: desktop and mobile page artboards, reusable sections, and component studies. Draft freely; site publishing is optional.',
  boards,{...(item?{originSource:item.source,originId:item.id}:{}),authoring:'independent-theme-canvas',reviewOnly:false}),
  host:'design',
 };
}
