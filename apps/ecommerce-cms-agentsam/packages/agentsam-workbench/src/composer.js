/** A shared capability menu for full-page and contextual composers. */
export function attachCapabilityMenu(input, { list, select }) {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'AgentSam capabilities');
  menu.hidden = true;
  Object.assign(menu.style, {position:'absolute',bottom:'calc(100% + 8px)',left:'0',right:'0',padding:'8px',background:'color-mix(in srgb, var(--mini-surface, var(--nav-popover, var(--card, #292929))) 94%, transparent)',color:'var(--mini-text, var(--nav-text, var(--foreground, #f5f5f5)))',border:'1px solid var(--mini-border, var(--nav-border, var(--border, #ffffff26)))',borderRadius:'20px',zIndex:'20',maxHeight:'min(300px, 40dvh)',overflow:'auto',backdropFilter:'blur(24px) saturate(125%)',boxShadow:'0 12px 36px #0004'});
  input.parentElement.append(menu);
  let revision = 0;
  async function update() {
    const current = ++revision;
    const match = input.value.slice(0,input.selectionStart).match(/(?:^|\s)@([\w-]*)$/);
    if (!match) {menu.hidden=true;return;}
    try {
      const items = await list();
      if (current!==revision) return;
      menu.replaceChildren();
      for (const item of items.filter(i => (i.label || i.id).toLowerCase().includes(match[1].toLowerCase()))) {
        const button=document.createElement('button'); button.type='button'; button.setAttribute('role','option');
        button.disabled=item.ready===false;
        Object.assign(button.style,{display:'flex',alignItems:'center',gap:'10px',width:'100%',minHeight:'44px',textAlign:'left',justifyContent:'flex-start',padding:'8px 10px',border:'0',borderRadius:'12px',color:'inherit',cursor:'pointer'});
        const dark = document.documentElement.matches('[data-theme="dark"],.dark');
        const imageUrl = (dark ? item.iconDarkUrl || item.icon_dark_url : null) || item.iconUrl || item.icon_url;
        if (imageUrl) {
          try {
            const url=new URL(imageUrl,document.baseURI);
            if (['https:','http:'].includes(url.protocol)) {
              const img=document.createElement('img'); img.src=url.href; img.alt=''; img.width=24; img.height=24; img.style.objectFit='contain'; img.addEventListener('error',()=>img.remove(),{once:true}); button.append(img);
            }
          } catch { /* No untrusted URL or replacement glyph. */ }
        }
        const label=document.createElement('span'); label.textContent=item.label || item.id; label.style.flex='1'; button.append(label);
        if (item.kind || item.status) { const meta=document.createElement('small'); meta.textContent=item.ready===false?(item.status||'Unavailable'):(item.kind||item.status); meta.style.opacity='.65'; button.append(meta); }
        button.onclick=()=>{if(button.disabled)return;select(item); const end=input.selectionStart; const token=item.mention || '@'+item.id; input.value=input.value.slice(0,end).replace(/@[\w-]*$/,token+' ')+input.value.slice(end); menu.hidden=true; input.focus();};
        menu.append(button);
      }
      if(!menu.childElementCount) menu.textContent='No connected capabilities';
      menu.hidden=false;
    } catch {menu.textContent='Capabilities unavailable';menu.hidden=false;}
  }
  function keydown(e) {
    if(e.key==='Escape') menu.hidden=true;
    if(e.key==='ArrowDown'&&!menu.hidden){e.preventDefault();menu.querySelector('button')?.focus();}
  }
  input.addEventListener('input',update); input.addEventListener('keydown',keydown);
  return ()=>{revision++;input.removeEventListener('input',update);input.removeEventListener('keydown',keydown);menu.remove();};
}

export function createAttachmentController({upload,maxFiles=6,maxBytes=10*1024*1024}) {
  let items=[];
  return {
    get items(){return [...items];},
    async add(files){
      if(items.length+files.length>maxFiles)throw new Error(`Choose up to ${maxFiles} attachments`);
      for(const file of files){if(file.size>maxBytes)throw new Error('Attachment is too large'); items.push(await upload(file));}
      return [...items];
    },
    remove(id){items=items.filter(i=>i.id!==id&&i.attachment_id!==id);},
    clear(){items=[];}
  };
}
