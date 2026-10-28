/* In-place Theme Studio extension for the packaged Resolve preview.
 * The SDK manifests own catalog metadata. This isolated browser workspace
 * stores only layout mock configuration; never secrets, submissions, or payments.
 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('showcase') !== 'resolve') return;
  var STORAGE_KEY = 'agentsam.resolve.local-preview.embeds.v1';
  var sections = [
    {key:'header',label:'Header',icon:'☷',group:'HEADER'},
    {key:'hero',label:'Hero',icon:'▤',group:'TEMPLATE'},
    {key:'collections',label:'Collections',icon:'▦',group:'TEMPLATE'},
    {key:'editorial',label:'Editorial',icon:'▧',group:'TEMPLATE'},
    {key:'newsletter',label:'Newsletter signup',icon:'✉',group:'TEMPLATE'},
    {key:'footer',label:'Footer',icon:'☷',group:'FOOTER'}
  ];
  var catalog=[], records={}, selected='hero', selectionType='section', previewing=null, connected=false;
  var available={}, sectionSettings={};
  var portalPage=null;
  var portalTemplateRoutes=[];
  var onNavigatePage=null;
  var portalBrand={
    name:'RESOLVE',tagline:'Objects of lasting desire.',logo_url:'',
    accent:'#8b181b',backdrop_from:'#0b0b0b',backdrop_mid:'#231418',backdrop_to:'#493036',
    glass_opacity:0.1,parallax_enabled:true,parallax_strength:18,
    signup_enabled:true,password_gate_enabled:false,show_guest_checkout:true
  };
  const PORTAL_BRAND_KEY='resolve.portal.preview.brand.v1';
  const EXTRA_TYPES=[
    {type:'rich-text',label:'Rich text editorial',icon:'≡'},
    {type:'media-feature',label:'Image + content feature',icon:'▧'},
    {type:'newsletter-callout',label:'Newsletter section',icon:'✉'},
    {type:'collection-strip',label:'Featured collections',icon:'▦'}
  ];
  function extraSections(){
    return portalPage ? sectionSettings[portalPage.slug+':_extra']||[] : [];
  }
  function visibleSections(){
    if(!portalPage)return sections;
    return [{key:'header',label:'Header',icon:'☷',group:'HEADER'}]
      .concat((portalPage.sections||[]).map(item=>({
        key:item.key,label:item.key.replace(/-/g,' ').replace(/^\w/,c=>c.toUpperCase()),
        icon:'▤',group:'TEMPLATE'
      })))
      .concat(extraSections().map(item=>({key:item.key,label:item.label,icon:'⊞',group:'ADDED SECTIONS'})))
      .concat([{key:'footer',label:'Footer',icon:'☷',group:'FOOTER'}]);
  }
  function pagePath(slug){
    if(!portalPage || portalPage.slug!==slug)return null;
    try{
      const meta=typeof portalPage.metadata_json==='string'
        ? JSON.parse(portalPage.metadata_json) : portalPage.metadata_json;
      return meta?.theme==='resolve' && /^[a-z0-9/-]+$/.test(meta.path) ? meta.path : null;
    }catch(_){return null;}
  }
  function setPage(page){
    portalPage=page?.slug?.startsWith('resolve-')?page:null;
    available={};
    const choices=visibleSections();
    if(!choices.some(item=>item.key===selected) || selectionType==='app'){
      selected=choices.find(item=>item.group==='TEMPLATE')?.key||'header';
      selectionType='section';
    }
  }
  function el(id){return document.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(x){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[x];
  });}
  function read() {
    try {
      const stored=JSON.parse(localStorage.getItem(PORTAL_BRAND_KEY)||'null');
      if(stored && typeof stored==='object')portalBrand={...portalBrand,...stored};
    }catch(_){}
    try{
      var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      records=saved.records&&typeof saved.records==='object'?saved.records:{};
      sectionSettings=saved.sections&&typeof saved.sections==='object'?saved.sections:{};
    }catch(_){records={};sectionSettings={};}
  }
  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify({records:records,sections:sectionSettings}));}
  function stateFor(app) {
    var r=records[app.key];
    if (!r) return {installed:false,config:Object.assign({},app.default_config||{})};
    return r;
  }
  function note(message){
    var target=el('te-note');if(!target)return;
    target.textContent=message;target.className='te-note is-info';
  }
  function status(app) {
    var r=stateFor(app);
    if(!r.installed)return 'Not installed';
    if(!r.config.enabled)return 'Disabled';
    return 'Preview enabled';
  }
  function sync(extra) {
    var frame=el('theme-preview');
    if (!frame || !frame.contentWindow) return;
    if(portalPage){
      frame.contentWindow.postMessage(Object.assign({
        type:'agentsam:resolve-portal-config',
        brand:portalBrand,
        selected:selectionType==='section'?selected:null,
        sections:sectionSettings,
        scroll:false
      },extra||{}),location.origin);
      frame.contentWindow.postMessage(Object.assign({
        type:'agentsam:resolve-update',
        selected:selectionType==='section'?selected:null,
        scroll:false,
        previewing:previewing,
        sections:sectionSettings,
        embeds:catalog.map(function(app){return Object.assign({key:app.key,name:app.name},stateFor(app));})
      },extra||{}),location.origin);
      return;
    }
    frame.contentWindow.postMessage(Object.assign({
      type:'agentsam:resolve-update',
      selected:selected,
      scroll:false,
      previewing:previewing,
      sections:sectionSettings,
      embeds:catalog.map(function(app){return Object.assign({key:app.key,name:app.name},stateFor(app));})
    },extra||{}),location.origin);
  }
  function drawCatalog(filter) {
    var root=el('te-embed-empty');
    if(!root)return;
    var query=String(filter||'').toLowerCase().trim();
    if(!catalog.length) {
      root.className='te-empty';
      root.textContent='Loading the installed SDK app manifests…';
      return;
    }
    root.className='rs-app-list';
    root.innerHTML='<div class="rs-app-summary">Local configuration preview · Nothing is installed in D1</div>'+
      catalog.filter(function(app){return !query||[app.name,app.tagline,app.category,app.provider_name].join(' ').toLowerCase().includes(query);})
      .map(function(app){
        var st=status(app);
        var selectedClass=selectionType==='app'&&selected===app.key?' is-selected':'';
        return '<button type="button" class="rs-app-card'+selectedClass+'" data-rs-choose="'+esc(app.key)+'">'+
          '<span class="rs-app-icon">'+(app.icon==='send'?'↗':app.icon==='mail'?'✉':app.icon==='megaphone'?'◩':app.icon==='mail-open'?'▣':'⌁')+'</span>'+
          '<span class="rs-app-copy"><strong>'+esc(app.name)+'</strong><small>'+esc(app.tagline)+'</small>'+
          '<span class="rs-app-meta"><em>'+esc(app.category)+'</em><span class="'+(st==='Preview enabled'?'is-green':'')+'">'+st+'</span></span></span></button>';
      }).join('')+
      '<button type="button" class="rs-secondary" data-rs-copy-config>Copy preview JSON</button>' +
      '<div class="rs-app-summary rs-app-footnote">Resend connection and live submissions require the server integration. This panel edits local preview components only.</div>';
    root.querySelector('[data-rs-copy-config]')?.addEventListener('click',async function(){
      var content=JSON.stringify({theme:'resolve',preview_only:true,
        cms_components:catalog.filter(function(app){return stateFor(app).installed;}).map(function(app,index){
          var r=stateFor(app);
          // Mirrors the existing D1 columns: provider is config JSON, not a new DB column.
          return {label:app.name,type:'app_embed',active:r.config.enabled?1:0,sort_order:index,
            config_json:{provider:app.provider,embed_key:app.key,status:'draft',settings:r.config}};
        }),sections:sectionSettings},null,2);
      try{await navigator.clipboard.writeText(content);note('Preview component JSON copied. It contains no API keys or visitor data.');}
      catch(_){note('Clipboard unavailable. Use the editor from localhost to copy preview config.');}
    });
    root.querySelectorAll('[data-rs-choose]').forEach(function(btn){
      btn.addEventListener('click',function(){selectApp(btn.dataset.rsChoose);});
    });
  }
  function section(key) {return visibleSections().find(function(s){return s.key===key;});}
  function renderSections() {
    var tree=el('te-tree');if(!tree)return;
    var html='',group='';
    visibleSections().forEach(function(s){
      if(group!==s.group) {group=s.group;html+='<div class="rs-tree-group">'+group+'</div>';}
      var selectedClass=selected===s.key&&selectionType==='section'?' is-selected':'';
      var present=available[s.key];
      html+='<button type="button" class="rs-tree-row'+selectedClass+'" data-rs-section="'+s.key+'">'+
        '<span>'+s.icon+'</span><span>'+esc(s.label)+'</span><small>'+
        (present===false?'Unmapped':'Edit')+'</small></button>';
    });
    tree.innerHTML=html+'<button type="button" class="rs-add-section" data-rs-add>+ Add section</button>'+
      '<div id="rs-section-library" hidden class="rs-section-library"><div class="rs-group-heading">ADD A RESOLVE SECTION</div>'+
      EXTRA_TYPES.map(item=>'<button type="button" class="rs-section-choice" data-rs-template="'+item.type+'"><span>'+item.icon+'</span>'+item.label+' <span>＋</span></button>').join('')+
      '<button class="rs-section-choice" data-rs-embed-shortcut type="button">✣ App embed →</button></div>'+
      '<p class="rs-tree-note">Each section is selectable and editable in the preview. New sections remain local draft until an authorized CMS save.</p>';
    var title=el('te-tree-title');if(title)title.textContent=portalPage?portalPage.title:'Resolve · Home';
    tree.querySelectorAll('[data-rs-section]').forEach(function(btn){
      btn.addEventListener('click',function(){selectSection(btn.dataset.rsSection,true);});
    });
    tree.querySelector('[data-rs-add]')?.addEventListener('click',function(){
      const library=tree.querySelector('#rs-section-library');
      library.hidden=!library.hidden;
    });
    tree.querySelectorAll('[data-rs-template]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!portalPage){note('Choose a Resolve page before adding sections.');return;}
        const template=EXTRA_TYPES.find(t=>t.type===btn.dataset.rsTemplate);
        if(!template)return;
        const extras=extraSections().slice();
        if(extras.length>=20){note('Maximum 20 local draft sections per page.');return;}
        const key='custom-'+template.type+'-'+Date.now().toString(36);
        extras.push({key,label:template.label,type:template.type});
        sectionSettings[portalPage.slug+':_extra']=extras;
        sectionSettings[portalPage.slug+':'+key]={
          visible:true,padding:48,heading:template.label.toUpperCase(),
          description:'A considered addition to the Resolve archive.',
          button_label:'EXPLORE THE EDIT'
        };
        selected=key;selectionType='section';save();renderSections();renderInspector();sync({scroll:true});
        note('Added '+template.label+' to this page draft.');
      });
    });
    tree.querySelector('[data-rs-embed-shortcut]')?.addEventListener('click',function(){
      document.querySelector('[data-drawer-mode="app-embeds"]')?.click();
    });
  }
  function inspectorTitle(title,subtitle) {
    if(el('te-inspector-title'))el('te-inspector-title').textContent=title;
    if(el('te-inspector-subtitle'))el('te-inspector-subtitle').textContent=subtitle;
    if(el('te-section-status')) {
      el('te-section-status').textContent='Preview';
      el('te-section-status').className='te-badge';
    }
  }
  function input(label,id,value,type,more) {
    type=type||'text';
    return '<label class="rs-control">'+esc(label)+
      '<input type="'+type+'" data-rs-input="'+esc(id)+'" value="'+esc(value)+'" '+(more||'')+'></label>';
  }
  function selectWidget(options,current,id) {
    return '<label class="rs-control">'+esc(id.replace(/_/g,' '))+'<select data-rs-input="'+id+'">'+options.map(function(v){
      return '<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v.replace(/-/g,' '))+'</option>';
    }).join('')+'</select></label>';
  }
  function check(label,id,value) {
    return '<label class="rs-toggle"><input type="checkbox" data-rs-check="'+id+'"'+(value?' checked':'')+'><span>'+esc(label)+'</span></label>';
  }
  function renderInspector() {
    var panel=el('te-inspector-body');
    if(!panel)return;
    if(selectionType==='app') {renderAppInspector();return;}
    if(portalPage){renderPortalInspector();return;}
    var item=section(selected)||sections[0];
    inspectorTitle(item.label,'Resolve · '+item.group.toLowerCase()+' / section');
    var c=sectionSettings[item.key]||{};
    panel.innerHTML='<div class="rs-inspector"><div class="rs-group-heading">Section & placement</div>'+
      '<p class="rs-inspector-hint">The highlighted area is selected from the real Resolve preview. These settings modify the local view only.</p>'+
      check('Visible in preview','visible',c.visible!==false)+
      input('Section label','label',c.label||item.label)+
      input('Spacing (px)','padding',c.padding||0,'number','min="0" max="160"')+
      input('Surface color','background',c.background||'#ffffff','color')+
      '<button type="button" class="rs-secondary" data-rs-scroll>Jump to section</button>'+
      '<div class="rs-qa">'+(available[item.key]===false?'No matching anchor found in packaged Resolve.':available[item.key]===true?'Linked to a real Resolve DOM region.':'Checking packaged Resolve DOM…')+'</div></div>';
    panel.querySelectorAll('[data-rs-input]').forEach(function(field){
      field.addEventListener('input',function(){
        var cfg=sectionSettings[item.key]||{};
        cfg[field.dataset.rsInput]=field.dataset.rsInput==='padding'?Number(field.value):field.value;
        sectionSettings[item.key]=cfg;save();sync();
      });
    });
    panel.querySelectorAll('[data-rs-check]').forEach(function(field){
      field.addEventListener('change',function(){
        var cfg=sectionSettings[item.key]||{};
        cfg[field.dataset.rsCheck]=field.checked;
        sectionSettings[item.key]=cfg;save();sync();
      });
    });
    panel.querySelector('[data-rs-scroll]')?.addEventListener('click',function(){sync({scroll:true});});
  }
  function selectSection(key,scroll) {
    if(!section(key))return;
    selected=key;selectionType='section';previewing=null;
    renderSections();drawCatalog(el('te-embed-search')?.value);
    renderInspector();sync({scroll:!!scroll});
  }
  function selectApp(key) {
    if(!catalog.some(function(app){return app.key===key;}))return;
    selected=key;selectionType='app';
    drawCatalog(el('te-embed-search')?.value);
    renderInspector();
    sync();
  }
  function renderPortalInspector(){
    const panel=el('te-inspector-body');
    const item=section(selected)||visibleSections()[0];
    inspectorTitle(item.label,'Resolve · '+(portalPage?.title||'Customer portal'));
    const cfg=sectionSettings[portalPage.slug+':'+item.key]||{};
    const isAuth=portalPage.template_key?.includes('sign-')||portalPage.template_key==='resolve/password';
    panel.innerHTML='<div class="rs-inspector">'+
      '<div class="rs-group-heading">Selected section</div>'+
      '<p class="rs-inspector-hint">'+esc(item.label)+' · '+esc(portalPage.template_key)+' · local draft preview</p>'+
      check('Section enabled','section_visible',cfg.visible!==false)+
      input('Vertical padding (px)','section_padding',cfg.padding||0,'number','min="0" max="160"')+
      '<div class="rs-group-heading">Section content</div>'+
      input('Heading','section_heading',cfg.heading||'')+
      '<label class="rs-control">Description<textarea data-rs-input="section_description" rows="3">'+esc(cfg.description||'')+'</textarea></label>'+
      input('Call to action label','section_button_label',cfg.button_label||'')+
      selectWidget(['theme-default','media-216610d365.webp','media-a70660bfa9.webp','media-ced60fcecc.webp','media-2a9e0f623f.webp','media-bc1322e813.webp'],
        cfg.media||'theme-default','section_media')+
      '<button type="button" class="rs-secondary" data-rs-portal-jump>Jump to selected section</button>'+
      (item.key.startsWith('custom-')?'<button type="button" class="rs-secondary" data-rs-portal-remove>Remove added section</button>':'')+
      '<div class="rs-group-heading">Brand identity</div>'+
      input('Brand name','name',portalBrand.name)+
      input('Tagline','tagline',portalBrand.tagline)+
      input('Logo asset URL','logo_url',portalBrand.logo_url||'')+
      input('Accent color','accent',portalBrand.accent,'color')+
      '<div class="rs-group-heading">Atmosphere & parallax</div>'+
      input('Gradient start','backdrop_from',portalBrand.backdrop_from,'color')+
      input('Gradient midpoint','backdrop_mid',portalBrand.backdrop_mid,'color')+
      input('Gradient end','backdrop_to',portalBrand.backdrop_to,'color')+
      input('Glass opacity (0.04–0.33)','glass_opacity',portalBrand.glass_opacity,'number','min="0.04" max="0.33" step="0.01"')+
      check('Pointer parallax enabled','parallax_enabled',portalBrand.parallax_enabled)+
      input('Parallax strength (0–35)','parallax_strength',portalBrand.parallax_strength,'number','min="0" max="35" step="1"')+
      '<div class="rs-group-heading">Customer portal behavior</div>'+
      check('Show customer sign up','signup_enabled',portalBrand.signup_enabled)+
      check('Preview storefront password gate','password_gate_enabled',portalBrand.password_gate_enabled)+
      check('Allow guest checkout path','show_guest_checkout',portalBrand.show_guest_checkout)+
      '<div class="rs-group-heading">Template status</div>'+
      '<div class="rs-setup-list"><b>CMS page: '+esc(portalPage.slug)+'</b>'+
      '<div>✓ Route/template metadata resolved</div><div>✓ Theme previews and GUI settings available</div>'+
      '<div>○ Account authentication not connected</div><div>○ Customer orders/cart backend not connected</div>'+
      '<div>○ Publish to a real tenant not available</div></div>'+
      '<button type="button" class="rs-secondary" data-rs-portal-copy>Copy CMS page draft JSON</button>'+
      '<p class="rs-inspector-hint">This is editable local design configuration. Do not enter real passwords or customer data.</p></div>';
    panel.querySelectorAll('[data-rs-input]').forEach(input=>{
      input.addEventListener('input',()=>{
        const key=input.dataset.rsInput;
        const val=input.type==='number'?Number(input.value):input.value;
        if(key.startsWith('section_')){
          const id=portalPage.slug+':'+item.key;
          const patch={
            section_padding:{padding:Math.max(0,Math.min(160,val))},
            section_heading:{heading:String(val).slice(0,150)},
            section_description:{description:String(val).slice(0,500)},
            section_button_label:{button_label:String(val).slice(0,80)},
            section_media:{media:String(val)}
          }[key];
          if(patch)sectionSettings[id]={...sectionSettings[id],...patch};
          save();
        } else {
          portalBrand[key]=val;
          localStorage.setItem(PORTAL_BRAND_KEY,JSON.stringify(portalBrand));
        }
        sync();
      });
    });
    panel.querySelectorAll('[data-rs-check]').forEach(box=>{
      box.addEventListener('change',()=>{
        const key=box.dataset.rsCheck;
        if(key==='section_visible'){
          const id=portalPage.slug+':'+item.key;
          sectionSettings[id]={...sectionSettings[id],visible:box.checked};save();
        } else {
          portalBrand[key]=box.checked;
          localStorage.setItem(PORTAL_BRAND_KEY,JSON.stringify(portalBrand));
        }
        sync();
      });
    });
    panel.querySelector('[data-rs-portal-jump]')?.addEventListener('click',()=>sync({scroll:true}));
    panel.querySelector('[data-rs-portal-remove]')?.addEventListener('click',()=>{
      sectionSettings[portalPage.slug+':_extra']=extraSections().filter(section=>section.key!==item.key);
      delete sectionSettings[portalPage.slug+':'+item.key];
      selected=visibleSections().find(section=>section.group==='TEMPLATE')?.key||'header';
      save();renderSections();renderInspector();sync();
    });
    panel.querySelector('[data-rs-portal-copy]')?.addEventListener('click',async()=>{
      const content=JSON.stringify({
        page:portalPage,brand_settings:portalBrand,
        local_section_settings:Object.fromEntries(Object.entries(sectionSettings).filter(([key])=>key.startsWith(portalPage.slug+':'))),
        preview_only:true
      },null,2);
      try{await navigator.clipboard.writeText(content);note('CMS page draft configuration copied — no customer credentials.');}
      catch(_){note('Clipboard unavailable in this browser context.');}
    });
  }

  function renderAppInspector() {
    var app=catalog.find(function(entry){return entry.key===selected;});
    if(!app){selectionType='section';renderInspector();return;}
    var record=stateFor(app), c=record.config;
    inspectorTitle(app.name,'App embed · '+app.provider_name);
    var panel=el('te-inspector-body');
    var installed=!!record.installed;
    var fields=Array.isArray(c.fields)?c.fields:['first_name','email'];
    var needsFields=app.key!=='announcement_bar';
    panel.innerHTML='<div class="rs-inspector">'+
      '<div class="rs-app-detail-heading"><span class="rs-app-icon">✦</span><div><b>'+esc(app.name)+'</b><small>'+esc(app.tagline)+'</small></div></div>'+
      '<div class="rs-state-label">Provider: '+esc(app.provider_name)+' · <b>Not connected in local preview</b></div>'+
      '<div class="rs-group-heading">Install & enable</div>'+
      '<p class="rs-inspector-hint">Installing here creates a local preview instance, not a production application or credential.</p>'+
      '<button type="button" class="rs-primary" data-rs-install>'+ (installed?'Uninstall preview':'Install to preview')+'</button>'+
      (installed ? check('Enabled on storefront preview','enabled',c.enabled) : '')+
      '<div class="rs-group-heading">Appearance</div>'+
      input('Heading','heading',c.heading)+
      '<label class="rs-control">Description<textarea rows="3" data-rs-textarea="subtitle">'+esc(c.subtitle||'')+'</textarea></label>'+
      input('Button text','button_label',c.button_label||'')+
      selectWidget(['inline','top','bottom-left','bottom-right','center'],c.placement||'inline','placement')+
      selectWidget(['manual','immediate','delay','scroll','exit-intent'],c.trigger||'manual','trigger')+
      input('Delay (ms)','delay_ms',c.delay_ms||0,'number','min="0" max="30000" step="250"')+
      input('Accent','accent',c.accent||'#8b181b','color')+
      input('Background','background',c.background||'#151515','color')+
      (needsFields?'<div class="rs-group-heading">Form fields</div>'+
        '<p class="rs-inspector-hint">First name is required by the component, not by a database constraint. Last name is optional.</p>'+
        fields.map(function(f){return '<label class="rs-toggle"><input type="checkbox" data-rs-required="'+esc(f)+'"'+
          ((c.required_fields||[]).includes(f)?' checked':'')+
          (f==='email'||(app.provider==='resend'&&f==='first_name')?' disabled':'')+'><span>Require '+esc(f.replace(/_/g,' '))+'</span></label>';}).join('')+
        '<div class="rs-form-fields">'+fields.map(function(f){
          return '<div class="rs-field-entry">'+esc(f.replace(/_/g,' '))+
            '<button data-rs-remove-field="'+esc(f)+'" type="button"'+(f==='email'||(app.provider==='resend'&&f==='first_name')?' disabled':'')+'>×</button></div>';
        }).join('')+'</div>'+
        selectWidget(['first_name','last_name','email','phone','message'],'first_name','new_field')+
        '<button class="rs-secondary" type="button" data-rs-add-field>Add selected field</button>'+
        (app.provider==='resend'?check('Double opt-in (pending confirmation)','double_opt_in',c.double_opt_in!==false):'')
       :check('Dismissible','dismissible',c.dismissible!==false))+
      '<div class="rs-group-heading">Preview & integration</div>'+
      '<button type="button" class="rs-primary" data-rs-preview>Show on Resolve preview</button>'+
      '<button type="button" class="rs-secondary" data-rs-test>Test provider connection</button>'+
      '<button type="button" class="rs-secondary" data-rs-agent>Ask AgentSam to configure</button>'+
      '<div class="rs-setup-list"><b>Connection checklist</b><div>✓ SDK manifest discovered</div><div>✓ Local editor controls available</div>'+
        '<div>○ D1 cms_components binding not connected</div><div>○ Resend credentials and live send not tested</div></div>'+
      '<button type="button" class="rs-danger" data-rs-reset>Delete local configuration</button>'+
      '<p class="rs-inspector-hint">This inspector does not send emails, install a provider, or save visitor submissions.</p></div>';
    function mutate(name,value) {
      var updated=stateFor(app);
      updated.config[name]=value;
      records[app.key]=updated;save();sync();
      drawCatalog(el('te-embed-search')?.value);
    }
    panel.querySelector('[data-rs-install]').addEventListener('click',function(){
      var updated=stateFor(app);updated.installed=!updated.installed;
      if(!updated.installed)updated.config.enabled=false;
      records[app.key]=updated;save();renderAppInspector();sync();drawCatalog(el('te-embed-search')?.value);
    });
    panel.querySelectorAll('[data-rs-input]').forEach(function(field){
      if(field.dataset.rsInput==='new_field')return;
      field.addEventListener('input',function(){mutate(field.dataset.rsInput,field.type==='number'?Number(field.value):field.value);});
    });
    panel.querySelector('[data-rs-textarea]')?.addEventListener('input',function(e){mutate('subtitle',e.target.value)});
    panel.querySelectorAll('[data-rs-check]').forEach(function(box){
      box.addEventListener('change',function(){mutate(box.dataset.rsCheck,box.checked);});
    });
    panel.querySelectorAll('[data-rs-required]').forEach(function(box){
      box.addEventListener('change',function(){
        var list=new Set(stateFor(app).config.required_fields||['email']);
        if(box.checked)list.add(box.dataset.rsRequired);else if(box.dataset.rsRequired!=='email')list.delete(box.dataset.rsRequired);
        list.add('email');if(app.provider==='resend')list.add('first_name');mutate('required_fields',Array.from(list));
      });
    });
    panel.querySelectorAll('[data-rs-remove-field]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var f=btn.dataset.rsRemoveField;
        var current=stateFor(app).config;
        if(f==='email')return;
        mutate('fields',(current.fields||[]).filter(function(x){return x!==f;}));
        mutate('required_fields',(current.required_fields||[]).filter(function(x){return x!==f;}));
        renderAppInspector();
      });
    });
    panel.querySelector('[data-rs-add-field]')?.addEventListener('click',function(){
      var field=panel.querySelector('[data-rs-input="new_field"]').value;
      var list=stateFor(app).config.fields||[];
      if(!list.includes(field))mutate('fields',list.concat(field));
      renderAppInspector();
    });
    panel.querySelector('[data-rs-preview]')?.addEventListener('click',function(){
      var updated=stateFor(app);updated.installed=true;updated.config.enabled=true;
      records[app.key]=updated;save();previewing=app.key;sync();
      renderAppInspector();drawCatalog(el('te-embed-search')?.value);
      note('Resolve preview opened. Forms validate but never send or persist subscriber data.');
    });
    panel.querySelector('[data-rs-test]')?.addEventListener('click',function(){
      note('Connection test requires the authenticated provider adapter. This local preview has no Resend credentials, so no test email was sent.');
    });
    panel.querySelector('[data-rs-agent]')?.addEventListener('click',function(){
      el('agentsam-toggle')?.click();
      note('AgentSam assistant opened. Context: '+app.name+'. The local preview cannot authorize a real provider connection.');
    });
    panel.querySelector('[data-rs-reset]')?.addEventListener('click',function(){
      delete records[app.key];previewing=null;save();renderAppInspector();sync();drawCatalog(el('te-embed-search')?.value);
    });
  }
  async function mount() {
    read();
    var search=el('te-embed-search');
    if(!search || search.dataset.rsMounted)return;
    search.dataset.rsMounted='true';
    search.addEventListener('input',function(){drawCatalog(search.value);});
    el('theme-preview')?.addEventListener('load',function(){connected=false;sync();});
    window.addEventListener('message',function(event){
      if(event.origin!==location.origin || event.source!==el('theme-preview')?.contentWindow)return;
      if(event.data?.type==='agentsam:resolve-ready' || event.data?.type==='agentsam:resolve-portal-ready') {connected=true;sync();}
      if(event.data?.type==='agentsam:resolve-portal-select') selectSection(event.data.key,false);
      if(event.data?.type==='agentsam:resolve-portal-route' && onNavigatePage){
        const matching=portalTemplateRoutes.find(item=>item.path===event.data.route);
        if(matching && portalPage?.slug!==matching.slug) onNavigatePage(matching.slug);
      }
      if(event.data?.type==='agentsam:resolve-select') selectSection(event.data.key,false);
      if(event.data?.type==='agentsam:resolve-notice')note(event.data.message||'Local preview form submission disabled.');
      if(event.data?.type==='agentsam:resolve-detected' || event.data?.type==='agentsam:resolve-portal-detected') {
        available=event.data.available||{};renderSections();
        if(selectionType==='section')renderInspector();
      }
    });
    try{
      const response=await fetch('/api/admin/cms/resolve-portal/templates',{credentials:'same-origin'});
      if(response.ok){
        const data=await response.json();
        portalTemplateRoutes=Array.isArray(data.templates)?data.templates:[];
      }
    }catch(_){}
    try {
      var response=await fetch('/api/admin/cms/embed-catalog',{credentials:'same-origin'});
      if(!response.ok)throw Error('Manifest catalog unavailable');
      var data=await response.json();
      catalog=Array.isArray(data.apps)?data.apps:[];
    } catch(error) {
      catalog=[];note('App manifest catalog could not be loaded: '+error.message);
    }
    drawCatalog('');
    renderSections();renderInspector();sync();
  }
  window.AgentSamResolveStudio={
    mount:mount,
    renderSections:renderSections,
    renderInspector:renderInspector,
    sync:sync,
    selectSection:selectSection,
    selectApp:selectApp,
    setPage:setPage,
    pagePath:pagePath,
    registerNavigator:function(callback){onNavigatePage=callback;},
    getConfiguration:function(){return JSON.parse(JSON.stringify({records:records,sections:sectionSettings}));}
  };
})();
