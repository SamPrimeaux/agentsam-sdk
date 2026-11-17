const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char]));

function formatDate(value) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

const validId = value => /^[A-Za-z0-9_-]{1,160}$/.test(String(value || ''));

function editorHref(draft) {
  if (!validId(draft.project_id) || !validId(draft.site_id)) return null;
  return `/admin/sites/${encodeURIComponent(draft.site_id)}/themes/${encodeURIComponent(draft.project_id)}/editor/home`;
}

function render(drafts) {
  const editable = drafts.filter(draft => draft && editorHref(draft));
  const content = editable.length
    ? `<section class="theme-studio-grid" aria-label="Your theme workspaces">${editable.map(draft => {
        const source = draft.source_kind === 'catalog' ? 'Theme Store' : 'Your designs';
        const version = draft.source_version ? 'v' + draft.source_version : 'Working draft';
        const revision = Number.isSafeInteger(draft.revision) && draft.revision >= 0
          ? ' · Revision ' + draft.revision : '';
        return `<article class="theme-studio-card">
          <div class="theme-studio-tags"><span class="theme-studio-tag">Private draft</span><span class="theme-studio-tag">${escapeHtml(version)}</span></div>
          <h2>${escapeHtml(draft.name || 'Untitled website')}</h2>
          <div class="theme-studio-meta">From ${escapeHtml(source)}${escapeHtml(revision)}<br>Last saved ${escapeHtml(formatDate(draft.updated_at))}</div>
          <div class="theme-studio-card-footer"><span class="theme-studio-meta">Not published</span><a class="btn primary small" href="${escapeHtml(editorHref(draft))}">Continue editing</a></div>
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
  const response = await fetch('/api/admin/cms/theme-projects', {
    credentials:'same-origin', cache:'no-store', headers:{ accept:'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.error || `Could not load Theme Studio (${response.status})`);
  render(Array.isArray(data.drafts) ? data.drafts : []);
}

boot().catch(error => {
  renderShell('/admin/theme-workspace', `
    <main class="theme-studio-home"><div class="theme-studio-status" role="alert">${escapeHtml(error?.message || error)}</div></main>
  `, { shellMode:'default' });
  console.error('[theme-studio]', error);
});
