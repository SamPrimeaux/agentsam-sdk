/* Resolve Theme Studio: merchant-facing, schema-driven local draft settings.
 * All values are edits to the EXISTING Resolve studio local configuration.
 * No unapproved CMS/Stripe/D1 mutation. No duplicated theme registry.
 */
(() => {
  'use strict';
  if(new URLSearchParams(location.search).get('showcase')!=='resolve')return;
  const root=document.querySelector('[data-drawer-panel="theme-settings"]');
  const studio=window.AgentSamResolveStudio;
  if(!root||!studio)return;
  const entry=(key,label,type,initial,extra={})=>({key,label,type,initial,...extra});
  const color=(k,l,v)=>entry(k,l,'color',v);
  const slider=(k,l,v,min,max,unit='px')=>entry(k,l,'range',v,{min,max,unit});
  const toggle=(k,l,v=false)=>entry(k,l,'checkbox',v);
  const list=(k,l,options,v=options[0])=>entry(k,l,'select',v,{options});
  const text=(k,l,v='',hint='')=>entry(k,l,'text',v,{hint});
  const heading=label=>({type:'heading',label});
  const hint=label=>({type:'hint',label});
  const FONT=['Theme default','Geist','Cormorant Garamond','Inter','Georgia','Arial'];
  const SPACE=['Compact','Comfortable','Spacious'];
  const RADIUS=['Sharp','Subtle','Rounded','Pill'];
  const panelDefinitions=[
    ['brand','Logo and favicon',[
      text('brand.name','Store name','RESOLVE'),
      text('brand.tagline','Brand tagline','Objects of lasting desire.'),
      text('brand.logo','Logo asset URL','', 'Use a URL from your media library.'),
      text('brand.favicon','Favicon asset URL','', 'Draft-only preview, not the browser tab icon.'),
      toggle('brand.wordmark','Show textual wordmark',true),
      slider('brand.logoWidth','Logo width',150,80,290)
    ]],
    ['palette','Color palette',[
      color('palette.canvas','Page background','#ffffff'),color('palette.ink','Primary text','#0b0b0b'),
      color('palette.accent','Accent / oxblood','#8b181b'),color('palette.paper','Light surface','#f8f7f5'),
      color('palette.muted','Secondary text','#777777'),color('palette.border','Borders','#e8e8e8'),
      color('palette.dark','Dark sections','#0b0b0b')
    ]],
    ['type','Typography',[
      list('type.body','Body font',FONT,'Geist'),list('type.heading','Heading font',FONT,'Geist'),
      list('type.accent','Editorial accent font',FONT,'Cormorant Garamond'),
      slider('type.base','Base font size',14,11,21),
      slider('type.headingScale','Heading scale',100,70,160,'%'),
      list('type.case','Heading case',['Original','Uppercase','Sentence case']),
      slider('type.letterSpacing','Heading tracking',6,0,22,'/100 em'),
      list('type.line','Body line height',['Tight','Normal','Relaxed'],'Normal')
    ]],
    ['page','Page',[
      list('page.width','Content width',['Narrow','Standard','Wide','Full'],'Wide'),
      list('page.spacing','Section rhythm',SPACE,'Comfortable'),
      slider('page.top','Section vertical padding',64,16,130),
      color('page.background','Page surface','#ffffff'),
      toggle('page.stickyHeader','Sticky navigation',true),
      toggle('page.reducedContrast','Softened backgrounds')
    ]],
    ['motion','Animations',[
      toggle('motion.enabled','Enable section motion',true),
      list('motion.hover','Card hover effect',['None','Image zoom','Lift','Fade'],'Image zoom'),
      list('motion.speed','Animation speed',['Fast','Normal','Slow'],'Normal'),
      toggle('motion.parallax','Enable background parallax',true),
      slider('motion.strength','Parallax strength',18,0,35),
      hint('Reduced-motion operating system preferences always override motion settings.')
    ]],
    ['badges','Badges',[
      list('badges.position','Product badge position',['Top left','Top right','Bottom left','Bottom right']),
      color('badges.background','Badge background','#0b0b0b'),
      color('badges.text','Badge text','#ffffff'),
      list('badges.shape','Badge corners',RADIUS,'Sharp'),
      toggle('badges.uppercase','Uppercase badges',true)
    ]],
    ['buttons','Buttons',[
      heading('Primary action'),color('buttons.primaryBg','Background','#0b0b0b'),
      color('buttons.primaryText','Text','#ffffff'),
      slider('buttons.radius','Corner radius',2,0,40),
      slider('buttons.height','Minimum height',45,34,64),
      list('buttons.case','Label case',['Original','Uppercase'],'Uppercase'),
      heading('Secondary action'),
      color('buttons.secondaryBg','Background','#ffffff'),
      color('buttons.secondaryText','Text','#0b0b0b'),
      slider('buttons.border','Border thickness',1,0,4)
    ]],
    ['cart','Cart',[
      list('cart.presentation','Cart presentation',['Cart page','Side drawer'],'Cart page'),
      toggle('cart.count','Show bag quantity',true),
      toggle('cart.note','Show order notes'),
      toggle('cart.estimatedTax','Display shipping and tax disclaimer',true),
      list('cart.cta','Checkout CTA label',['Continue to checkout','Review your order'],'Continue to checkout'),
      hint('Checkout payment is disabled in local preview; this only edits the storefront treatment.')
    ]],
    ['drawers','Drawers',[
      list('drawers.side','Drawer opens from',['Right','Left'],'Right'),
      slider('drawers.width','Drawer width',420,280,620),
      color('drawers.background','Surface','#ffffff'),
      toggle('drawers.overlay','Dim background',true),
      slider('drawers.opacity','Backdrop dimming',45,0,85,'%')
    ]],
    ['icons','Icons',[
      list('icons.style','Icon rendering',['Original outline','Thin outline','Solid'],'Original outline'),
      slider('icons.size','Toolbar icon size',20,14,34),
      toggle('icons.labels','Show text labels',true),
      color('icons.color','Icon foreground','#0b0b0b')
    ]],
    ['inputs','Input fields',[
      color('inputs.background','Input background','#ffffff'),
      color('inputs.border','Input outline','#d8d8d8'),
      color('inputs.text','Input text','#111111'),
      slider('inputs.radius','Corner radius',2,0,30),
      slider('inputs.height','Input height',46,36,64),
      toggle('inputs.labels','Show field labels',true),
      hint('Required fields and validation are controlled by the form/app embed configuration.')
    ]],
    ['overlays','Popovers and modals',[
      list('overlays.placement','Preferred popup placement',['Bottom right','Bottom left','Center'],'Bottom right'),
      color('overlays.background','Surface','#141414'),
      color('overlays.text','Content text','#ffffff'),
      slider('overlays.radius','Corner radius',6,0,32),
      slider('overlays.backdrop','Overlay dimming',65,0,90,'%'),
      slider('overlays.width','Modal width',420,280,720),
      toggle('overlays.dismiss','Allow dismiss button',true)
    ]],
    ['prices','Prices',[
      list('prices.style','Price typography',['Compact','Editorial','Prominent'],'Compact'),
      toggle('prices.currency','Display currency code'),
      toggle('prices.trailing','Show trailing decimals',true),
      color('prices.sale','Sale-price accent','#8b181b'),
      hint('The merchant catalog remains the authority for prices and currency; these are display preferences.')
    ]],
    ['cards','Product cards',[
      list('cards.columns','Desktop columns',['2','3','4'],'3'),
      list('cards.ratio','Product image ratio',['Portrait','Square','Landscape'],'Portrait'),
      list('cards.hover','Hover image behavior',['Scale image','Lift card','None'],'Scale image'),
      toggle('cards.description','Display description'),
      toggle('cards.quickAdd','Show quick add',true),
      slider('cards.gap','Card spacing',20,6,48)
    ]],
    ['search','Search',[
      toggle('search.enabled','Display storefront search',true),
      text('search.placeholder','Search placeholder','Search the archive...'),
      list('search.layout','Result display',['Grid','List'],'Grid'),
      toggle('search.suggestions','Show suggestions',true),
      slider('search.max','Suggested results',6,2,20,'items')
    ]],
    ['swatches','Swatches',[
      list('swatches.style','Color swatch style',['Circle','Square'],'Circle'),
      slider('swatches.size','Swatch size',25,14,42),
      toggle('swatches.labels','Show color names',true),
      color('swatches.selected','Selection outline','#0b0b0b')
    ]],
    ['variants','Variant pickers',[
      list('variants.layout','Selection style',['Pills','Dropdown'],'Pills'),
      toggle('variants.disabled','Show sold-out options',true),
      toggle('variants.labels','Show option labels',true),
      slider('variants.gap','Option spacing',8,0,30)
    ]],
    ['css','Custom CSS',[
      entry('css.source','Additional preview CSS','textarea','','Note: no imports, remote URLs or scripts. 8 KB maximum.')
    ]]
  ];
  const schema=new Map(panelDefinitions.flatMap(([_,__,items])=>items.filter(x=>x.key).map(field=>[field.key,field])));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const errorForCss=css=>{
    if(css.length>8000)return 'CSS is limited to 8 KB.';
    if(/@import\b|@font-face\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|<\/style|[\x00-\x08\x0b\x0e-\x1f]/i.test(css))return 'Imports, remote URLs and executable CSS are not allowed.';
    let depth=0;
    for(const char of css){if(char==='{')depth++;if(char==='}')depth--;if(depth<0||depth>12)return 'CSS braces are unbalanced.';}
    return depth?'Finish the CSS braces to apply.':'';
  };
  let active='palette';
  let values=studio.getThemeSettings();
  const getValue=(f)=>Object.hasOwn(values,f.key)?values[f.key]:f.initial;
  function control(field){
    if(field.type==='heading')return '<div class="rts-subtitle">'+escape(field.label)+'</div>';
    if(field.type==='hint')return '<p class="rts-helper">'+escape(field.label)+'</p>';
    const value=getValue(field), key=escape(field.key);
    if(field.type==='checkbox')return '<label class="rts-toggle"><span>'+escape(field.label)+'</span><input type="checkbox" data-rts-key="'+key+'" '+(value?'checked':'')+'></label>';
    if(field.type==='color')return '<label class="rts-field"><span>'+escape(field.label)+'</span><div class="rts-color-line"><input type="color" data-rts-key="'+key+'" value="'+escape(value)+'"><output>'+escape(value)+'</output></div></label>';
    if(field.type==='range')return '<label class="rts-field"><span>'+escape(field.label)+'</span><div class="rts-range-line"><input type="range" data-rts-key="'+key+'" min="'+field.min+'" max="'+field.max+'" value="'+escape(value)+'"><output>'+escape(value)+escape(field.unit)+'</output></div></label>';
    if(field.type==='select')return '<label class="rts-field"><span>'+escape(field.label)+'</span><select data-rts-key="'+key+'">'+field.options.map(o=>'<option value="'+escape(o)+'" '+(o===value?'selected':'')+'>'+escape(o)+'</option>').join('')+'</select></label>';
    if(field.type==='textarea')return '<label class="rts-field"><span>'+escape(field.label)+'</span><textarea data-rts-key="'+key+'" rows="9" spellcheck="false">'+escape(value)+'</textarea><small>'+escape(field.hint||'')+'</small><span class="rts-field-error" data-rts-error></span></label>';
    return '<label class="rts-field"><span>'+escape(field.label)+'</span><input data-rts-key="'+key+'" type="text" maxlength="300" value="'+escape(value)+'"><small>'+escape(field.hint||'')+'</small></label>';
  }
  function render(){
    const open=active;
    root.innerHTML='<div class="rts-root"><div class="rts-header"><div><strong>Theme settings</strong><span>Resolve · Local draft appearance</span></div><span class="rts-status">Preview</span></div>'+
      '<p class="rts-intro">Shape your storefront globally. Supported controls update the storefront preview immediately. Other values remain local drafts until their component is connected.</p>'+
      '<div class="rts-accordion">'+panelDefinitions.map(([key,label,items])=>'<section class="rts-category">'+
        '<button class="rts-category-toggle" type="button" data-rts-panel="'+key+'" aria-expanded="'+(open===key)+'" aria-controls="rts-body-'+key+'"><span>'+escape(label)+'</span><span class="rts-chevron">⌄</span></button>'+
        '<div class="rts-category-body" id="rts-body-'+key+'" '+(open===key?'':'hidden')+'>'+items.map(control).join('')+'</div></section>').join('')+'</div>'+
      '<div class="rts-footer"><button type="button" data-rts-copy>Copy theme settings JSON</button><button type="button" data-rts-reset>Reset all overrides</button>'+
      '<p role="status" data-rts-note>These are local draft settings. Payment, authentication and D1 are not connected.</p></div></div>';
    root.querySelectorAll('[data-rts-panel]').forEach(btn=>btn.addEventListener('click',()=>{
      const was=active===btn.dataset.rtsPanel;active=was?'':btn.dataset.rtsPanel;render();
      if(!was)root.querySelector('[data-rts-panel="'+active+'"]')?.focus({preventScroll:true});
    }));
    root.querySelectorAll('[data-rts-key]').forEach(input=>{
      const type=input.type==='checkbox'?'change':input.tagName==='SELECT'?'change':'input';
      input.addEventListener(type,()=>{
        const key=input.dataset.rtsKey,field=schema.get(key);
        if(!field)return;
        let next=input.type==='checkbox'?input.checked:field.type==='range'?Number(input.value):input.value;
        if(field.type==='color'&&!/^#[0-9a-f]{6}$/i.test(next))return;
        if(field.type==='select'&&!field.options.includes(next))return;
        if(field.type==='range')next=Math.max(field.min,Math.min(field.max,next));
        if(field.type==='textarea'){
          const error=errorForCss(next);
          input.setAttribute('aria-invalid',String(!!error));
          input.parentElement.querySelector('[data-rts-error]').textContent=error;
          if(error)return;
        }
        values[key]=next;
        if(!studio.updateThemeSettings(values)){
          root.querySelector('[data-rts-note]').textContent='Unable to save local draft. No changes were applied.';return;
        }
        const out=input.closest('label')?.querySelector('output');
        if(out)out.textContent=String(next)+(field.type==='range'?field.unit:'');
        const note=root.querySelector('[data-rts-note]');
        if(note)note.textContent='Applied to preview · Stored in local draft (not published)';
      });
    });
    root.querySelector('[data-rts-reset]')?.addEventListener('click',()=>{
      if(!window.confirm('Reset all Resolve theme overrides in this browser?'))return;
      values={};studio.updateThemeSettings(values);render();
    });
    root.querySelector('[data-rts-copy]')?.addEventListener('click',()=>{
      const json=JSON.stringify({theme:'resolve',preview_only:true,themeSettings:values},null,2);
      navigator.clipboard?.writeText(json).then(()=>{
        root.querySelector('[data-rts-note]').textContent='Theme settings JSON copied.';
      }).catch(()=>{root.querySelector('[data-rts-note]').textContent='Clipboard access denied.';});
    });
  }
  render();
  window.ResolveThemeSettingsPanel={render,definitions:panelDefinitions,getState:()=>({...values}),cssError:errorForCss};
})();
