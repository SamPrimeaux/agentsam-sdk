/* Customer-facing global theme editor: real CMS source, no placeholder categories. */
(() => {
  "use strict";
  const host = document.querySelector('[data-drawer-panel="theme-settings"]');
  if (!host) return;
  const bridge = () => window.CmsThemeSettings;
  const colorLabels = {
    canvas: ["Page canvas","--h-color-canvas"],
    ink: ["Primary text","--h-color-ink"],
    accent: ["Accent","--h-color-accent"],
    accentSoft: ["Accent secondary","--h-color-accent-soft"],
    paper: ["Light surface","--h-color-paper"],
    muted: ["Muted text","--h-color-muted"]
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value));
  const cssError = css => {
    if (css.length > 8000) return "Keep CSS under 8 KB.";
    if (/@import\b|@font-face\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|<\/style|[\x00-\x08\x0b\x0e-\x1f]/i.test(css))
      return "External imports and resource URLs are not supported.";
    let n = 0;
    for (const char of css) {
      if (char === "{") n++;
      if (char === "}") n--;
      if (n < 0 || n > 12) return "Check the CSS braces.";
    }
    return n ? "Close the CSS braces to apply your changes." : "";
  };
  const read = () => bridge()?.read();
  const update = settings => {
    const success = bridge()?.update(settings);
    const notice = host.querySelector('[data-live-settings-status]');
    if (notice) notice.textContent = success ? "Applied to the working theme. Save to keep your changes." : "Theme settings are not available for this site.";
    return success;
  };
  const themeColor = key => {
    const variable = colorLabels[key][1];
    try {
      const doc = document.getElementById("theme-preview")?.contentDocument;
      const value = doc && doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue(variable).trim();
      if (validHex(value)) return value;
    } catch {}
    return "#777777";
  };
  function render() {
    const current = read();
    if (current === null || current === undefined) {
      host.innerHTML = '<div class="ts-live"><h2>Theme settings</h2><p class="ts-live-wait">Loading installed theme settings…</p></div>';
      return;
    }
    host.innerHTML = '<div class="ts-live"><h2>Theme settings</h2>' +
      '<details open class="ts-live-group"><summary>Colors</summary><div class="ts-live-colors">' +
      Object.entries(colorLabels).map(([key,[label]]) => {
        const color = current.colors?.[key] || themeColor(key);
        return '<div class="ts-live-color"><label for="ts-live-'+key+'">'+esc(label)+'</label>'+
          '<div class="ts-live-color__row"><input type="color" id="ts-live-'+key+'" data-theme-color="'+key+'" value="'+esc(color)+'" aria-label="'+esc(label)+'">'+
          '<output>'+esc(current.colors?.[key] || "Theme default")+'</output>'+
          '<button type="button" data-theme-reset="'+key+'" '+(current.colors?.[key] ? '' : 'disabled')+'>Reset</button></div></div>';
      }).join("") + '</div></details>'+
      '<details class="ts-live-group"><summary>Typography</summary><label for="ts-live-font">Body font</label>'+
      '<select id="ts-live-font" data-theme-font><option value="theme">Theme default</option>'+
      ["Inter","Arial","Georgia","system-ui"].map(font=>'<option value="'+font+'" '+(current.font === font ? 'selected':'')+'>'+esc(font)+'</option>').join('')+
      '</select></details>'+
      '<details class="ts-live-group"><summary>Buttons</summary><label for="ts-live-radius">Corner radius</label>'+
      '<div class="ts-live-radius"><input id="ts-live-radius" type="range" min="0" max="60" step="1" value="'+esc(current.buttonRadius ?? 14)+'" data-theme-radius>'+
      '<output data-radius-value>'+esc(current.buttonRadius ?? "Theme default")+'</output><button type="button" data-radius-reset>Reset</button></div></details>'+
      '<details class="ts-live-group"><summary>Custom CSS</summary>'+
      '<label for="ts-live-css">Storefront CSS</label>'+
      '<textarea id="ts-live-css" data-theme-css rows="12" spellcheck="false" placeholder=".your-section {&#10;  border-radius: 12px;&#10;}">'+esc(current.customCss || "")+'</textarea>'+
      '<p class="ts-live-css-error" data-theme-css-error role="status"></p>'+
      '</details><p class="ts-live-status" role="status" data-live-settings-status></p></div>';
    host.querySelectorAll('[data-theme-color]').forEach(input => {
      input.addEventListener('input', () => {
        const settings = read(); if (!settings) return;
        settings.colors = {...(settings.colors || {}),[input.dataset.themeColor]:input.value};
        update(settings);
        input.closest('.ts-live-color').querySelector('output').textContent = input.value;
        input.closest('.ts-live-color').querySelector('button').disabled = false;
      });
    });
    host.querySelectorAll('[data-theme-reset]').forEach(button => {
      button.addEventListener('click',()=>{
        const settings = read(); if (!settings) return;
        delete settings.colors?.[button.dataset.themeReset];
        if (settings.colors && !Object.keys(settings.colors).length) delete settings.colors;
        if (update(settings)) render();
      });
    });
    host.querySelector('[data-theme-font]')?.addEventListener('change', event => {
      const settings = read(); if (!settings) return;
      if (event.target.value === 'theme') delete settings.font;
      else settings.font = event.target.value;
      update(settings);
    });
    host.querySelector('[data-theme-radius]')?.addEventListener('input', event => {
      const settings = read(); if (!settings) return;
      settings.buttonRadius = Number(event.target.value);
      if (update(settings)) host.querySelector('[data-radius-value]').textContent = settings.buttonRadius + 'px';
    });
    host.querySelector('[data-radius-reset]')?.addEventListener('click',()=>{
      const settings = read(); if (!settings) return;
      delete settings.buttonRadius; if (update(settings)) render();
    });
    host.querySelector('[data-theme-css]')?.addEventListener('input', event => {
      const css = event.target.value;
      const error = cssError(css);
      host.querySelector('[data-theme-css-error]').textContent = error;
      event.target.setAttribute('aria-invalid',String(Boolean(error)));
      if (error) return;
      const settings = read(); if (!settings) return;
      if (css) settings.customCss = css;
      else delete settings.customCss;
      update(settings);
    });
  }
  render();
  document.addEventListener('theme-editor:global-settings-ready',render);
  document.getElementById('theme-preview')?.addEventListener('load',()=>{
    // Populate only empty default color values after the installed theme loads.
    host.querySelectorAll('[data-theme-color]').forEach(input => {
      if (read()?.colors?.[input.dataset.themeColor]) return;
      input.value = themeColor(input.dataset.themeColor);
    });
  });
  window.ThemeSettingsPanel = { refresh: render, getState: () => ({values:read(), persistedBy:"cms-site-brand"}) };
})();
