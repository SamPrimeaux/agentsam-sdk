/** Verified Canvas document -> compact, inert SVG preview.
 * The preview is a visual index, never a substitute for the editable document.
 * No HTML, remote images, scripts, CSS urls or raw style declarations are emitted.
 */
const WIDTH=512,HEIGHT=320;
const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const color=(value,fallback)=>typeof value==='string' && /^#[\da-f]{3,8}$/i.test(value)?value:fallback;
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const n=value=>String(Math.round(value*100)/100);
function nodeSvg(node,x,y,scale,depth=0,counter={count:0}){
 if(!node||depth>6||counter.count++>180)return '';
 const left=x+finite(node.x)*scale,top=y+finite(node.y)*scale;
 const width=Math.max(0,finite(node.width))*scale,height=Math.max(0,finite(node.height))*scale;
 if(left>WIDTH+100||top>HEIGHT+100||left+width<0||top+height<0)return '';
 const background=color(node.style?.backgroundColor||node.style?.background,node.type==='frame'?'#e9edf2':node.type==='button'?'#b8c8e0':node.type==='image'?'#d7dce2':'#f3f5f7');
 const fg=color(node.style?.color,'#344054');
 let result='';
 if(node.type==='frame'||node.type==='button'||node.type==='input'||node.type==='link'||node.type==='image'||node.type==='html')
   result+=`<rect x="${n(left)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" rx="${n(Math.min(7*scale,5))}" fill="${background}"/>`;
 if(node.type==='image'&&width>8&&height>8){
   result+=`<path d="M${n(left+width*.2)} ${n(top+height*.72)} L${n(left+width*.42)} ${n(top+height*.4)} L${n(left+width*.57)} ${n(top+height*.55)} L${n(left+width*.76)} ${n(top+height*.3)} L${n(left+width*.9)} ${n(top+height*.72)}Z" fill="#b4becb"/>`;
 }
 if(node.type==='text'||node.type==='button'||node.type==='link'||node.type==='input'){
   const content=String(node.text||node.name||'').replace(/\s+/g,' ').slice(0,110);
   const fontSize=Math.max(3,Math.min(18,finite(node.style?.fontSize,19)*scale));
   const readable=Math.max(0,Math.floor(width/Math.max(3,fontSize*.56)));
   if(content&&readable>0&&height>=fontSize*.8){
     const clipped=content.length>readable?content.slice(0,Math.max(0,readable-1))+'…':content;
     result+=`<text x="${n(left+3*scale)}" y="${n(top+Math.min(height-fontSize*.2,fontSize+3*scale))}" fill="${fg}" font-family="Arial,sans-serif" font-size="${n(fontSize)}">${text(clipped)}</text>`;
   }
 }
 if(Array.isArray(node.children))for(const child of node.children)result+=nodeSvg(child,left,top,scale,depth+1,counter);
 return result;
}

export function renderCanvasThumbnailSvg(document){
 const creative=document?.creativeWorkspace?.artifact;
 if((!Array.isArray(document?.artboards)||!document.artboards.length)&&creative&&['page','document','spreadsheet'].includes(creative.type)){
  const title=text(creative.data?.title||creative.name||document.name||'Untitled');
  let content='';
  if(creative.type==='page'){
   const tasks=(creative.data?.blocks||[]).filter(block=>block?.type==='task_list').flatMap(block=>block.items||[]).slice(0,5);
   content+='<text x="44" y="76" font-size="24" font-weight="700" fill="#202938">'+title+'</text>';
   content+='<text x="44" y="102" font-size="10" letter-spacing="1.5" fill="#667085">PAGE / CHECKLIST</text>';
   for(let i=0;i<tasks.length;i++){
    const y=142+i*31;
    content+='<rect x="46" y="'+(y-11)+'" width="13" height="13" rx="3" fill="none" stroke="#98a2b3"/>';
    content+='<path d="M70 '+(y-4)+' H'+(i===0?330:390)+'" stroke="#d0d5dd" stroke-width="5" stroke-linecap="round"/>';
   }
   if(!tasks.length)for(let i=0;i<4;i++)content+='<path d="M46 '+(150+i*34)+' H'+(390-i*18)+'" stroke="#d0d5dd" stroke-width="5" stroke-linecap="round"/>';
  } else if(creative.type==='document'){
   const blocks=creative.data?.blocks||[];
   content+='<text x="44" y="76" font-size="24" font-weight="700" fill="#202938">'+title+'</text>';
   content+='<text x="44" y="102" font-size="10" letter-spacing="1.5" fill="#667085">DOCUMENT / SECTIONS</text>';
   let y=144;
   for(const block of blocks.slice(0,5)){
    if(block.type==='heading'){content+='<text x="46" y="'+y+'" font-size="13" font-weight="700" fill="#344054">'+text(block.text).slice(0,44)+'</text>';y+=16;}
    else {content+='<path d="M46 '+y+' H'+Math.min(440,46+Math.max(80,String(block.text||'').length*3))+'" stroke="#d0d5dd" stroke-width="4" stroke-linecap="round"/>';y+=20;}
   }
   if(!blocks.length)for(let i=0;i<5;i++)content+='<path d="M46 '+(146+i*26)+' H'+(410-i*24)+'" stroke="#d0d5dd" stroke-width="4" stroke-linecap="round"/>';
  } else {
   const sheet=creative.data?.sheets?.find(item=>item.id===creative.data.activeSheetId)||creative.data?.sheets?.[0];
   const columns=sheet?.columns||[],rows=sheet?.rows||[];
   content+='<text x="30" y="46" font-size="18" font-weight="700" fill="#202938">'+text(sheet?.name||title)+'</text>';
   const count=Math.min(6,columns.length),cellW=452/Math.max(1,count);
   for(let c=0;c<count;c++){
    const x=30+c*cellW;
    content+='<rect x="'+x+'" y="68" width="'+cellW+'" height="28" fill="#e8eef8" stroke="#cbd5e1"/>';
    content+='<text x="'+(x+6)+'" y="86" font-size="9" font-weight="700" fill="#344054">'+text(columns[c].label).slice(0,14)+'</text>';
   }
   for(let r=0;r<Math.min(5,rows.length);r++)for(let c=0;c<count;c++){
    const x=30+c*cellW,y=96+r*35;
    content+='<rect x="'+x+'" y="'+y+'" width="'+cellW+'" height="35" fill="#fff" stroke="#e4e7ec"/>';
   }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+WIDTH+'" height="'+HEIGHT+'" viewBox="0 0 '+WIDTH+' '+HEIGHT+'"><rect width="'+WIDTH+'" height="'+HEIGHT+'" rx="12" fill="#e7eaf0"/><rect x="18" y="18" width="476" height="284" rx="9" fill="#fff" stroke="#d5dae1"/>'+content+'</svg>';
 }
 if(!Array.isArray(document?.artboards)||!document.artboards.length)return null;
 const boards=document.artboards.slice(0,4);
 const columns=boards.length===1?1:2,rows=Math.ceil(boards.length/columns),gap=12,margin=16;
 const slotWidth=(WIDTH-2*margin-gap*(columns-1))/columns;
 const slotHeight=(HEIGHT-2*margin-gap*(rows-1))/rows;
 let content='';
 for(let i=0;i<boards.length;i++){
   const board=boards[i];
   const slotX=margin+(i%columns)*(slotWidth+gap),slotY=margin+Math.floor(i/columns)*(slotHeight+gap);
   const boardWidth=Math.max(1,finite(board.width,1)),boardHeight=Math.max(1,finite(board.height,1));
   const scale=Math.min((slotWidth-16)/boardWidth,(slotHeight-22)/boardHeight);
   const viewWidth=boardWidth*scale,viewHeight=boardHeight*scale;
   const left=slotX+(slotWidth-viewWidth)/2,top=slotY+(slotHeight-viewHeight)/2;
   const bg=color(board.background,'#fff');
   content+=`<rect x="${n(slotX)}" y="${n(slotY)}" width="${n(slotWidth)}" height="${n(slotHeight)}" rx="7" fill="#f5f6f8" stroke="#d5dae1"/>`;
   content+=`<svg x="${n(left)}" y="${n(top)}" width="${n(viewWidth)}" height="${n(viewHeight)}" viewBox="0 0 ${n(viewWidth)} ${n(viewHeight)}" overflow="hidden"><rect width="100%" height="100%" fill="${bg}"/>`;
   const counter={count:0};
   for(const node of Array.isArray(board.nodes)?board.nodes:[])content+=nodeSvg(node,0,0,scale,0,counter);
   content+='</svg>';
 }
 if(document.artboards.length>boards.length)content+=`<rect x="430" y="278" width="64" height="22" rx="11" fill="#344054"/><text x="462" y="293" text-anchor="middle" font-size="12" font-family="Arial,sans-serif" fill="white">+${document.artboards.length-boards.length}</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" rx="12" fill="#e7eaf0"/>${content}</svg>`;
}
