/* Native five-step customer123 checkout preview; no payment or account creation.
 * Every actual decision is persisted to site- and account-scoped D1 on the
 * authenticated CMS API. All display data comes from the registered catalog.
 */
(function(){
  const steps=['choose-plan','start-trial','goals','setup','first-run'];
  const names=['Choose a plan','Start trial','Your goals','Setup','Welcome'];
  const allowedGoals=[
    ['website','Website'],['store','Online store'],['branding','Brand identity'],
    ['content','Content'],['automation','Automation'],['analytics','Analytics'],
    ['ai-assistant','AI assistant']
  ];
  const qs=new URLSearchParams(location.search);
  let siteId=/^[A-Za-z0-9_-]{1,120}$/.test(qs.get('site_id')||'')?qs.get('site_id'):'';
  let offers=[],preview=null,siteName='',statusText='',busy=false;
  let showStyle=false,category='all';
  const rootHtml=`<main class="customer-preview" data-checkout-mode="preview">
    <div class="cp-inner">
      <header class="cp-toolbar">
        <a class="cp-back-link" href="/admin/store" id="cp-back-store">← Online Store</a>
        <span class="cp-mode">Customer experience preview · no payment</span>
      </header>
      <div class="cp-head">
        <small>InnerAnimalMedia · customer123 journey</small>
        <h1 id="cp-title">Choose how to begin</h1>
        <p id="cp-intro">Test the complete onboarding experience with actual catalog offers, without configuring payment providers.</p>
      </div>
      <ol class="cp-progress" id="cp-progress" aria-label="Onboarding progress"></ol>
      <div id="cp-error" class="cp-error" role="alert" hidden></div>
      <div id="cp-content" class="cp-shell" aria-live="polite"></div>
      <div class="cp-actions">
        <button class="cp-button" type="button" id="cp-style-toggle" aria-expanded="false" aria-controls="cp-style-spec">View style specification</button>
      </div>
      <section class="cp-style-panel" id="cp-style-spec" aria-label="Clean company black and white style" hidden>
        <h2>Clean company / B&W</h2><p class="cp-help">Platform-provided style reference. Your selected account theme controls this editor; a customer's storefront retains its own theme.</p>
        <div class="cp-swatches">
          <div><span class="cp-swatch" style="background:#1f1e1d"></span><span class="cp-swatch-label">Ink #1F1E1D</span></div>
          <div><span class="cp-swatch" style="background:#f5f4ef"></span><span class="cp-swatch-label">Canvas #F5F4EF</span></div>
          <div><span class="cp-swatch" style="background:#fff"></span><span class="cp-swatch-label">Paper #FFFFFF</span></div>
          <div><span class="cp-swatch" style="background:#6b6a68"></span><span class="cp-swatch-label">Muted #6B6A68</span></div>
        </div>
      </section>
      <p id="cp-status" class="cp-status" role="status" hidden></p>
    </div></main>`;
  if(typeof renderShell==='function')renderShell('/admin/store',rootHtml);
  else document.body.innerHTML=rootHtml;
  const el=id=>document.getElementById(id);
  const toText=(value)=>String(value??'');
  const node=(tag,cls,text)=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!=null)e.textContent=toText(text);
    return e;
  };
  const money=offer=>{
    const price=(Number(offer?.price_cents||0)/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
    return price+(offer?.billing_interval==='one_time'?' once':' / '+(offer?.billing_interval||'month'));
  };
  function error(message){
    const target=el('cp-error');
    target.textContent=message;
    target.hidden=!message;
  }
  async function api(path,options={}){
    if(!siteId)throw Error('Choose a site before previewing its checkout.');
    const url=new URL(path,location.origin);
    url.searchParams.set('site_id',siteId);
    const response=await fetch(url.toString(),{credentials:'same-origin',cache:'no-store',
      ...options,headers:options.body?{'content-type':'application/json'}:undefined});
    let result={};
    try{result=await response.json();}catch{}
    if(!response.ok||!result.ok)throw Error(result.error||'Preview request failed');
    return result;
  }
  const currentStep=()=>preview?.step||'choose-plan';
  function updateHead(){
    const step=currentStep();
    const index=Math.max(0,steps.indexOf(step));
    el('cp-title').textContent=['Choose how to begin','Review your selection','What would you like to accomplish?','Make it yours','Your preview is ready'][index];
    el('cp-intro').textContent=[
      'Pick a real catalog offering. Prices are shown for review only.',
      'Review the actual offering and checkout layout. This test never charges a card.',
      'Tell us what matters. Your selections are saved in this preview session.',
      'Configure the experience before any customer account or website is created.',
      'Review what customer123 would see after onboarding.'
    ][index];
    const progress=el('cp-progress');
    progress.replaceChildren();
    names.forEach((name,i)=>{
      const item=node('li',i===index?'is-current':i<index?'is-done':'',name);
      if(i===index)item.setAttribute('aria-current','step');
      progress.append(item);
    });
    el('cp-status').hidden=!statusText;
    el('cp-status').textContent=statusText;
    const link=el('cp-back-store');
    link.href='/admin/store?site_id='+encodeURIComponent(siteId||'');
  }
  const button=(text,handler,cls='cp-button')=>{
    const b=node('button',cls,text);
    b.type='button';
    b.disabled=busy;
    b.addEventListener('click',()=>void invoke(handler));
    return b;
  };
  async function invoke(fn){
    if(busy)return;
    busy=true;
    error('');
    document.querySelectorAll('.customer-preview button').forEach(b=>b.disabled=true);
    try{await fn();statusText='Preview saved · no payment processed';}
    catch(e){error(String(e.message||'Request failed'));}
    finally{busy=false;render();}
  }
  async function move(step,payload={}){
    const result=await api('/api/admin/cms/checkout-previews/'+preview.id,{
      method:'PATCH',body:JSON.stringify({step,expected_revision:preview.revision,...payload})
    });
    preview=result.preview;
  }
  function actions(container,forward,back){
    const bar=node('div','cp-actions');
    if(back)bar.append(button('Back',back));
    if(forward)bar.append(forward);
    container.append(bar);
  }
  function renderPlans(content){
    content.append(node('h2',null,'Explore our offerings'),
      node('p','cp-help','These options come from the existing product catalog. Your selection is a preview, not an order.'));
    const fields=node('div','cp-fields-row');
    const label=node('label','cp-field','Preview persona');
    const input=node('input');
    input.type='text';input.maxLength=120;input.value='customer123';input.id='cp-persona';
    label.htmlFor=input.id;label.append(input);
    fields.append(label);
    const categories=[...new Set(offers.map(offer=>offer.category).filter(Boolean))];
    const filter=node('label','cp-field','Offer category');
    const select=node('select');
    select.id='cp-category';
    for(const item of ['all',...categories]){
      const opt=node('option',null,item==='all'?'All offerings':item.replaceAll('_',' '));
      opt.value=item;select.append(opt);
    }
    select.value=category;
    select.addEventListener('change',()=>{category=select.value;render()});
    filter.htmlFor=select.id;filter.append(select);fields.append(filter);
    content.append(fields);
    const list=node('div','cp-grid');list.style.marginTop='20px';
    const shown=offers.filter(offer=>category==='all'||offer.category===category);
    for(const offer of shown){
      const card=node('article','cp-offer');
      card.append(node('small',null,offer.category?.replaceAll('_',' ')||'Offering'),
        node('h3',null,offer.name));
      if(offer.description)card.append(node('p',null,offer.description));
      card.append(node('div','cp-price',money(offer)));
      card.append(button('Choose this plan',async()=>{
        const label=el('cp-persona')?.value?.trim()||'customer123';
        const result=await api('/api/admin/cms/checkout-previews',{
          method:'POST',body:JSON.stringify({offer_id:offer.id,customer_label:label})
        });
        preview=result.preview;
        statusText='Preview session saved';
      },'cp-button cp-button--primary'));
      list.append(card);
    }
    if(!shown.length)list.append(node('p','cp-help','No available offers in this category.'));
    content.append(list);
  }
  function renderTrial(content){
    const offer=preview.journey.offer;
    content.append(node('h2',null,'Your selection'),
      node('p','cp-help','This is a genuine catalog offering. You can inspect the checkout before connecting Stripe, Square, or another provider.'));
    const summary=node('div','cp-summary');
    const name=node('div');name.append(node('strong',null,offer.name),node('p','cp-help',offer.description||''));
    summary.append(name,node('strong',null,money(offer)));
    content.append(summary);
    const note=node('div','cp-review-note','Payment is not connected in this preview. No card details are collected, no subscription starts, and no order is created.');
    content.append(note);
    actions(content,button('Continue without payment',()=>move('goals'),'cp-button cp-button--primary'),
      ()=>move('choose-plan'));
  }
  function renderGoals(content){
    content.append(node('h2',null,'What should we build?'),node('p','cp-help','Select any goals that fit. These are real saved onboarding answers.'));
    const list=node('div','cp-options');
    for(const [key,label] of allowedGoals){
      const wrapper=node('label','cp-check');
      const input=node('input');
      input.type='checkbox';input.value=key;input.name='goals';
      input.checked=(preview.journey.goals||[]).includes(key);
      wrapper.append(input,node('span',null,label));
      list.append(wrapper);
    }
    content.append(list);
    actions(content,button('Continue to setup',()=>{
      const selected=[...content.querySelectorAll('input[name="goals"]:checked')].map(input=>input.value);
      return move('setup',{goals:selected});
    },'cp-button cp-button--primary'),()=>move('start-trial'));
  }
  function renderSetup(content){
    content.append(node('h2',null,'Configure your workspace'),node('p','cp-help','Preview the setup form without creating a real customer account or changing your existing sites.'));
    const form=node('form','cp-form');form.noValidate=true;
    const wrapper=node('label','cp-field','Site or company name');
    const input=node('input');input.name='site_name';input.type='text';input.id='cp-site-name';
    input.required=true;input.minLength=1;input.maxLength=100;
    input.value=preview.journey.site_name||'customer123 studio';
    wrapper.htmlFor=input.id;wrapper.append(input);form.append(wrapper);
    const note=node('p','cp-help','Your entry is saved to this preview session only. Actual site provisioning happens after account verification in the live journey.');
    form.append(note);
    const controls=node('div','cp-actions');
    controls.append(button('Back',()=>move('goals')));
    const submit=node('button','cp-button cp-button--primary','Finish experience preview');
    submit.type='submit';
    submit.addEventListener('click',event=>{if(!form.reportValidity())event.preventDefault()});
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(!form.reportValidity())return;
      void invoke(()=>move('first-run',{site_name:input.value.trim()}));
    });
    controls.append(submit);form.append(controls);content.append(form);
  }
  function renderDone(content){
    content.append(node('h2',null,'Welcome, '+(preview.customer_label||'customer123')),
      node('p','cp-help','This is the end of the previewed customer journey. Every choice below was saved to your site-owned preview session.'));
    const dl=node('dl','cp-complete');
    for(const [label,value] of [
      ['Offering',preview.journey.offer?.name||''],
      ['Catalog price',money(preview.journey.offer)],
      ['Goals',(preview.journey.goals||[]).map(x=>x.replaceAll('-',' ')).join(', ')||'Not specified'],
      ['Proposed site',preview.journey.site_name||''],
      ['Payment','Not processed · preview only']
    ]){
      dl.append(node('dt',null,label),node('dd',null,value));
    }
    content.append(dl);
    const done=node('p','cp-help','No payment, paid subscription, real purchase, site provisioning, or customer account was created.');
    done.style.marginTop='18px';content.append(done);
    actions(content,button('Start a new preview',async()=>{preview=null;statusText='';}),null);
  }
  function render(){
    updateHead();
    const content=el('cp-content');
    content.replaceChildren();
    switch(currentStep()){
      case 'start-trial':renderTrial(content);break;
      case 'goals':renderGoals(content);break;
      case 'setup':renderSetup(content);break;
      case 'first-run':renderDone(content);break;
      default:renderPlans(content);
    }
    const toggle=el('cp-style-toggle');
    toggle.disabled=busy;
    toggle.setAttribute('aria-expanded',String(showStyle));
    el('cp-style-spec').hidden=!showStyle;
  }
  el('cp-style-toggle').addEventListener('click',()=>{
    showStyle=!showStyle;render();
  });
  (async()=>{
    try{
      if(!siteId){
        const response=await fetch('/api/admin/cms/sites',{credentials:'same-origin'});
        const data=await response.json();
        if(!response.ok||!data.ok)throw Error('Unable to load your sites');
        if(data.sites?.length===1)siteId=data.sites[0].id;
        else siteId=data.default_site_id||
          (data.sites||[]).find(s=>s.is_default)?.id||'';
        if(!siteId)throw Error('Select a site in Online Store before previewing checkout');
      }
      const returned=await api('/api/admin/cms/checkout-previews/offers');
      offers=returned.offers||[];
      const selected=qs.get('preview_id');
      if(selected&&/^cprev_[a-f0-9]{24}$/.test(selected)){
        const resumed=await api('/api/admin/cms/checkout-previews/'+selected);
        preview=resumed.preview;
      }
      statusText='Preview environment ready · account-owned D1';
      render();
    }catch(e){error(String(e.message||e));}
  })();
  render();
})();
