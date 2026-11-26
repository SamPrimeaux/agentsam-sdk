/** Open the existing Theme Studio assistant, without covering or replacing
 * the editable storefront. Inference starts only on an explicit user send. */
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
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win || !projectId) throw new Error('theme_start_identity_required');
  if (!(await drawerReady(doc))) return false;
  win.setAgentsamPageContext?.({
    surface: 'ecommerce-cms-theme-studio',
    project_id: projectId,
    ...(siteId ? {site_id: siteId, site_name: siteName} : {}),
    project_name: projectName,
    intent: 'new_theme_guidance',
  });
  win.openAgentsamDrawer?.();
  return true;
}
