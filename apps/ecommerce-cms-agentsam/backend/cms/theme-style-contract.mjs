/**
 * Canonical visual theme settings are stored in the existing site/brand CMS
 * section content, not an extra theme database or browser-only cache.
 * Values are sparse overrides: missing keys restore the installed theme.
 */
const COLORS = ["canvas", "ink", "accent", "accentSoft", "paper", "muted"];
const COLOR = /^#[0-9a-f]{6}$/i;
const FONTS = new Set(["theme", "system-ui", "Arial", "Georgia", "Inter"]);
const FONT_ROLES = ["Body", "Subheading", "Heading", "Accent"];
const FONT_ID = /^(?=.{1,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FONT_FAMILY = /^[\p{L}\p{N}][\p{L}\p{N} ._'&+()\-]{0,99}$/u;
const FONT_CSS_ENDPOINT = "https://themes.inneranimalmedia.com/fonts/css";

/** Keep asset delivery with Theme Store; CMS stores only selected family IDs and names. */
export function themeFontCssHref(settings) {
  if (!settings || !validateThemeSettings(settings).ok) return null;
  const ids = [...new Set(FONT_ROLES.map(role => settings.fontRoles?.[role]?.id).filter(Boolean))].sort();
  return ids.length ? FONT_CSS_ENDPOINT + "?families=" + ids.join(",") : null;
}

const CONTROL_GROUPS = new Set(["style","brand","palette","type","page","motion","badges",
  "buttons","cart","drawers","icons","inputs","overlays","prices","cards","search",
  "swatches","variants","css"]);
const CONTROL_KEY = /^[a-z]+(?:\.[A-Za-z0-9_-]+)+$/;
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
  const fontRoles = settings.fontRoles || {};
  const fontTokens = FONT_ROLES.filter(role => fontRoles[role]).map(role =>
    "--cms-font-" + role.toLowerCase() + ":" + JSON.stringify(fontRoles[role].family));
  if (fontTokens.length) rules.push(":root{" + fontTokens.join(";") + "}");
  if (fontRoles.Body) rules.push("body{font-family:var(--cms-font-body),sans-serif}");
  else if (settings.font && settings.font !== "theme")
    rules.push("body{font-family:" + JSON.stringify(settings.font) + ",sans-serif}");
  if (fontRoles.Heading) rules.push("h1,h2,h3,h4,h5,h6{font-family:var(--cms-font-heading),serif}");
  if (fontRoles.Subheading) rules.push("h5,h6,.cms-subheading,[data-cms-type=subheading]{font-family:var(--cms-font-subheading),sans-serif}");
  if (fontRoles.Accent) rules.push(".cms-accent,[data-cms-type=accent]{font-family:var(--cms-font-accent),sans-serif}");
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
  // Full editor controls are sparse overrides. Store all validated choices,
  // but render only selectors understood by the current theme family. Never
  // guess behavior for checkout, product media, embeds or customer accounts.
  const controls = settings.controls || {};
  const color = key => COLOR.test(controls[key] || "") ? controls[key] : null;
  const radius = key => Number.isFinite(controls[key]) && controls[key] >= 0 &&
    controls[key] <= 100 ? controls[key] + "px" : null;
  const paint = (selector, property, key) => {
    const value = color(key);
    if (value) rules.push(selector + "{" + property + ":" + value + "}");
  };
  paint("body", "background-color", "page.bg");
  paint("body", "color", "type.text");
  paint(".h-product-card,.cms-product-card,[data-cms-product-card],.iam-starter-product", "background-color", "cards.bg");
  paint(".h-product-card,.cms-product-card,[data-cms-product-card],.iam-starter-product", "color", "cards.text");
  paint(".h-button-primary,.btn-primary,[data-cms-button=primary],.iam-starter-cta", "background-color", "buttons.primary.bg");
  paint(".h-button-primary,.btn-primary,[data-cms-button=primary],.iam-starter-cta", "color", "buttons.primary.text");
  paint(".h-button-secondary,.btn-secondary,[data-cms-button=secondary]", "background-color", "buttons.secondary.bg");
  paint(".h-button-secondary,.btn-secondary,[data-cms-button=secondary]", "color", "buttons.secondary.text");
  paint("input:not([type=checkbox]):not([type=radio]),textarea,select", "background-color", "inputs.bg");
  paint("input:not([type=checkbox]):not([type=radio]),textarea,select", "color", "inputs.text");
  paint("input:not([type=checkbox]):not([type=radio]),textarea,select", "border-color", "inputs.border");
  paint(".h-cart-drawer,[data-cms-drawer]", "background-color", "drawers.bg");
  paint(".h-cart-drawer,[data-cms-drawer]", "color", "drawers.text");
  paint(".h-badge,[data-cms-badge=sale]", "background-color", "badges.saleBg");
  paint(".h-badge,[data-cms-badge=sale]", "color", "badges.saleText");
  paint("[data-cms-badge=sold-out]", "background-color", "badges.soldBg");
  paint("[data-cms-badge=sold-out]", "color", "badges.soldText");
  for (const [selector,key] of [
    [".h-button-primary,.btn-primary,[data-cms-button=primary],.iam-starter-cta","buttons.primary.radius"],
    [".h-button-secondary,.btn-secondary,[data-cms-button=secondary]","buttons.secondary.radius"],
    [".h-badge,[data-cms-badge]","badges.radius"],
    ["input:not([type=checkbox]):not([type=radio]),textarea,select","inputs.radius"],
    [".h-dialog,[data-cms-popover]","overlays.radius"],
    [".h-variant-picker,[data-cms-variant]","variants.radius"],
  ]) {
    const r = radius(key);
    if (r) rules.push(selector + "{border-radius:" + r + "}");
  }
  const headingFont = controls["type.font.Heading"];
  if (!fontRoles.Heading && FONTS.has(headingFont) && headingFont !== "theme")
    rules.push("h1,h2,h3,h4,h5,h6{font-family:" + JSON.stringify(headingFont) + ",serif}");
  const lineHeights = {Tight:"1.1",Normal:"1.35",Loose:"1.65"};
  const letterSpacing = {Tight:"-.025em",Normal:"normal",Wide:".035em"};
  const paragraph = [];
  if (/^(?:12|14|16|18|20|24|28|32|40|48|56|64)px$/.test(String(controls["type.p.size"] || "")))
    paragraph.push("font-size:"+controls["type.p.size"]);
  if (lineHeights[controls["type.p.line"]]) paragraph.push("line-height:"+lineHeights[controls["type.p.line"]]);
  if (paragraph.length) rules.push("p,[data-cms-type=paragraph]{"+paragraph.join(";")+"}");
  for (let i = 1; i <= 6; i++) {
    const key = "type.h"+i;
    const parts = [];
    const role = controls[key+".font"];
    if (FONT_ROLES.includes(role) && fontRoles[role])
      parts.push("font-family:var(--cms-font-"+role.toLowerCase()+")");
    const size = controls[key+".size"];
    if (/^(?:12|14|16|18|20|24|28|32|40|48|56|64)px$/.test(String(size || "")))
      parts.push("font-size:"+size);
    if (lineHeights[controls[key+".line"]]) parts.push("line-height:"+lineHeights[controls[key+".line"]]);
    if (letterSpacing[controls[key+".spacing"]]) parts.push("letter-spacing:"+letterSpacing[controls[key+".spacing"]]);
    if (controls[key+".case"] === "Uppercase") parts.push("text-transform:uppercase");
    if (parts.length) rules.push("h"+i+"{"+parts.join(";")+"}");
  }
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
  const allowed = new Set(["colors","font","fontRoles","buttonRadius","customCss","designDraft","controls","paletteLinks"]);
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
  if (settings.fontRoles !== undefined) {
    const roles = settings.fontRoles;
    if (!roles || typeof roles !== "object" || Array.isArray(roles) ||
        Object.keys(roles).length > FONT_ROLES.length)
      return {ok:false,error:"Invalid theme font roles"};
    for (const [role, selection] of Object.entries(roles)) {
      if (!FONT_ROLES.includes(role) || !selection || typeof selection !== "object" ||
          Array.isArray(selection) || Object.keys(selection).length !== 2 ||
          typeof selection.id !== "string" || typeof selection.family !== "string" ||
          !FONT_ID.test(selection.id) || !FONT_FAMILY.test(selection.family) ||
          !Object.hasOwn(selection, "id") || !Object.hasOwn(selection, "family"))
        return {ok:false,error:"Invalid theme font role: " + role};
    }
  }
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
  if (settings.controls !== undefined) {
    const controls = settings.controls;
    if (!controls || typeof controls !== "object" || Array.isArray(controls) ||
        Object.keys(controls).length > 320)
      return {ok:false,error:"Invalid theme controls"};
    for (const [key,value] of Object.entries(controls)) {
      if (!CONTROL_KEY.test(key) || !CONTROL_GROUPS.has(key.split(".")[0]))
        return {ok:false,error:"Unknown theme control: " + key};
      if (key === "css.source") {
        const css = validateThemeCss(value);
        if (!css.ok) return css;
        continue;
      }
      if (!(typeof value === "boolean" || (typeof value === "number" &&
        Number.isFinite(value) && Math.abs(value) <= 10000) ||
        (typeof value === "string" && value.length <= 2000)))
        return {ok:false,error:"Invalid theme control value: " + key};
    }
  }
  if (settings.paletteLinks !== undefined) {
    const links = settings.paletteLinks;
    if (!links || typeof links !== "object" || Array.isArray(links) ||
        Object.keys(links).length > 200)
      return {ok:false,error:"Invalid palette links"};
    for (const [key,value] of Object.entries(links))
      if (!CONTROL_KEY.test(key) || !Number.isInteger(value) || value < 0 || value > 32)
        return {ok:false,error:"Invalid palette link"};
  }
  if (settings.customCss !== undefined) {
    const css = validateThemeCss(settings.customCss);
    if (!css.ok) return css;
  }
  return {ok:true};
}
