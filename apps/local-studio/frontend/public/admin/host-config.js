/**
 * Local Studio's navigation data for the original Ecommerce Console renderer.
 * The approved product shell.js and console.css remain entirely unmodified.
 */
(function () {
  if (typeof NAV === "undefined" || typeof renderSideNav !== "function") return;

  // Platform destinations remain top-level. Installed commerce capabilities
  // reuse the original Console hierarchy rather than becoming a flat site list.
  const desktopHost = window.parent !== window ? window.parent?.agentsamConsoleHost : null;
  const desktop = Boolean(window.__AGENTSAM_DESKTOP__ || desktopHost);
  if (desktopHost) {
    window.__AGENTSAM_DESKTOP__ = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const request = new Request(input, init);
      const url = new URL(request.url, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/admin/')) return originalFetch(input, init);
      return desktopHost.request(request);
    };
  }
  // The top-level native workbench hydrates from its existing shared identity
  // store; do not race it with a cookie fetch against the static Tauri origin.
  if (desktop && !desktopHost && typeof loadShellUser === 'function') {
    loadShellUser = async function () { return window.__shellUser || null; };
  }
  // Hosted AgentSam uses the real CMS project installer in Theme Store.
  // Standalone Ecommerce customers keep their own install adapters.
  window.__AGENTSAM_THEME_STORE_URL = "/themes";
  if (window.location?.pathname === "/sites") {
    const updateThemeEntry = () => {
      const browse = document.getElementById("browse-themes-shortcut");
      if (browse) browse.href = "/themes";
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", updateThemeEntry, { once: true });
    else updateThemeEntry();
  }
  // This host consumes the curated navigation projection, not the route catalog.
  const main = [], channels = [], apps = [];
  // Growth is an installed product view. Its platform appearance is an
  // additive token override, not an edit to the customer's themed CSS.
  if (window.location?.pathname === "/admin/growth" &&
      !document.querySelector('link[data-agentsam-growth-host]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/console-growth-host.css";
    stylesheet.dataset.agentsamGrowthHost = "true";
    document.head.appendChild(stylesheet);
  }
  NAV.main.splice(0, NAV.main.length, ...main);
  NAV.channels.splice(0, NAV.channels.length, ...channels);
  NAV.apps.splice(0, NAV.apps.length, ...apps);
  // Installed apps are projected from the host manifest, never assumed from a menu fixture.
  NAV.apps.splice(0, NAV.apps.length);
  if (typeof window.fetch === 'function') window.fetch('/admin/data/navigation.json', {credentials:'same-origin'})
    .then(response => { if (!response.ok) throw new Error('Application navigation unavailable'); return response.json(); })
    .then(data => {
      if (data.schema !== 'agentsam.host-navigation.v1' || !Array.isArray(data.apps)) throw new Error('Invalid application navigation');
      const inHostedAppFrame = Boolean(window.parent && window.parent !== window && !desktopHost);
      NAV.main.splice(0, NAV.main.length, ...(data.primary || []).map(item =>
        inHostedAppFrame && item.id === 'home'
          ? { ...item, href: '/admin/home?__agentsamEmbedded=1' }
          : item));
      NAV.channels.splice(0, NAV.channels.length, ...(data.channels || []));
      NAV.utilities = data.utilities || [];
      NAV.apps.splice(0, NAV.apps.length, ...data.apps.map(app => ({id:app.id,href:app.href,label:app.label,icon:app.icon})));
      updateSharedNavigation();
    }).catch(error => console.error('[navigation/apps]', error));
  const originalSideNav = renderSideNav;
  renderSideNav = function (active, userNav, options) {
    return originalSideNav(active, userNav, options)
      .replace('<strong>Fuel &amp; Free Time</strong>', '<strong data-profile-name>Account</strong>')
      .replace('href="/admin/account"', 'href="/settings/general"')
      .replace('href="/admin/preferences" class="console-menu-item"', 'href="/settings/integrations" class="console-menu-item"')
      .replace('Store preferences</a>', 'Integrations</a>')
      .replace('Account &amp; password</a>', 'Account settings</a>')
      .replace('<button class="admin-logout-btn" type="button">Log out</button>', '<a href="/settings/general" class="admin-logout-btn">Account settings</a>')
      .replaceAll("https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ad23b2d9-e2e4-4ad6-eb81-9e4c983df000/thumbnail", "/brand/agentsam-gorilla/v1/pet/animated/ledge-idle.gif");
  };
  // The hosted Ecommerce Console and React Local Studio must read the same
  // user-selected shell colorway. Do not mutate the customer Console package.
  // This adapter runs after shell.js and before renderShell on packaged pages.
  function preferredDashboardAppearance() {
    try {
      const value = JSON.parse(localStorage.getItem("agentsam-shell-appearance-v1") || "null");
      if (!value || !["light", "dark", "system"].includes(value.theme)) return null;
      const mode = value.theme === "system"
        ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : value.theme;
      const accent = /^#[0-9a-f]{6}$/i.test(value.accent || "") ? value.accent : null;
      return { mode, accent };
    } catch { return null; }
  }
  // Some embedded hosts intentionally mock only the navigation primitives.
  // In those hosts do not create a second theme engine or assume shell.js APIs.
  if (typeof readConsoleAppearance === "function" &&
      typeof applyConsoleAppearance === "function") {
    const originalReadAppearance = readConsoleAppearance;
    const originalApplyAppearance = applyConsoleAppearance;
    readConsoleAppearance = function () {
      return preferredDashboardAppearance()?.mode || originalReadAppearance();
    };
    applyConsoleAppearance = function (value) {
      const preferred = preferredDashboardAppearance();
      const mode = originalApplyAppearance(preferred?.mode || value);
      const root = document.documentElement;
      // Reapplying a mode must also clear previous custom accent overrides.
      for (const key of ["--c-accent", "--c-accent-ink", "--c-focus"]) root.style.removeProperty(key);
      if (preferred?.accent) {
        root.style.setProperty("--c-accent", preferred.accent);
        root.style.setProperty("--c-accent-ink", "#ffffff");
        root.style.setProperty("--c-focus", preferred.accent);
      }
      return mode;
    };
    window.addEventListener("agentsam:shell-appearance", () =>
      applyConsoleAppearance(readConsoleAppearance()));
    window.addEventListener("storage", (event) => {
      if (event.key === "agentsam-shell-appearance-v1")
        applyConsoleAppearance(readConsoleAppearance());
    });
  }
  // Host composition only: the same published Nav components used by Studio.
  let sharedNavigation = null;
  let sharedNavReady = null;
  let appearanceModule = null;
  let sharedAppearance = null;
  let appearanceAccount = null;
  let appearanceRevision = 0;
  let accountTheme = null;
  let navigationMountRevision = 0;
  function acceptShellAppearance(appearance) {
    if (!appearance?.tokens || !['light','dark'].includes(appearance.theme)) return;
    sharedAppearance = appearance;
    appearanceModule?.applyStudioShellAppearance(appearance, document.documentElement);
    sharedNavigation?.update(appearance);
  }
  async function refreshAccountAppearance(user) {
    // React routes own their existing theme request; static Console routes use
    // the same projection and authenticated endpoint through this host adapter.
    if (!appearanceModule || document.getElementById('agentsam-host-workspace')) return;
    const account = (user || window.__shellUser)?.id || null;
    if (appearanceAccount === account) return;
    appearanceAccount = account;
    accountTheme = null;
    const revision = ++appearanceRevision;
    const preference = preferredDashboardAppearance();
    const fallback = { theme:preference?.mode || document.documentElement.dataset.theme, accentColor:preference?.accent };
    acceptShellAppearance(appearanceModule.projectStudioShellAppearance(null, fallback));
    if (!account) return;
    try {
      const response = await fetch('/api/studio/themes', {credentials:'same-origin'});
      if (!response.ok) throw new Error('Theme registry unavailable');
      const data = await response.json();
      if (revision !== appearanceRevision) return;
      const active = data.themes?.find(theme => String(theme.id) === String(data.activeThemeId));
      accountTheme = active || null;
      acceptShellAppearance(appearanceModule.projectStudioShellAppearance(active, fallback));
    } catch (error) { console.warn('[navigation/theme]', error); appearanceAccount = null; }
  }
  let sharedNavPath = (window.location?.pathname || '/admin/home') + (window.location?.search || '');
  const originalHydrateNav = typeof hydrateShellNav === 'function' ? hydrateShellNav : null;
  // Static product pages read the existing Studio conversation persistence only.
  // Writes remain with Studio's Work store; the React host supplies its live callbacks.
  let registeredProjects = [], projectHistoryStatus = 'loading';
  async function refreshWorkspaceProjects() {
    projectHistoryStatus='loading';updateSharedNavigation();
    try {
      const response=await fetch('/api/work/snapshot?surface=projects',{credentials:'same-origin'});
      if(!response.ok)throw new Error('Project registry unavailable');
      const payload=await response.json();
      if(!Array.isArray(payload.snapshot?.projects))throw new Error('Project registry unavailable');
      registeredProjects=payload.snapshot.projects;projectHistoryStatus='ready';
    } catch {projectHistoryStatus='error';}
    updateSharedNavigation();
  }
  function updateStoredTrail(id, transform) {
    try {
      const saved = JSON.parse(window.localStorage.getItem('agentsam-work-v1') || 'null');
      if (!saved?.state || !Array.isArray(saved.state.trails)) return false;
      let found = false;
      saved.state.trails = saved.state.trails.map(trail => {
        if (trail.id !== id) return trail;
        found = true;
        return transform(trail);
      });
      if (!found) return false;
      window.localStorage.setItem('agentsam-work-v1', JSON.stringify(saved));
      window.dispatchEvent(new CustomEvent('agentsam:workspace-navigation'));
      return true;
    } catch { return false; }
  }
  async function patchRegisteredProject(id, patch, failureMessage) {
    try {
      const response = await fetch('/api/projects/' + encodeURIComponent(id), {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch)
      });
      if (!response.ok) throw new Error('Project update failed (' + response.status + ')');
      await refreshWorkspaceProjects();
      return true;
    } catch (error) {
      console.error('[workspace-navigation] project update failed', error);
      window.alert(failureMessage);
      return false;
    }
  }
  function workspaceNavigation() {
    if(window.__agentsamWorkspaceNavigation)return window.__agentsamWorkspaceNavigation;
    let trails=[];
    try {const saved=JSON.parse(localStorage.getItem('agentsam-work-v1') || 'null');trails=Array.isArray(saved?.state?.trails)?saved.state.trails:[];}catch{/* Unavailable persistence has an honest empty state. */}
    return {
      projects:registeredProjects.map(item=>{const updatedAt=Date.parse(item.updatedAt || '');return {id:item.id,name:item.name,pinned:item.starred,updatedAt:Number.isFinite(updatedAt)?updatedAt:undefined};}),
      conversations:trails.filter(item=>item.id!=='trail-studio'||item.messages?.some(message=>message.role==='user')).map(item=>({id:item.id,title:item.title,projectId:item.workProjectId,pinned:item.pinned,updatedAt:item.updatedAt})),
      historyStatus:projectHistoryStatus,onRetryHistory:refreshWorkspaceProjects,
      onSelectConversation:id=>navigateHost('/chats/'+encodeURIComponent(id)),
      onSelectProject:id=>navigateHost('/admin/projects/'+encodeURIComponent(id)),
      onPinConversation:id=>{
        if (!updateStoredTrail(id, trail=>({...trail,pinned:!trail.pinned}))) window.alert('Conversation pin could not be saved. Please retry.');
      },
      onRenameConversation:(id,title)=>{
        const normalized=String(title || '').trim();
        if (!normalized) return;
        if (!updateStoredTrail(id, trail=>({...trail,title:normalized,updatedAt:Date.now()}))) window.alert('Conversation name could not be saved. Please retry.');
      },
      onPinProject:id=>{
        const selected=registeredProjects.find(item=>item.id===id);
        if (selected) void patchRegisteredProject(id,{starred:!selected.starred},'Project pin could not be saved. Please retry.');
      },
      onRenameProject:(id,name)=>{
        const normalized=String(name || '').trim();
        if (normalized) void patchRegisteredProject(id,{name:normalized},'Project name could not be saved. Please retry.');
      },
    };
  }
  function navigationValue(user) {
    const profile = user || window.__shellUser || {};
    const toDestination = (item, index) => ({
      id: item.id || item.href || String(index), label: item.label, href: item.href,
      icon: item.icon ? window.AgentSamNav?.navIcon?.(({agentic:'agentsam',email:'mail',messageSquare:'agentsam',box:'cad',film:'moviemode',globe:'browser'})[item.icon] || item.icon) : undefined,
      children: item.children?.map(toDestination)
    });
    const nav = buildUserNav(profile);
    return {
      pathname: sharedNavPath.startsWith('/admin/products/help/artwork') ? '/docs' : sharedNavPath, showHistory: true, showSidebarHeader: false, newConversationAfter:'home',
      ...workspaceNavigation(),
      ...(sharedNavPath.startsWith('/settings') ? {breadcrumbs:[{id:'settings',label:'Settings',href:'/settings/general'}]} : {}),
      ...(sharedNavPath.startsWith('/admin/products/help/artwork') ? {breadcrumbs:[{id:'docs',label:'Docs',href:'/docs'},{id:'artwork-guide',label:'Artwork Help'}]} : {}),
      brand: { name: 'AgentSam', logo: '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg', home: '/admin/home' },
      destinations: [...nav.main, { id: 'sales-channels', label: 'Sales channels', icon: 'store', children: nav.channels },
        { id: 'installed-apps', label: 'Apps', icon: 'apps', children: nav.apps }, ...(nav.utilities || [])].map(toDestination),
      account: { id: profile.id || 'local', name: profile.id ? profile.display_name || profile.email || 'Account' : 'Local account',
        avatar: safeAvatarUrl(profile.avatar_url) || '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg', plan: profile.id ? profile.email || 'Personal workspace' : 'Sign in required' },
      accountActions: [
        { id:'account',label:'Account',onSelect:() => navigateHost('/settings/general') },
        { id:'settings',label:'Settings',onSelect:() => navigateHost('/settings/general') },
        ...(!profile.id ? [{id:'sign-in',label:'Sign in',onSelect:() => navigateHost('/auth/login')}] : profile.can_sign_out === false ? [] : [{
          id:'sign-out',label:'Sign out',separatorBefore:true,onSelect:async () => {
            if (window.__agentsamSignOut) { await window.__agentsamSignOut(); return; }
            const response=await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin'});
            if(response.ok) window.location.assign('/auth/login');
            else window.alert('Sign out could not be completed. Please try again.');
          }
        }])
      ],
      onNavigate: navigateHost
    };
  }
  function navigateHost(href) {
    if (desktopHost) desktopHost.navigate(href);
    else if (desktop) window.location.hash = '#' + href;
    else if (document.querySelector('#agentsam-host-workspace .agentsam-shell')) window.dispatchEvent(new CustomEvent('agentsam:navigate', {detail:{to:href}}));
    else {
      const link = document.createElement('a'); link.href = href;
      document.body.appendChild(link); link.click(); link.remove();
    }
  }
  function loadSharedNavigation() {
    if (sharedNavReady) return sharedNavReady;
    sharedNavReady = new Promise((resolve, reject) => {
      if (!document.getElementById('agentsam-shared-nav-css')) {
        const css = document.createElement('link'); css.id = 'agentsam-shared-nav-css';
        css.rel = 'stylesheet'; css.href = '/admin/css/agentsam-nav.css'; document.head.appendChild(css);
        const hostCss = document.createElement('link'); hostCss.rel = 'stylesheet';
        hostCss.href = '/admin/css/shared-nav-host.css'; document.head.appendChild(hostCss);
      }
      if (window.AgentSamNav) { resolve(); return; }
      const script = document.createElement('script'); script.src = '/admin/js/agentsam-nav.js';
      script.onload = () => resolve(); script.onerror = () => reject(new Error('Navigation could not load'));
      document.head.appendChild(script);
    });
    return sharedNavReady;
  }
  async function mountSharedNavigation() {
    const revision = ++navigationMountRevision;
    await loadSharedNavigation();
    if (revision !== navigationMountRevision) return;
    const aside = document.querySelector('.console-sidenav.admin-sidebar');
    if (!aside || document.body.dataset.shellMode === 'theme-editor') return;
    appearanceModule = await import('/admin/js/shell-appearance.mjs');
    if (revision !== navigationMountRevision || !aside.isConnected) return;
    sharedNavigation?.unmount();
    aside.replaceChildren(); aside.classList.remove('is-collapsed');
    document.body.classList.add('agentsam-shared-navigation', 'admin-dock-off');
    const leading = document.querySelector('.console-topbar-spacer');
    if (leading) {
      leading.removeAttribute('aria-hidden');
      leading.innerHTML = '<button type="button" class="console-icon-btn" data-shared-nav-toggle aria-label="Toggle sidebar" title="Toggle sidebar">' + icon('textAlignStart') + '</button><div class="console-route-label"></div>';
    }
    sharedNavigation = window.AgentSamNav.mountNav({
      breadcrumbs: leading?.querySelector('.console-route-label'),
      sidenav: aside, value: navigationValue(), resizable: true,
      stateStore: window.__agentsamNavigationStore,
      onStateChange: ({open}) => leading?.querySelector('[data-shared-nav-toggle]')?.setAttribute('aria-expanded', String(open)),
      storageKey: 'agentsam-nav:' + (window.__shellUser?.id || 'local'),
      ...(sharedAppearance || appearanceModule.projectStudioShellAppearance(null, {theme:document.documentElement.dataset.theme || readConsoleAppearance(), accentColor:preferredDashboardAppearance()?.accent}))
    });
    window.__agentsamNavigationStore = sharedNavigation.stateStore;
    window.dispatchEvent(new Event('agentsam:navigation-ready'));
    updateSharedNavigation();
    if (!window.__agentsamWorkspaceNavigation) void refreshWorkspaceProjects();
  }
  function updateSharedNavigation(user) {
    sharedNavigation?.update({ value: navigationValue(user), ...(sharedAppearance || {theme:document.documentElement.dataset.theme || readConsoleAppearance()}), storageKey: 'agentsam-nav:' + ((user || window.__shellUser)?.id || 'local') });
    void refreshAccountAppearance(user);
  }
  if (typeof renderShell === 'function') {
    const originalRender = renderShell;
    renderShell = function (active, html, options) {
      sharedNavigation?.unmount(); sharedNavigation = null;
      sharedNavPath = (active || window.location.pathname) + (active?.includes('?') ? '' : window.location.search);
      const result = originalRender(active, html, options);
      mountSharedNavigation().catch(error => console.error('[navigation]', error));
      return result;
    };
  }
  if (originalHydrateNav) hydrateShellNav = function (user, active) {
    sharedNavPath = active ? active + (active.includes('?') ? '' : (window.location?.search || '')) : sharedNavPath;
    if (!sharedNavigation) originalHydrateNav(user, active);
    else hydrateShellProfile(user);
    updateSharedNavigation(user);
  };
  window.addEventListener?.('agentsam:navigation', event => {
    sharedNavPath = event.detail?.pathname || window.location.pathname;
    updateSharedNavigation();
  });
  function refreshAppearancePreference() {
    if (appearanceModule && !document.getElementById('agentsam-host-workspace')) {
      const preference = preferredDashboardAppearance();
      acceptShellAppearance(appearanceModule.projectStudioShellAppearance(accountTheme, {theme:preference?.mode || document.documentElement.dataset.theme, accentColor:preference?.accent}));
    }
    updateSharedNavigation();
  }
  window.addEventListener?.('agentsam:shell-appearance', refreshAppearancePreference);
  window.addEventListener?.('storage', event => { if (event.key === 'agentsam-shell-appearance-v1') refreshAppearancePreference(); });
  window.addEventListener?.('agentsam:workspace-navigation', () => updateSharedNavigation());
  window.addEventListener?.('agentsam:theme-applied', event => acceptShellAppearance(event.detail));
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => updateSharedNavigation()).observe(document.documentElement, {attributes:true,attributeFilter:['data-theme']});
  if (typeof document !== 'undefined') document.addEventListener('click', event => {
    if (!sharedNavigation || !event.target?.closest?.('[data-shared-nav-toggle], [data-console-nav-toggle], #admin-menu-toggle')) return;
    event.preventDefault(); event.stopImmediatePropagation(); sharedNavigation.toggle();
  }, true);
  const originalProfile = typeof hydrateShellProfile === 'function' ? hydrateShellProfile : null;
  if (originalProfile) hydrateShellProfile = function (user) {
    user = window.__shellUser || user;
    updateSharedNavigation(user);
    originalProfile(user && { ...user, avatar_url: user.avatar_url || '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg' });
    document.querySelectorAll('.console-profile-store-logo').forEach(image => {
      image.src = user?.avatar_url && safeAvatarUrl(user.avatar_url) || '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg';
    });
  };
  if (desktopHost) {
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('#agentsam-toggle')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      desktopHost.activateAssistant();
    }, true);
  }
  if (desktop && !window.__agentsamConsoleLinks) {
    window.__agentsamConsoleLinks = true;
    document.addEventListener("click", function (event) {
      const link = event.target?.closest?.("a[href]");
      if (event.defaultPrevented || !link || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (link.getAttribute('target') === '_blank' || link.hasAttribute?.('download')) return;
      const path = link.getAttribute("href");
      if (!path || !path.startsWith("/") || path.startsWith("//")) return;
      event.preventDefault();
      // Desktop keeps the ecommerce console inside Local Studio's own route
      // host; never send these paths to a separately installed site Worker.
      const destination = path.startsWith("/admin/") && ["/admin/agentsam", "/admin/projects", "/admin/cad", "/admin/moviemode"].some((mount) => path === mount || path.startsWith(mount + "/")) ? path
        : path.startsWith("/admin/")
          ? "/apps/ecommerce-cms-agentsam?page=" + encodeURIComponent(path)
          : path;
      if (desktopHost) desktopHost.navigate(destination);
      else window.location.hash = "#" + destination;
    }, true);
  }

  // The host projects the same authenticated feed as the React shell.
  async function loadAccountNotifications() {
    const panel = document.getElementById('console-notifications-menu');
    if (!panel) return;
    const heading = document.createElement('strong'); heading.textContent = 'Notifications';
    const state = document.createElement('p'); state.setAttribute('role','status'); state.textContent = 'Loading notifications…';
    panel.replaceChildren(heading,state);
    try {
      const response = await window.fetch('/api/settings/notifications',{credentials:'same-origin',cache:'no-store'});
      if (!response.ok) throw new Error('notifications_unavailable');
      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.notifications)) throw new Error('notifications_unavailable');
      state.remove();
      if (!payload.notifications.length) {
        const empty = document.createElement('p'); empty.textContent = 'No notifications yet.'; panel.appendChild(empty);
      }
      for (const item of payload.notifications) {
        const article = document.createElement('article'); article.className = 'studio-notification';
        const title = document.createElement('strong'); title.textContent = item.title;
        const message = document.createElement('p'); message.textContent = item.message;
        const time = document.createElement('small'); time.textContent = item.channel+' · '+new Date(item.createdAt*1000).toLocaleString();
        article.append(title,message,time); panel.appendChild(article);
      }
    } catch {
      state.textContent = 'Notifications could not load.';
    }
    const refresh = document.createElement('button'); refresh.type='button'; refresh.className='console-btn';
    refresh.textContent='Refresh notifications'; refresh.addEventListener('click',()=>void loadAccountNotifications()); panel.appendChild(refresh);
  }
  document.addEventListener('click',event=>{
    if (event.target?.closest?.('#console-notifications-trigger') &&
        document.getElementById('console-notifications-trigger')?.getAttribute('aria-expanded') !== 'true') void loadAccountNotifications();
  },true);

})();
