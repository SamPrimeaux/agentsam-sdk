function setDevice(device){
  const wrap=document.querySelector('.preview-frame-wrap');
  if(!wrap)return;
  wrap.classList.toggle('mobile',device==='mobile');
  document.querySelectorAll('[data-device]').forEach(b=>b.classList.toggle('active',b.dataset.device===device));
}
function openUse(slug,name,features){
  const modal=document.getElementById('use-modal');
  if(!modal)return;
  modal.classList.add('open');
  modal.dataset.slug=slug;
  modal.dataset.name=name;
  modal.dataset.features=features||'';
  document.getElementById('modal-theme-name').textContent=name;
  document.getElementById('site-name').value=name+' project';
  document.getElementById('wizard-step-1').style.display='block';
  document.getElementById('wizard-step-2').style.display='none';
  document.getElementById('wizard-step-3').style.display='none';
  document.getElementById('continue-btn').style.display='inline-flex';
  document.getElementById('approve-btn').style.display='none';
  document.getElementById('done-btn').style.display='none';
}
function closeUse(){document.getElementById('use-modal')?.classList.remove('open')}
function toPlan(){
  const modal=document.getElementById('use-modal');
  const name=document.getElementById('site-name').value.trim()||'Untitled project';
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const feats=(modal.dataset.features||'').split('|').filter(Boolean);
  document.getElementById('wizard-step-1').style.display='none';
  document.getElementById('wizard-step-2').style.display='block';
  document.getElementById('plan-text').textContent=
`AgentSam plan (preview — no SDK writes)

REQUEST
  Use design: ${modal.dataset.slug}
  Working name: ${name}

INTENDED APP
  apps/${slug}

CAPABILITIES TO MAP
${feats.map(x=>'  • '+x).join('\n')||'  • (from theme manifest)'}

NEXT
  • sales / customization workflow if not yet installable
  • or normalize → flip preview.kind live + installable later

No repository changes have been made.`;
  document.getElementById('continue-btn').style.display='none';
  document.getElementById('approve-btn').style.display='inline-flex';
}
async function approvePlan(){
  const modal=document.getElementById('use-modal');
  const name=document.getElementById('site-name').value.trim()||'Untitled project';
  const res=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:modal.dataset.slug,name})});
  const data=await res.json();
  document.getElementById('wizard-step-2').style.display='none';
  document.getElementById('wizard-step-3').style.display='block';
  document.getElementById('receipt-id').textContent=data.receipt_id;
  document.getElementById('receipt-note').textContent=data.note;
  document.getElementById('approve-btn').style.display='none';
  document.getElementById('done-btn').style.display='inline-flex';
}
function filterCards(){
  const q=(document.getElementById('theme-search')?.value||'').toLowerCase();
  const cat=document.getElementById('category-filter')?.value||'all';
  document.querySelectorAll('.theme-card').forEach(card=>{
    const text=(card.dataset.search||'').toLowerCase();
    const okQ=!q||text.includes(q);
    const okC=cat==='all'||card.dataset.category===cat;
    card.style.display=(okQ&&okC)?'':'none';
  });
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeUse()});
