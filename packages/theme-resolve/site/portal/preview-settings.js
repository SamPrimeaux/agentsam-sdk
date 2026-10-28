/* Resolve local editor theme controls. Preview-only, no server effects. */
(function(){
'use strict';
const fonts=['Geist','Cormorant Garamond','Inter','Georgia','Arial','Theme default'];
const isHex=value=>/^#[0-9a-fA-F]{6}$/.test(String(value));
const hex=(value,fallback)=>isHex(value)?value:fallback;
const num=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const font=value=>fonts.includes(value)&&value!=='Theme default' ? '"'+value+'"' : 'inherit';
const safeCss=css=>{
  if(typeof css!=='string'||css.length>8000||/@import\b|@font-face\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|<\/style|[\x00-\x08\x0b\x0e-\x1f]/i.test(css))return '';
  let depth=0;
  for(const char of css){if(char==='{')depth++;if(char==='}')depth--;if(depth<0||depth>12)return '';}
  return depth?'':css;
};
let element=null;
function apply(settings){
  const v=settings&&typeof settings==='object'&&!Array.isArray(settings)?settings:{};
  const h=(key,fallback)=>hex(v[key],fallback);
  const n=(key,initial,low,high)=>num(v[key],initial,low,high);
  const ratio={Portrait:'4/5',Square:'1/1',Landscape:'3/2'}[v['cards.ratio']]||'4/5';
  const width={Narrow:920,Standard:1160,Wide:1480,Full:1900}[v['page.width']]||1480;
  const columns=['2','3','4'].includes(String(v['cards.columns']))?String(v['cards.columns']):'3';
  const line={Tight:1.25,Normal:1.5,Relaxed:1.75}[v['type.line']]||1.5;
  const variables={
    '--rts-page':h('page.background','#ffffff'),
    '--rts-ink':h('palette.ink','#0b0b0b'),
    '--rts-paper':h('palette.paper','#f8f7f5'),
    '--rts-muted':h('palette.muted','#777777'),
    '--rts-border':h('palette.border','#e8e8e8'),
    '--rts-accent':h('palette.accent','#8b181b'),
    '--rts-dark':h('palette.dark','#0b0b0b'),
    '--rts-body-font':font(v['type.body']||'Geist'),
    '--rts-heading-font':font(v['type.heading']||'Geist'),
    '--rts-base-size':n('type.base',14,11,21)+'px',
    '--rts-heading-track':(n('type.letterSpacing',6,0,22)/100)+'em',
    '--rts-head-scale':n('type.headingScale',100,70,160)/100,
    '--rts-content':width+'px',
    '--rts-grid-cols':columns,
    '--rts-card-gap':n('cards.gap',20,6,48)+'px',
    '--rts-img-ratio':ratio,
    '--rts-button-bg':h('buttons.primaryBg','#0b0b0b'),
    '--rts-button-fg':h('buttons.primaryText','#ffffff'),
    '--rts-button-radius':n('buttons.radius',2,0,40)+'px',
    '--rts-button-height':n('buttons.height',45,34,64)+'px',
    '--rts-input-bg':h('inputs.background','#ffffff'),
    '--rts-input-border':h('inputs.border','#d8d8d8'),
    '--rts-input-text':h('inputs.text','#111111'),
    '--rts-input-radius':n('inputs.radius',2,0,30)+'px',
    '--rts-input-height':n('inputs.height',46,36,64)+'px',
    '--rts-modal-bg':h('overlays.background','#141414'),
    '--rts-modal-text':h('overlays.text','#ffffff'),
    '--rts-modal-radius':n('overlays.radius',6,0,32)+'px',
    '--rts-modal-width':n('overlays.width',420,280,720)+'px',
    '--rts-badge-bg':h('badges.background','#0b0b0b'),
    '--rts-badge-fg':h('badges.text','#ffffff'),
    '--rts-sale':h('prices.sale','#8b181b')
  };
  const root=document.documentElement;
  for(const [key,value] of Object.entries(variables))root.style.setProperty(key,value);
  const styles=[
    'body:has(.rp-page){background:var(--rts-page);color:var(--rts-ink);font-family:var(--rts-body-font);font-size:var(--rts-base-size);line-height:'+line+'}',
    '.rp-page{background:var(--rts-page);color:var(--rts-ink)}',
    '.rp-container{max-width:var(--rts-content)}',
    '.rp-serif,.rp-subheading,.rp-panel h2{font-family:var(--rts-heading-font);letter-spacing:var(--rts-heading-track)}',
    '.rp-eyebrow,.rp-logo-mark{color:var(--rts-accent)}',
    '.rp-serif{font-size:clamp(32px,calc(5vw * '+n('type.headingScale',100,70,160)/100+'),100px)}',
    '.rp-nav{background:var(--rts-dark);position:'+(v['page.stickyHeader']===false?'relative':'sticky')+'}',
    '.rp-btn,.rp-btn.light,.rp-btn.ghost,.rp-product-actions button{border-radius:var(--rts-button-radius);min-height:var(--rts-button-height)}',
    '.rp-btn{background:var(--rts-button-bg);color:var(--rts-button-fg)}',
    '.rp-products{gap:var(--rts-card-gap);grid-template-columns:repeat(var(--rts-grid-cols),minmax(0,1fr))}',
    '.rp-product-art{aspect-ratio:var(--rts-img-ratio);height:auto}',
    '.rp-glass-card{border-radius:var(--rts-modal-radius)}',
    '.rp-field input,.rp-search-form input{border-radius:var(--rts-input-radius);min-height:var(--rts-input-height);border-color:var(--rts-input-border)}',
    '.rp-field input{background:var(--rts-input-bg);color:var(--rts-input-text)}',
    '.rp-muted,.rp-panel p{color:var(--rts-muted)}',
    '.rp-panel,.rp-summary{border-color:var(--rts-border)}',
    '.rp-canvas-badge{background:var(--rts-badge-bg);color:var(--rts-badge-fg)}',
    '.rp-added-section{padding-top:'+n('page.top',64,16,130)+'px!important;padding-bottom:'+n('page.top',64,16,130)+'px!important}',
    '#root{font-family:var(--rts-body-font)}',
    '#root main button{border-radius:var(--rts-button-radius)}',
    '.rs-embed-panel{border-radius:var(--rts-modal-radius);max-width:var(--rts-modal-width)}',
    '#root input:not([type="checkbox"]):not([type="radio"]){min-height:var(--rts-input-height)}',
    '@media(max-width:800px){.rp-products{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media(max-width:520px){.rp-products{grid-template-columns:1fr}}',
    '@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}'
  ];
  if(v['motion.enabled']===false)styles.push('.rp-collection-card *,.rp-product *{transition:none!important;animation:none!important}');
  if(v['motion.hover']==='None'||v['cards.hover']==='None')styles.push('.rp-collection-card:hover img,.rp-product:hover img{transform:none!important}');
  if(v['search.enabled']===false)styles.push('.rp-search-link{display:none!important}');
  if(v['cards.quickAdd']===false)styles.push('.rp-product-actions [data-action="add-cart"]{display:none!important}');
  if(v['cards.description']===false)styles.push('.rp-product-info p{display:none!important}');
  if(v['inputs.labels']===false)styles.push('.rp-field label{font-size:0!important}');
  const custom=safeCss(v['css.source']);
  if(custom)styles.push(custom);
  if(!element){element=document.createElement('style');element.id='agentsam-resolve-theme-settings';document.head.append(element);}
  element.textContent=styles.join('\n');
}
window.ResolveThemeSettingsPreview={apply,safeCss};
})();
