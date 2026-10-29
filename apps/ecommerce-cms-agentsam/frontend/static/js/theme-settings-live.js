/* Customer-facing global theme editor: real CMS source, no placeholder categories. */
(() => {
  "use strict";
  const host = document.querySelector('[data-drawer-panel="theme-settings"]');
  if (!host) return;
  // The connected merchant editor keeps its authoritative CMS settings bridge.
  // Resolve's isolated localhost preview has a separate, complete local inspector.
  if (new URLSearchParams(location.search).get('showcase') === 'resolve') return;
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
      '</details>'+
      '<p class="ts-live-intro">Additional design controls are stored in your existing theme draft. Storefront rendering depends on the installed theme.</p>'+
      '<details class="ts-live-group"><summary>Logo and favicon</summary>'+
      '<label for="ts-live-logo">Logo image URL</label><input id="ts-live-logo" data-design-text="brand.logoUrl" type="text" maxlength="500" placeholder="https:// or /media/" value="'+esc(current.designDraft?.["brand.logoUrl"]||"")+'">'+
      '<label for="ts-live-favicon">Favicon URL</label><input id="ts-live-favicon" data-design-text="brand.faviconUrl" type="text" maxlength="500" placeholder="https:// or /media/" value="'+esc(current.designDraft?.["brand.faviconUrl"]||"")+'"></details>'+
      '<details class="ts-live-group"><summary>Page layout</summary>'+
      '<label for="ts-live-page-width">Maximum page width (px)</label>'+
      '<input id="ts-live-page-width" data-design-number="page.maxWidth" type="number" min="720" max="1920" step="20" value="'+esc(current.designDraft?.["page.maxWidth"]??1280)+'"></details>'+
      '<details class="ts-live-group"><summary>Animations</summary>'+
      '<label class="ts-live-checkbox"><span>Reduce decorative motion</span><input data-design-check="motion.reduced" type="checkbox"'+(current.designDraft?.["motion.reduced"]?' checked':'')+'></label></details>'+
      '<details class="ts-live-group"><summary>Input fields</summary>'+
      '<label for="ts-live-input-radius">Corner radius (px)</label>'+
      '<input id="ts-live-input-radius" data-design-number="inputs.radius" type="number" min="0" max="32" value="'+esc(current.designDraft?.["inputs.radius"]??6)+'"></details>'+
      '<details class="ts-live-group"><summary>Popovers and modals</summary>'+
      '<label for="ts-live-modal-placement">Preferred position</label>'+
      '<select id="ts-live-modal-placement" data-design-select="overlays.placement">'+
      ['Center','Bottom right','Bottom left'].map(v=>'<option value="'+esc(v)+'"'+((current.designDraft?.["overlays.placement"]||'Center')===v?' selected':'')+'>'+esc(v)+'</option>').join('')+
      '</select></details>'+
      '<details class="ts-live-group"><summary>Icons</summary>'+
      '<label for="ts-live-icons">Toolbar icon style</label>'+
      '<select id="ts-live-icons" data-design-select="icons.style">'+
      ['Theme default','Outline','Solid'].map(v=>'<option value="'+esc(v)+'"'+((current.designDraft?.["icons.style"]||'Theme default')===v?' selected':'')+'>'+esc(v)+'</option>').join('')+
      '</select></details>'+
      '<p class="ts-live-status" role="status" data-live-settings-status></p></div>';
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
    const editDesign = (key,value) => {
      const current=read();
      if (!current) return;
      current.designDraft={...(current.designDraft||{}),[key]:value};
      update(current);
    };
    host.querySelectorAll('[data-design-text]').forEach(input=>input.addEventListener('change',()=>{
      const value=input.value.trim();
      if(value && !/^(https:\/\/[^\\s]+|\/(?!\/)[^\\s]*)$/i.test(value)){
        const status=host.querySelector('[data-live-settings-status]');
        if(status)status.textContent='Use an HTTPS asset URL or a same-origin /media/ path.';
        return;
      }
      editDesign(input.dataset.designText,value);
    }));
    host.querySelectorAll('[data-design-number]').forEach(input=>input.addEventListener('change',()=>{
      const number=Number(input.value);
      if(!Number.isFinite(number))return;
      editDesign(input.dataset.designNumber,Math.min(Number(input.max),Math.max(Number(input.min),number)));
    }));
    host.querySelectorAll('[data-design-check]').forEach(input=>input.addEventListener('change',()=>{
      editDesign(input.dataset.designCheck,input.checked);
    }));
    host.querySelectorAll('[data-design-select]').forEach(input=>input.addEventListener('change',()=>{
      editDesign(input.dataset.designSelect,input.value);
    }));
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
