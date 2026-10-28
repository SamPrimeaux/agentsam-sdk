/* Same-origin local Resolve preview bridge. No API calls, no customer records. */
(function () {
  'use strict';
  if (window.top === window.self || !new URLSearchParams(location.search).has('studio_preview')) return;
  // The shipped Resolve example may include its own native signup form. Never
  // allow a local editor preview to contact live signup/payment endpoints.
  var originalFetch=window.fetch?.bind(window);
  if(originalFetch)window.fetch=function(input,init){
    var method=String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if(!['GET','HEAD'].includes(method))
      return Promise.resolve(new Response(JSON.stringify({error:'preview_only'}),{status:403,
        headers:{'Content-Type':'application/json'}}));
    return originalFetch(input,init);
  };
  document.addEventListener('submit',function(event) {
    if(event.target.closest('#agentsam-resolve-preview'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({type:'agentsam:resolve-notice',
      message:'Demo storefront submissions are disabled in the local CMS preview.'},location.origin);
  },true);
  var state = { embeds: [], selected: 'hero', sections: {}, previewing: null };
  var previouslyModified = new Map();
  var overlayTimers = [];
  var scrolling = false;
  var sections = {
    header: 'header, nav',
    hero: 'main section:first-of-type, main > div:first-child, #root > div > section:first-of-type',
    collections: '#collection-tab, [id*="collection"], [id*="shop"]',
    editorial: '#editorial, [id*="editorial"]',
    newsletter: '[id*="newsletter"], [id*="dispatch"], footer form',
    footer: 'footer'
  };
  var css = document.createElement('style');
  css.textContent = [
    '#agentsam-resolve-preview{position:fixed;z-index:2147482000;pointer-events:none;inset:0;font-family:Geist,Arial,sans-serif}',
    '.rs-embed{pointer-events:auto;box-sizing:border-box;box-shadow:0 12px 55px #0005;font-size:13px}',
    '.rs-embed *{box-sizing:border-box}',
    '.rs-announcement{position:absolute;top:0;left:0;right:0;min-height:42px;text-align:center;padding:11px 38px;display:flex;justify-content:center;gap:12px;align-items:center;color:white}',
    '.rs-announcement button{position:absolute;right:16px;top:9px;color:inherit;background:none;border:0;cursor:pointer;font-size:17px}',
    '.rs-embed-panel{position:absolute;background:#141414;color:#fff;padding:23px;width:min(360px,calc(100vw - 30px));border:1px solid #7774;border-radius:6px}',
    '.rs-embed-panel h2{font:500 27px/1.05 "Cormorant Garamond",Georgia,serif;margin:4px 0 10px}',
    '.rs-embed-panel p{font-size:12px;line-height:1.6;color:#ccc;margin:0 0 15px}',
    '.rs-embed-panel form{display:grid;gap:9px}',
    '.rs-embed-panel input,.rs-embed-panel textarea{width:100%;background:#fff;color:#151515;border:1px solid #aaa;padding:10px 11px;border-radius:2px;font:12px Geist,Arial,sans-serif}',
    '.rs-embed-panel form button{background:#fff;color:#111;border:0;min-height:38px;font-size:11px;letter-spacing:.1em;font-weight:750;cursor:pointer}',
    '.rs-embed-panel form label{font-size:11px;display:grid;gap:5px}',
    '.rs-close{position:absolute;right:8px;top:8px;border:0;background:none;color:inherit;cursor:pointer;font-size:20px}',
    '.rs-embed-panel.rs-inline{position:relative;margin:30px auto;max-width:500px}',
    '.rs-embed-panel.rs-bottom-right{right:18px;bottom:20px}',
    '.rs-embed-panel.rs-bottom-left{left:18px;bottom:20px}',
    '.rs-embed-panel.rs-center{left:50%;top:50%;transform:translate(-50%,-50%)}',
    '.rs-overlay{position:fixed;inset:0;background:#0009;backdrop-filter:blur(2px);pointer-events:auto}',
    '.rs-preview-tag{font-size:9px;color:#f8d7df;letter-spacing:.09em;text-transform:uppercase;display:block;margin-bottom:10px}',
    '.rs-form-status{color:#e4c3d1;font-size:11px;min-height:12px}',
    '.rs-selected-outline{outline:3px solid #8d67eb!important;outline-offset:-3px!important}',
    '@media(max-width:550px){.rs-embed-panel.rs-bottom-right,.rs-embed-panel.rs-bottom-left{right:12px;bottom:12px;left:12px;width:auto}}'
  ].join('\n');
  document.head.appendChild(css);
  var layer = document.createElement('div');
  layer.id = 'agentsam-resolve-preview';
  layer.setAttribute('data-local-only', 'true');
  document.body.appendChild(layer);
  function html(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function findTarget(key) {
    try {
      var node=document.querySelector(sections[key] || '#' + CSS.escape(key));
      if(!node && key==='newsletter'){
        var heading=Array.from(document.querySelectorAll('h1,h2,h3')).find(function(h){
          return /the edit, in your inbox|subscribe|newsletter/i.test(h.textContent||'');
        });
        node=heading?.closest('section')||heading?.parentElement||null;
      }
      return node;
    }catch(_) { return null; }
  }
  function highlight(key, shouldScroll) {
    document.querySelectorAll('.rs-selected-outline').forEach(function(el){el.classList.remove('rs-selected-outline');});
    var target = findTarget(key);
    if (target) {
      target.classList.add('rs-selected-outline');
      if (shouldScroll) target.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }
  function suppressDemoSignup() {
    var candidates=document.querySelectorAll('#root h2,#root h3,#root p,#root strong');
    for(var i=0;i<candidates.length;i++){
      var node=candidates[i];
      if(!node.children.length && /Take 15% Off Your First Order/i.test(node.textContent||'')){
        var modal=node.closest('[class*="fixed"]');
        if(modal){modal.style.display='none';modal.setAttribute('data-agentsam-native-popup','suppressed');}
      }
    }
  }
  function applySections() {
    suppressDemoSignup();
    var found={};
    Object.keys(sections).forEach(function(key){
      var target=findTarget(key),config=state.sections[key]||{};
      found[key]=Boolean(target);
      if(!target)return;
      if(!previouslyModified.has(target))previouslyModified.set(target,{
        display:target.style.display,padding:target.style.padding,background:target.style.background
      });
      var initial=previouslyModified.get(target);
      target.style.display=config.visible===false?'none':initial.display;
      target.style.padding=Number(config.padding)>0?Math.min(160,Math.max(0,Number(config.padding)))+'px':initial.padding;
      target.style.background=config.background&&config.background!=='#ffffff'?config.background:initial.background;
    });
    window.parent.postMessage({type:'agentsam:resolve-detected',available:found},location.origin);
  }
  function render() {
    layer.replaceChildren();
    (state.embeds || []).filter(function(embed){return embed.installed && embed.config && embed.config.enabled;}).forEach(function(embed) {
      var c=embed.config, key=embed.key;
      if (key==='announcement_bar') {
        var bar=document.createElement('div');
        bar.className='rs-embed rs-announcement';
        bar.style.background=c.background||'#141414';
        bar.innerHTML='<strong>'+html(c.heading)+'</strong><span>'+html(c.subtitle)+'</span>'+
          (c.dismissible ? '<button type="button" aria-label="Dismiss announcement">×</button>' : '');
        bar.querySelector('button')?.addEventListener('click',function(){bar.remove()});
        layer.appendChild(bar);
        return;
      }
      if (c.trigger==='manual' && state.previewing!==key) return;
      if (c.trigger==='scroll' && state.previewing!==key && window.scrollY<250)return;
      if (c.trigger==='exit-intent' && state.previewing!==key)return;
      if (c.trigger==='delay' && state.previewing!==key && !state.delayElapsed?.[key])return;
      var wrapper=document.createElement('div');
      wrapper.className='rs-embed rs-embed-panel rs-'+html(c.placement||'bottom-right');
      wrapper.style.background=c.background||'#161616';
      var fields=Array.isArray(c.fields)?c.fields:['first_name','email'];
      var labels={email:'Email address',first_name:'First name',last_name:'Last name',message:'Your message',phone:'Phone'};
      var required=Array.isArray(c.required_fields)?c.required_fields.slice():['email','first_name'];
      if(key.startsWith('newsletter')){
        if(!required.includes('email'))required.push('email');
        if(!required.includes('first_name'))required.push('first_name');
      }
      var announcement=key==='announcement_modal';
      wrapper.innerHTML='<span class="rs-preview-tag">AgentSam · interactive local preview</span><button type="button" class="rs-close" aria-label="Close preview">×</button>'+
        '<h2>'+html(c.heading||embed.name)+'</h2><p>'+html(c.subtitle||'')+'</p>'+
        (announcement?'<button type="button" class="rs-preview-cta">'+html(c.button_label||'Explore')+'</button>':
        '<form novalidate>'+fields.map(function(f) {
          var label=labels[f]||f.replace(/_/g,' '), req=required.includes(f);
          return '<label>'+html(label)+(req?' *':'')+
            (f==='message'?'<textarea name="'+html(f)+'" '+(req?'required':'')+' rows="3"></textarea>':
             '<input name="'+html(f)+'" type="'+(f==='email'?'email':'text')+'" '+(req?'required':'')+' placeholder="'+html(label)+'">')+'</label>';
        }).join('')+'<button type="submit">'+html(c.button_label||'Submit')+'</button><div class="rs-form-status" role="status">Preview only · no data will be sent</div></form>');
      wrapper.querySelector('.rs-close').addEventListener('click',function(){wrapper.remove();});
      wrapper.querySelector('.rs-preview-cta')?.addEventListener('click',function(){wrapper.remove();});
      wrapper.querySelector('form')?.addEventListener('submit',function(e) {
        e.preventDefault();
        var form=e.currentTarget, missing=fields.find(function(name) {
          return required.includes(name)&&!String(form.elements.namedItem(name)?.value||'').trim();
        });
        var status=form.querySelector('.rs-form-status');
        if(missing){ status.textContent='Required field: '+(labels[missing]||missing);return; }
        var email=form.elements.namedItem('email');
        if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          status.textContent='Enter a valid email address.'; return;
        }
        status.textContent='Form validated locally. No signup or email was sent.';
      });
      layer.appendChild(wrapper);
    });
  }
  window.addEventListener('message',function(event) {
    if (event.source!==window.parent || event.origin!==location.origin) return;
    var message=event.data;
    if (!message || message.type!=='agentsam:resolve-update') return;
    if (Array.isArray(message.embeds)) state.embeds=message.embeds;
    if (message.previewing!==undefined) state.previewing=message.previewing;
    state.delayElapsed={};
    overlayTimers.forEach(clearTimeout);overlayTimers=[];
    var delayEntries=state.embeds.filter(function(e){return e.installed&&e.config?.enabled&&e.config.trigger==='delay'&&e.key!==state.previewing;});
    delayEntries.forEach(function(e){
      overlayTimers.push(setTimeout(function(){
        state.delayElapsed[e.key]=true;render();
      },Math.min(30000,Math.max(0,Number(e.config.delay_ms)||0))));
    });
    if (message.selected) {
      state.selected=message.selected;
      highlight(state.selected,Boolean(message.scroll));
    }
    render();
    applySections();
  });
  window.addEventListener('scroll',function(){
    if(scrolling)return;
    if(window.scrollY < 250 || state.scrollTriggered)return;
    scrolling=true;requestAnimationFrame(function(){
      scrolling=false;state.scrollTriggered=true;render();
    });
  },{passive:true});
  document.addEventListener('mouseleave',function(event){
    if(event.clientY>6)return;
    var chosen=state.embeds.find(function(e){return e.config?.enabled&&e.config.trigger==='exit-intent';});
    if(chosen){state.previewing=chosen.key;render();}
  });
  window.parent.postMessage({type:'agentsam:resolve-ready'},location.origin);
  var root=document.getElementById('root');
  if(root) {
    var rescanQueued=false;
    new MutationObserver(function(){
      if(rescanQueued)return;
      rescanQueued=true;
      requestAnimationFrame(function(){
        rescanQueued=false;
        applySections();
        highlight(state.selected,false);
      });
    }).observe(root,{childList:true,subtree:true});
  }
  applySections();
  document.addEventListener('click',function(event){
    var key=Object.keys(sections).find(function(k) {
      try {return Boolean(event.target.closest(sections[k]));}
      catch(_) {return false;}
    });
    if(key) window.parent.postMessage({type:'agentsam:resolve-select',key:key},location.origin);
  },true);
})();
