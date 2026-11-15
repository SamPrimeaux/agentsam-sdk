const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char]));

function formatDate(value) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

function editorHref(project) {
  const query = new URLSearchParams({ project: project.id, scope:'studio' });
  return '/admin/theme-project-editor?' + query.toString();
}

function render(projects) {
  const content = projects.length
    ? `<section class="theme-studio-grid" aria-label="Your theme workspaces">${projects.map(project => {
        const pageCount = Array.isArray(project.pages) ? project.pages.length : 0;
        const source = project.sourceThemeId || 'Custom design';
        const version = project.sourcePackageVersion ? 'v' + project.sourcePackageVersion : 'Working draft';
        return `<article class="theme-studio-card">
          <div class="theme-studio-tags"><span class="theme-studio-tag">Private draft</span><span class="theme-studio-tag">${escapeHtml(version)}</span></div>
          <h2>${escapeHtml(project.name || 'Untitled website')}</h2>
          <div class="theme-studio-meta">Based on ${escapeHtml(source)} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}<br>Last saved ${escapeHtml(formatDate(project.updatedAt))}</div>
          <div class="theme-studio-card-footer"><span class="theme-studio-meta">Not published</span><a class="btn primary small" href="${escapeHtml(editorHref(project))}">Continue editing</a></div>
        </article>`;
      }).join('')}</section>`
    : `<section class="theme-studio-empty">
        <h2>Your creative workspace is ready</h2>
        <p>Start from a packaged website theme and customize its pages, layouts, content, and design. You do not need a website, project, or domain to begin.</p>
        <a class="btn primary" href="https://themes.inneranimalmedia.com/">Browse website themes</a>
      </section>`;
  renderShell('/admin/theme-workspace', `
    <main class="theme-studio-home">
      <header class="theme-studio-hero">
        <div><div class="theme-studio-kicker">Account workspace · private authoring</div><h1 class="theme-studio-title">Theme Studio</h1>
          <p class="theme-studio-description">Develop the complete website experience first. Sites, domains, and publishing are optional destinations you can connect when the work is ready.</p>
        </div>
        <a class="btn ghost" href="https://themes.inneranimalmedia.com/">Browse themes</a>
      </header>
      ${content}
    </main>
  `, { shellMode:'default' });
}

async function boot() {
  renderShell('/admin/theme-workspace', `
    <main class="theme-studio-home"><div class="theme-studio-status" role="status">Loading your Theme Studio workspaces…</div></main>
  `, { shellMode:'default' });
  const response = await fetch('/api/admin/cms/theme-projects?scope=studio', {
    credentials:'same-origin', cache:'no-store', headers:{ accept:'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.error || `Could not load Theme Studio (${response.status})`);
  render(Array.isArray(data.projects) ? data.projects : []);
}

boot().catch(error => {
  renderShell('/admin/theme-workspace', `
    <main class="theme-studio-home"><div class="theme-studio-status" role="alert">${escapeHtml(error?.message || error)}</div></main>
  `, { shellMode:'default' });
  console.error('[theme-studio]', error);
});
