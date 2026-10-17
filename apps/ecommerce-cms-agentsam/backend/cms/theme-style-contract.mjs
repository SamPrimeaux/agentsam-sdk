/**
 * Canonical visual theme settings are stored in the existing site/brand CMS
 * section content, not an extra theme database or browser-only cache.
 * Values are sparse overrides: missing keys restore the installed theme.
 */
const COLORS = ["canvas", "ink", "accent", "accentSoft", "paper", "muted"];
const COLOR = /^#[0-9a-f]{6}$/i;
const FONTS = new Set(["theme", "system-ui", "Arial", "Georgia", "Inter"]);
export const MAX_THEME_CSS = 8000;

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
  const allowed = new Set(["colors","font","buttonRadius","customCss"]);
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
  if (settings.customCss !== undefined) {
    const css = validateThemeCss(settings.customCss);
    if (!css.ok) return css;
  }
  return {ok:true};
}
