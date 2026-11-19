/** Neutral, site-scoped chrome for an editable starter project. */
const field = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const editor = (key, blocks = [], enabled = true) => ({
  templateKey: key, visibility: { enabled }, blocks,
});
const section = (key, name, zone, sourceKind, markup, fields, blocks, content, enabled = true) => ({
  key, name, globalKey: key.replaceAll('_', '-'), zone, sourceKind, type: sourceKind,
  html: markup, status: 'draft', version: 0, sort_order: zone === 'HEADER' ? -1 : 999,
  content: { ...content, __editor: editor(key, blocks.map(b => ({ id: b.key, templateKey: b.templateKey || b.key })), enabled) },
  schema: {
    key, label: name, zone, sourceKind, fields, settings: [],
    blocks: blocks.map(({ defaults, ...block }) => ({ ...block, defaults })),
    capabilities: { reorder: false, duplicate: false, reusable: true },
  },
});

export function starterChrome(siteName) {
  const announcement = {
    key: 'announcement_1', label: 'Announcement', fields: [
      field('text', 'Message'), field('href', 'Link', { type: 'link', binding: { field: 'text', attribute: 'href' } }),
    ], settings: [],
    html: '<a class="iam-starter-announcement-link" data-theme-project-field="text" href="/"></a>',
    defaults: { text: 'Welcome to our store', href: '/' },
  };
  const announcementBar = section(
    'announcement_bar', 'Announcement bar', 'HEADER', 'announcement-bar',
    '<div class="iam-starter-announcement" aria-label="Store announcement" aria-live="polite" data-theme-project-field="rotation_seconds"><!--theme-block:announcement_1--></div>',
    [field('rotation_seconds', 'Seconds between messages', { type: 'number', binding: { attribute: 'data-interval' } })],
    [announcement], { rotation_seconds: 5, announcement_1: announcement.defaults },
  );
  const logo = {
    key: 'logo', label: 'Logo', fields: [
      field('text', 'Logo text', { group: 'Logo' }),
      field('image', 'Logo image', { type: 'media', group: 'Logo', binding: { attribute: 'src' } }),
      field('alt', 'Logo image description', { group: 'Logo', binding: { field: 'image', attribute: 'alt' } }),
    ], settings: [],
    html: '<a class="iam-starter-brand" href="/"><span data-theme-project-field="text"></span><img class="iam-starter-logo" data-theme-project-field="image" alt=""></a>',
    defaults: { text: siteName, image: '', alt: siteName },
  };
  const nav = (key, label, href) => ({
    key, templateKey: 'nav_item', label: 'Menu item', fields: [
      field('label', 'Label'), field('href', 'Link', { type: 'link', binding: { field: 'label', attribute: 'href' } }),
      field('submenu_label', 'Submenu label'), field('submenu_href', 'Submenu link',
        { type: 'link', binding: { field: 'submenu_label', attribute: 'href' } }),
      field('submenu_label_2', 'Second submenu label'), field('submenu_href_2', 'Second submenu link',
        { type: 'link', binding: { field: 'submenu_label_2', attribute: 'href' } }),
    ], settings: [],
    html: '<li class="iam-starter-nav-item"><a data-theme-project-field="label" href="/"></a><button class="iam-starter-submenu-toggle" type="button" aria-label="Open submenu" aria-expanded="false" aria-haspopup="true">⌄</button><ul class="iam-starter-submenu"><li><a data-theme-project-field="submenu_label" href="/"></a></li><li><a data-theme-project-field="submenu_label_2" href="/"></a></li></ul></li>',
    defaults: { label, href, submenu_label: '', submenu_href: '', submenu_label_2: '', submenu_href_2: '' },
  });
  const navBlocks = [nav('nav_home', 'Home', '/'), nav('nav_shop', 'Shop', '/shop'), nav('nav_about', 'About', '/about')];
  const header = section(
    'site_header', 'Header', 'HEADER', 'site-header',
    '<header class="iam-starter-header" data-theme-project-field="mobile_layout"><div class="iam-starter-header-inner"><!--theme-block:logo--><button class="iam-starter-menu-toggle" data-theme-project-field="mobile_menu_label" type="button" aria-controls="iam-starter-main-menu" aria-expanded="false" aria-label="Open menu"><span></span><span></span><span></span></button><nav class="iam-starter-nav" id="iam-starter-main-menu" aria-label="Main menu"><ul><!--theme-block:nav_home--></ul></nav></div></header>',
    [field('mobile_layout', 'Mobile logo position', { type: 'select', group: 'Mobile layout', binding: { attribute: 'data-mobile-layout' },
      options: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Center' }] }),
      field('mobile_menu_label', 'Mobile menu label', { group: 'Mobile layout', binding: { attribute: 'aria-label' } })],
    [logo, { ...navBlocks[0], key: 'nav_item' }],
    { mobile_layout: 'start', mobile_menu_label: 'Open menu', logo: logo.defaults,
      ...Object.fromEntries(navBlocks.map(block => [block.key, block.defaults])) },
  );
  // Each instance uses the same reusable menu-item template.
  header.content.__editor.blocks = [{ id: 'logo', templateKey: 'logo' },
    ...navBlocks.map(b => ({ id: b.key, templateKey: 'nav_item' }))];
  const footerLink = {
    key: 'footer_link', label: 'Footer link', fields: [
      field('label', 'Label'), field('href', 'Link', { type: 'link', binding: { field: 'label', attribute: 'href' } }),
    ], settings: [], html: '<li><a data-theme-project-field="label" href="/"></a></li>',
    defaults: { label: 'Contact', href: '/contact' },
  };
  const footer = section(
    'site_footer', 'Footer', 'FOOTER', 'site-footer',
    '<footer class="iam-starter-footer"><div class="iam-starter-footer-inner"><div><strong data-theme-project-field="store_name"></strong><p data-theme-project-field="tagline"></p></div><nav aria-label="Footer menu"><ul><!--theme-block:footer_contact--></ul></nav><small data-theme-project-field="copyright"></small></div></footer>',
    [field('store_name', 'Store name'), field('tagline', 'Tagline'), field('copyright', 'Copyright')],
    [footerLink], { store_name: siteName, tagline: 'Welcome to our store.',
      copyright: '© ' + new Date().getFullYear() + ' ' + siteName,
      footer_contact: footerLink.defaults },
  );
  footer.content.__editor.blocks = [{ id: 'footer_contact', templateKey: 'footer_link' }];
  const popup = section(
    'promotion_popup', 'Promotion popup', 'FOOTER', 'promotion-popup',
    '<aside class="iam-starter-promo" role="dialog" aria-modal="false" aria-labelledby="iam-starter-promo-title"><button class="iam-starter-promo-close" type="button" aria-label="Close offer">×</button><p data-theme-project-field="eyebrow"></p><h2 id="iam-starter-promo-title" data-theme-project-field="heading"></h2><p data-theme-project-field="description"></p><a data-theme-project-field="cta_label" href="/shop"></a></aside>',
    [field('eyebrow', 'Eyebrow'), field('heading', 'Heading'), field('description', 'Description'),
      field('cta_label', 'Button label'), field('cta_href', 'Button link',
        { type: 'link', binding: { field: 'cta_label', attribute: 'href' } })],
    [], { eyebrow: 'A little something for you', heading: 'Discover what’s new',
      description: 'Explore our latest collection.', cta_label: 'Shop now', cta_href: '/shop' }, false,
  );
  return { announcementBar, header, footer, popup };
}

export function fillMissingThemeChrome(project, siteName = 'My Store') {
  const copy = structuredClone(project);
  const chrome = starterChrome(String(siteName).trim() || 'My Store');
  for (const page of copy.pages || []) {
    const source = page.sections || [];
    const sourceMarkup = source.map(s => s.html).join(' ');
    const template = String(page.template || '');
    const has = {
      announcement: source.some(s => /announcement|ticker|promo-bar/i.test(s.sourceKind || '') ||
        /announcement|ticker|promo-bar/i.test(s.html)) ||
        /class=["'][^"']*(?:announcement|ticker|promo-bar)/i.test(template),
      header: source.some(s => s.globalKey === 'site-header' || s.sourceKind === 'site-header' || /^\s*<header\b/i.test(s.html)) ||
        /<header\b/i.test(template),
      footer: source.some(s => s.globalKey === 'site-footer' || s.sourceKind === 'site-footer' || /^\s*<footer\b/i.test(s.html)) ||
        /<footer\b/i.test(template),
      popup: /popup|modal|newsletter-overlay/i.test(sourceMarkup) ||
        /class=["'][^"']*(?:popup|newsletter-overlay)/i.test(template),
    };
    const head = [];
    if (!has.announcement) head.push(chrome.announcementBar);
    if (!has.header) head.push(chrome.header);
    const tail = [];
    if (!has.footer) tail.push(chrome.footer);
    if (!has.popup) tail.push(chrome.popup);
    if (!head.length && !tail.length) continue;
    page.sections = [...head, ...source, ...tail];
    const headMarkers = head.map(s => '<!--theme-section:' + s.key + '-->').join('');
    const tailMarkers = tail.map(s => '<!--theme-section:' + s.key + '-->').join('');
    page.template = page.template.replace(/<body([^>]*)>/i, '<body$1>' + headMarkers)
      .replace(/<\/body>/i, tailMarkers + starterChromeScript + '</body>')
      .replace(/<\/head>/i, '<style>:root{--iam-ink:#18191d;--iam-paper:#f9f8f5;--iam-display:Georgia,serif}' +
        starterChromeStyles + '</style></head>');
  }
  return copy;
}

export const starterChromeStyles = `
.iam-starter-announcement{display:flex;align-items:center;justify-content:center;min-height:38px;padding:8px 20px;background:var(--iam-ink);color:#fff;text-align:center;font-size:.8rem}
.iam-starter-announcement-link{color:inherit;text-decoration:none}.iam-starter-announcement-link:not(:first-child){display:none}.iam-starter-announcement-link:hover{text-decoration:underline}
.iam-starter-header{background:var(--iam-paper);color:var(--iam-ink);border-bottom:1px solid #dddcd6;position:relative;z-index:10}
.iam-starter-header-inner{max-width:1440px;margin:auto;display:flex;align-items:center;gap:32px;padding:18px clamp(20px,5vw,84px)}
.iam-starter-brand{font-family:var(--iam-display);font-size:1.4rem;font-weight:700;text-decoration:none;color:inherit;white-space:nowrap}
.iam-starter-logo{max-width:160px;max-height:52px;object-fit:contain}.iam-starter-logo:not([src]),.iam-starter-brand:has(.iam-starter-logo[src]) span{display:none}
.iam-starter-nav{margin-left:auto}.iam-starter-nav ul,.iam-starter-footer ul{padding:0;margin:0;list-style:none}
.iam-starter-nav>ul{display:flex;align-items:center;gap:25px}.iam-starter-nav-item{position:relative;display:flex;align-items:center}
.iam-starter-nav a,.iam-starter-footer a{color:inherit;text-decoration:none;font-size:.9rem}
.iam-starter-nav a:hover,.iam-starter-footer a:hover{text-decoration:underline}
.iam-starter-submenu-toggle{border:0;background:transparent;cursor:pointer;padding:8px;color:inherit}
.iam-starter-submenu-toggle:not(:has(+ .iam-starter-submenu a:not(:empty))){display:none}
.iam-starter-submenu{display:none;position:absolute;top:100%;left:0;min-width:180px;padding:12px!important;background:var(--iam-paper);border:1px solid #dddcd6;box-shadow:0 12px 30px #0002}
.iam-starter-submenu a:empty,.iam-starter-submenu li:has(a:empty){display:none}
.iam-starter-nav-item:hover .iam-starter-submenu:has(a:not(:empty)),.iam-starter-nav-item:focus-within .iam-starter-submenu:has(a:not(:empty)),.iam-starter-nav-item.is-open .iam-starter-submenu:has(a:not(:empty)){display:grid;gap:12px}
.iam-starter-menu-toggle{display:none;border:0;background:transparent;padding:8px;cursor:pointer;min-width:44px;min-height:44px}
.iam-starter-menu-toggle span{display:block;width:22px;height:2px;background:currentColor;margin:4px auto}
.iam-starter-footer{background:var(--iam-paper);border-top:1px solid #dddcd6;color:#55565b}
.iam-starter-footer-inner{max-width:1440px;margin:auto;padding:44px clamp(20px,5vw,84px);display:flex;align-items:start;justify-content:space-between;gap:32px;flex-wrap:wrap}
.iam-starter-footer strong{font-family:var(--iam-display);font-size:1.3rem;color:var(--iam-ink)}
.iam-starter-footer p{margin:10px 0 0}.iam-starter-footer ul{display:flex;gap:20px;flex-wrap:wrap}
.iam-starter-footer small{flex-basis:100%;padding-top:20px;border-top:1px solid #dddcd6}
.iam-starter-promo{display:none;position:fixed;right:24px;bottom:24px;z-index:100;background:var(--iam-paper);color:var(--iam-ink);border:1px solid #d9d9d4;box-shadow:0 22px 60px #0003;width:min(390px,calc(100vw - 32px));padding:26px}
.iam-starter-promo.is-open{display:block}.iam-starter-promo-close{position:absolute;right:12px;top:10px;border:0;background:none;font-size:24px;cursor:pointer}
.iam-starter-promo p:first-of-type{text-transform:uppercase;font-size:.7rem;letter-spacing:.14em}
.iam-starter-promo h2{font:500 1.8rem/1.15 var(--iam-display);margin:12px 0}
.iam-starter-promo>a{display:inline-flex;margin-top:12px;background:var(--iam-ink);color:#fff;padding:10px 18px;text-decoration:none}
@media(max-width:680px){.iam-starter-header-inner{gap:12px;flex-wrap:wrap;padding:12px 20px}.iam-starter-menu-toggle{display:block;margin-left:auto}.iam-starter-nav{display:none;flex-basis:100%;margin:0}.iam-starter-nav.is-open{display:block}.iam-starter-nav>ul{display:grid;gap:0}.iam-starter-nav-item{display:block;border-top:1px solid #dddcd6;padding:8px 0}.iam-starter-header[data-mobile-layout="center"] .iam-starter-brand{margin-left:44px}.iam-starter-header[data-mobile-layout="center"] .iam-starter-menu-toggle{margin-left:auto}.iam-starter-submenu{position:static;border:0;box-shadow:none;padding:8px 14px!important}.iam-starter-nav-item:not(.is-open) .iam-starter-submenu{display:none}.iam-starter-footer-inner{display:grid;padding:34px 20px}.iam-starter-footer small{grid-column:1}.iam-starter-promo{right:16px;bottom:16px}}
`;
export const starterChromeScript = `<script>
document.addEventListener('click',function(event){
  const menuButton=event.target.closest('.iam-starter-menu-toggle');
  if(menuButton){const nav=document.getElementById('iam-starter-main-menu');const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close menu':'Open menu');nav?.classList.toggle('is-open',open);return}
  const submenuButton=event.target.closest('.iam-starter-submenu-toggle');
  if(submenuButton){const item=submenuButton.closest('.iam-starter-nav-item');const open=!item?.classList.contains('is-open');item?.classList.toggle('is-open',open);submenuButton.setAttribute('aria-expanded',String(open));return}
  if(event.target.closest('.iam-starter-promo-close')){document.querySelector('.iam-starter-promo')?.classList.remove('is-open');try{sessionStorage.setItem('iam-starter-promo-dismissed','1')}catch{}}
});
document.addEventListener('keydown',function(event){if(event.key==='Escape'){document.querySelector('.iam-starter-nav')?.classList.remove('is-open');document.querySelector('.iam-starter-menu-toggle')?.setAttribute('aria-expanded','false');document.querySelector('.iam-starter-promo')?.classList.remove('is-open')}});
document.querySelectorAll('.iam-starter-announcement').forEach(function(bar){
  const messages=[...bar.querySelectorAll('.iam-starter-announcement-link')];
  if(messages.length<2)return;
  let current=0;
  const seconds=Math.min(30,Math.max(2,Number(bar.dataset.interval)||5));
  setInterval(function(){messages[current].style.display='none';current=(current+1)%messages.length;messages[current].style.display='inline'},seconds*1000);
});
const promo=document.querySelector('.iam-starter-promo');
if(promo){let dismissed=false;try{dismissed=sessionStorage.getItem('iam-starter-promo-dismissed')==='1'}catch{}if(!dismissed)promo.classList.add('is-open')}
<\/script>`;
