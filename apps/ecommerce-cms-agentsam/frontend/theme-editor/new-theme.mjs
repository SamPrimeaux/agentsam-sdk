import { LoadingSceneController, HyperspaceRenderer, computationalHyperspace } from '../../../../packages/agentsam-loading-scene/src/index.ts';

import { blankThemeProject } from './starter-project.mjs';

/** Existing CMS consumer; the shared package owns every animation frame. */
export async function prepareNewTheme({ request, save, siteId }) {
  document.getElementById('theme-project-loading')?.remove();
  document.getElementById('theme-project-editor-frame').hidden = true;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/theme-editor/new-theme.css';
  document.head.append(stylesheet);
  const root = document.createElement('main');
  root.className = 'cms-new-theme';
  root.innerHTML = `
    <header class="cms-new-theme-header">
      <button type="button" data-exit aria-label="Back to Online Store">←</button>
      <strong>New theme</strong>
    </header>
    <section class="cms-new-theme-canvas" aria-label="New theme canvas">
      <canvas aria-hidden="true"></canvas>
      <p role="status" data-preparation>Preparing your questions…</p>
    </section>
    <aside class="cms-new-theme-guide" hidden>
      <img src="/admin/brand/agentsam-gorilla-tiny.svg" width="32" height="32" alt="AgentSam">
      <h1>Let's shape your website.</h1>
      <form>
        <label>What would you like to call it?<input name="name" maxlength="160" required autocomplete="off" placeholder="Website name"></label>
        <label>What are you creating?<textarea name="purpose" maxlength="2000" required rows="3" placeholder="A shop, a journal, a portfolio…"></textarea></label>
        <label>Who is it for?<input name="audience" maxlength="500" autocomplete="off" placeholder="Your audience"></label>
        <p role="alert" data-error hidden></p>
        <button type="submit">Create theme</button>
      </form>
    </aside>`;
  document.body.append(root);
  const exit = () => window.top.location.assign('/admin/store?site_id=' + encodeURIComponent(siteId));
  root.querySelector('[data-exit]').onclick = exit;
  const canvas = root.querySelector('canvas');
  const surface = root.querySelector('.cms-new-theme-canvas');
  const status = root.querySelector('[data-preparation]');
  const guide = root.querySelector('.cms-new-theme-guide');
  const controller = new LoadingSceneController(computationalHyperspace);
  const renderer = new HyperspaceRenderer(computationalHyperspace, { canvas, study: 'auto', reducedMotion: 'auto' });
  const fit = () => renderer.setSize(surface.clientWidth, surface.clientHeight);
  const resize = new ResizeObserver(fit);
  resize.observe(surface);
  fit();
  const unsubscribe = controller.subscribe(scene => renderer.setScene(scene));
  const dispose = () => { unsubscribe(); resize.disconnect(); renderer.dispose(); };
  window.addEventListener('pagehide', dispose, { once: true });
  controller.start({ operationId: 'cms-new-theme-context', semantic: 'context_loading', label: 'Preparing your questions' });
  let context;
  try {
    context = await request('/api/admin/store/online?site_id=' + encodeURIComponent(siteId));
    if (context.ok !== true || context.selected_site_id !== siteId) throw new Error('site_not_available');
    controller.complete('cms-new-theme-context');
  } catch (error) {
    controller.fail('cms-new-theme-context');
    status.textContent = 'Your website could not be loaded. Return to Online Store and try again.';
    dispose();
    throw error;
  }
  status.hidden = true;
  canvas.classList.add('is-settling');
  guide.hidden = false;
  const nameInput = root.querySelector('[name="name"]');
  nameInput.value = context.selected_site_name || '';
  nameInput.focus();
  const suspend = () => renderer.suspend();
  canvas.addEventListener('transitionend', suspend, { once: true });
  const settleTimer=setTimeout(suspend,800);
  window.addEventListener('pagehide',()=>clearTimeout(settleTimer),{once:true});
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) suspend();

  return new Promise(resolve => {
    const form = root.querySelector('form');
    const button = form.querySelector('button');
    const errorNode = root.querySelector('[data-error]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true;
      errorNode.hidden = true;
      try {
        const values = new FormData(form);
        const project = await save(blankThemeProject({
          name: String(values.get('name') || ''),
          purpose: String(values.get('purpose') || ''),
          audience: String(values.get('audience') || ''),
          siteName: context.selected_site_name || '',
        }));
        dispose();
        window.removeEventListener('pagehide', dispose);
        root.remove();
        document.getElementById('theme-project-editor-frame').hidden = false;
        resolve(project);
      } catch {
        errorNode.textContent = 'Your theme could not be created. Your answers are still here; try again.';
        errorNode.hidden = false;
        button.disabled = false;
      }
    });
  });
}
