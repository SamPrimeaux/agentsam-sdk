/**
 * Canonical visual theme settings are stored in the existing site/brand CMS
 * section content, not an extra theme database or browser-only cache.
 * Values are sparse overrides: missing keys restore the installed theme.
 */
const COLORS = ["canvas", "ink", "accent", "accentSoft", "paper", "muted"];
const COLOR = /^#[0-9a-f]{6}$/i;
const FONTS = new Set(["theme", "system-ui", "Arial", "Georgia", "Inter"]);
export const MAX_THEME_CSS = 8000;

/** The same contract protects every section writer, including site-owned drafts. */
export function validateSectionStyles(content) {
  const editor = content?.__editor;
  if (!editor || typeof editor !== "object") return {ok:true};
  if (editor.themeSettings !== undefined) {
    const result = validateThemeSettings(editor.themeSettings);
    if (!result.ok) return result;
  }
  return editor.customCss === undefined ? {ok:true} : validateThemeCss(editor.customCss);
}

/** Pure, browser/Worker-compatible renderer for the supported theme overrides.
 * No storage, tenant resolution, or editor state lives here.
 * Container hooks preserve full-bleed sections; overrides never resize editor chrome.
 */
export function renderThemeSettings(settings) {
  if (!settings || !validateThemeSettings(settings).ok) return "";
  const rules = [];
  const tokens = Object.entries(settings.colors || {}).map(([key,value]) => {
    const name = {canvas:"canvas",ink:"ink",accent:"accent",accentSoft:"accent-soft",paper:"paper",muted:"muted"}[key];
    return "--h-color-" + name + ":" + value;
  });
  if (tokens.length) rules.push(":root{" + tokens.join(";") + "}");
  if (settings.font && settings.font !== "theme")
    rules.push("body{font-family:" + JSON.stringify(settings.font) + ",sans-serif}");
  if (settings.buttonRadius !== undefined)
    rules.push("button,.h-button,.btn,[data-cms-button]{border-radius:" + settings.buttonRadius + "px}");
  const design = settings.designDraft || {};
  if (design["page.maxWidth"] !== undefined) {
    const width = design["page.maxWidth"];
    rules.push(":root{--cms-page-max-width:" + width + "px}");
    rules.push(".h-container,.container,[data-cms-page-container]{max-width:min(100%," + width + "px);margin-inline:auto}");
  }
  if (design["inputs.radius"] !== undefined)
    rules.push("input:not([type=checkbox]):not([type=radio]),textarea,select{border-radius:" + design["inputs.radius"] + "px}");
  if (design["motion.reduced"] === true)
    rules.push("*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}");
  if (settings.customCss) rules.push(settings.customCss);
  return rules.join("\n");
}


export function validateThemeCss(input) {
  if (typeof input !== "string" || input.length > MAX_THEME_CSS)
    return { ok: false, error: "Custom CSS exceeds 8 KB" };
  // Imported URLs can leak storefront visitor data via remote image/font
  // requests. Permit ordinary CSS declarations and selectors, not imports
  // or executable/external URL values.
  if (/@import\b|@font-face\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|<\/style|[\x00-\x08\x0b\x0e-\x1f]/i.test(input))
    return { ok: false, error: "CSS includes an unsupported import or external resource" };
  let depth = 0;
  for (const c of input) {
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (depth < 0 || depth > 12) return {ok:false,error:"CSS braces are unbalanced"};
  }
  return depth ? {ok:false,error:"CSS braces are unbalanced"} : {ok:true};
}

export function validateThemeSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    return {ok:false,error:"Theme settings must be an object"};
  const allowed = new Set(["colors","font","buttonRadius","customCss","designDraft"]);
  if (Object.keys(settings).some(key => !allowed.has(key)))
    return {ok:false,error:"Unknown theme setting"};
  if (settings.colors !== undefined) {
    if (!settings.colors || typeof settings.colors !== "object" || Array.isArray(settings.colors))
      return {ok:false,error:"Colors must be an object"};
    for (const [key,value] of Object.entries(settings.colors)) {
      if (!COLORS.includes(key) || !COLOR.test(String(value)))
        return {ok:false,error:"Invalid theme color: " + key};
    }
  }
  if (settings.font !== undefined && !FONTS.has(settings.font))
    return {ok:false,error:"Unknown theme font"};
  if (settings.buttonRadius !== undefined &&
      (!Number.isFinite(settings.buttonRadius) || settings.buttonRadius < 0 || settings.buttonRadius > 60))
    return {ok:false,error:"Button radius must be between 0 and 60"};
  if (settings.designDraft !== undefined) {
    const values = settings.designDraft;
    if (!values || typeof values !== "object" || Array.isArray(values))
      return {ok:false,error:"Theme design settings must be an object"};
    for (const [key, value] of Object.entries(values)) {
      if (key === "page.maxWidth") {
        if (!Number.isFinite(value) || value < 720 || value > 1920)
          return {ok:false,error:"Page width must be between 720 and 1920 pixels"};
      } else if (key === "inputs.radius") {
        if (!Number.isFinite(value) || value < 0 || value > 32)
          return {ok:false,error:"Input radius must be between 0 and 32 pixels"};
      } else if (key === "motion.reduced") {
        if (typeof value !== "boolean") return {ok:false,error:"Reduced motion must be true or false"};
      } else return {ok:false,error:"Theme setting is not connected: " + key};
    }
  }
  if (settings.customCss !== undefined) {
    const css = validateThemeCss(settings.customCss);
    if (!css.ok) return css;
  }
  return {ok:true};
}
