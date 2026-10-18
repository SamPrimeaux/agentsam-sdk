/** A shared capability menu for full-page and contextual composers. */
export function attachCapabilityMenu(input, { list, select }) {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'AgentSam capabilities');
  menu.hidden = true;
  Object.assign(menu.style, {position:'absolute',bottom:'100%',left:'0',right:'0',padding:'8px',background:'#211d2c',color:'#f6f2ff',border:'1px solid #746486',borderRadius:'14px',zIndex:'20',maxHeight:'220px',overflow:'auto'});
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
        const button=document.createElement('button'); button.type='button'; button.setAttribute('role','option'); button.textContent=item.label || item.id;
        Object.assign(button.style,{display:'block',width:'100%',textAlign:'left',padding:'9px',border:'0',borderRadius:'8px',background:'transparent',color:'inherit',cursor:'pointer'});
        button.onclick=()=>{select(item); const end=input.selectionStart; input.value=input.value.slice(0,end).replace(/@[\w-]*$/,`@${item.id} `)+input.value.slice(end); menu.hidden=true; input.focus();};
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
