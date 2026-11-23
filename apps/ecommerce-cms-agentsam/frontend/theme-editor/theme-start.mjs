/** Shared Theme Studio first-run guidance. Never creates a Design Canvas artifact. */
export function themeStartPrompt({siteName, projectName} = {}) {
  const name = String(siteName || 'this website').trim().slice(0, 120);
  const project = String(projectName || 'New theme').trim().slice(0, 120);
  return `We just created a private Ecommerce CMS theme draft (${project}) for ${name}. ` +
    'Help me build it inside this Theme Studio, not Design Canvas. First check whichever authorized site files, pages, assets, brand information, or documentation are actually available through your connected capabilities. ' +
    'Do not claim to have read anything you cannot access. Summarize what you verified, offer three distinct visual directions, then ask me about the vibe, purpose, and audience. ' +
    'Do not publish or change existing pages without my approval.';
}

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function renderThemeStart(doc, {siteName = 'Your website', onSelect, onDismiss} = {}) {
  const stage = doc.querySelector('.te-preview-stage');
  if (!stage) throw new Error('theme_studio_preview_stage_missing');
  const prior = stage.querySelector('.te-theme-start');
  if (prior) return prior;
  const panel = element(doc, 'section', 'te-theme-start');
  panel.setAttribute('aria-label', 'Start designing your theme with AgentSam');
  const body = element(doc, 'div', 'te-theme-start__body');
  body.append(element(doc,'span','te-theme-start__eyebrow','PRIVATE THEME DRAFT'),
    element(doc,'h2','te-theme-start__title','What direction are you feeling?'),
    element(doc,'p','te-theme-start__copy',
      `AgentSam is available to help shape a theme for ${String(siteName).slice(0, 120)}. ` +
      'Choose a starting point or keep editing the storefront. Your published site stays unchanged.'));
  const progress=element(doc,'div','te-theme-start__progress','Preparing your private theme and AgentSam session…');
  progress.setAttribute('role','status');
  progress.setAttribute('aria-live','polite');
  body.append(progress);
  const choices = element(doc,'div','te-theme-start__choices');
  for (const [id,label,description] of [
    ['directions','Explore visual directions','Compare styles, typography and layout ideas'],
    ['site','Use my existing site','Review available brand assets and existing pages'],
    ['sections','Build section by section','Open the actual Theme Studio section library'],
  ]) {
    const button = element(doc,'button','te-theme-start__choice');
    button.type = 'button';
    button.append(element(doc,'strong','',label),element(doc,'small','',description));
    button.addEventListener('click', () => onSelect?.(id));
    choices.append(button);
  }
  const dismiss = element(doc,'button','te-theme-start__dismiss','Continue editing without guidance');
  dismiss.type='button';
  dismiss.addEventListener('click', () => { panel.remove(); onDismiss?.(); });
  body.append(choices,dismiss);
  panel.append(body);
  stage.append(panel);
  return panel;
}

/** Wait for the packaged drawer, not an unrelated global agent or canvas assistant. */
function drawerReady(doc) {
  if (doc.getElementById('agentsam-drawer')) return Promise.resolve(true);
  return new Promise(resolve => {
    let completed = false;
    const finish = value => {
      if (completed) return;
      completed = true;
      doc.removeEventListener('agentsam:drawer-ready', onReady);
      clearTimeout(timeout);
      resolve(value);
    };
    const onReady = () => finish(true);
    doc.addEventListener('agentsam:drawer-ready', onReady);
    const timeout = setTimeout(() => finish(Boolean(doc.getElementById('agentsam-drawer'))), 10000);
    if (doc.getElementById('agentsam-drawer')) finish(true);
  });
}

export async function startThemeGuidance(frame, {siteId, projectId, siteName, projectName} = {}) {
  const doc=frame.contentDocument;
  const win=frame.contentWindow;
  if (!doc || !win || !siteId || !projectId) throw new Error('theme_start_identity_required');
  const params = {siteName,projectName};
  const context = {surface:'ecommerce-cms-theme-studio',site_id:siteId,project_id:projectId,
    intent:'new_theme_guidance'};
  async function ask(prompt) {
    if (!(await drawerReady(doc)) || typeof win.sendAgentsamMessage !== 'function') {
      throw new Error('AgentSam is unavailable. You can still use the editor tools.');
    }
    win.openAgentsamDrawer?.();
    // If the initial guided response is in progress, queue the user's chosen
    // direction in the actual composer for review, instead of racing chat calls.
    if (doc.getElementById('agentsam-form')?.getAttribute('aria-busy') === 'true') {
      const input=doc.getElementById('agentsam-input');
      if (input) {
        input.value=prompt;
        input.dispatchEvent(new win.Event('input',{bubbles:true}));
        input.focus();
        return;
      }
    }
    await win.sendAgentsamMessage(prompt,{context,propagateError:true});
  }
  const panel=renderThemeStart(doc,{siteName,onSelect: async choice => {
    if (choice==='sections') {
      panel.remove();
      doc.getElementById('te-add-section')?.click();
      return;
    }
    panel.remove();
    const instructions=choice==='site'
      ? 'Please check my authorized existing site pages and brand assets and suggest a direction that fits them; clearly state what was actually available.'
      : 'Show me three distinctly different design directions for this private theme, with clear style, layout and typography choices.';
    try { await ask(instructions); }
    catch(error) { panel.isConnected || doc.querySelector('.te-preview-stage')?.append(panel); }
  }});
  const progress=panel.querySelector('.te-theme-start__progress');
  if (await drawerReady(doc)) {
    win.openAgentsamDrawer?.();
    if (progress) progress.textContent='AgentSam is checking the context available to this session…';
    const key='agentsam:cms:new-theme-guidance:' + projectId;
    let alreadyStarted=false;
    try { alreadyStarted=win.sessionStorage.getItem(key)==='1'; } catch {}
    if (!alreadyStarted) {
      try {
        win.sessionStorage.setItem(key,'1');
        await ask(themeStartPrompt(params));
        if (progress) progress.textContent='AgentSam’s response is in the drawer. Choose a direction or continue editing.';
      } catch(error) {
        try { win.sessionStorage.removeItem(key); } catch {}
        if (progress) progress.textContent='AgentSam could not connect. You can still work with the section library.';
        console.warn('theme_start_assistant_unavailable',error?.message || error);
      }
    } else if (progress) progress.textContent='Continue this private draft with AgentSam or the section library.';
  } else if (progress) progress.textContent='AgentSam is unavailable. The packaged Theme Studio is still ready to edit.';
  return panel;
}
