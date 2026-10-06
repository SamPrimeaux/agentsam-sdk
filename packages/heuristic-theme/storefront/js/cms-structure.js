function numericSortOrder(section, fallback = 0) {
  const value = Number(section?.sort_order);
  return Number.isFinite(value) ? value : fallback;
}

export function cmsTemplateKey(section) {
  const explicit = section?.content?.__editor?.templateKey;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return String(section?.key || "").trim();
}

export function cmsSectionEnabled(section) {
  if (!section || section.status === "removed") return false;
  return section.content?.__editor?.visibility?.enabled !== false;
}

function cloneSection(section) {
  return typeof structuredClone === "function"
    ? structuredClone(section)
    : JSON.parse(JSON.stringify(section));
}

function applyEditorSettings(section, content) {
  const editor = content?.__editor || {};
  const width = editor.layout?.width;
  if (width && width !== "inherit") {
    section.appearance = { ...(section.appearance || {}), width };
  }

  const motionPreset = editor.motion?.preset;
  const motionIntensity = editor.motion?.intensity;
  if ((motionPreset && motionPreset !== "inherit") || Number.isFinite(Number(motionIntensity))) {
    section.motion = { ...(section.motion || {}) };
    if (motionPreset && motionPreset !== "inherit") section.motion.preset = motionPreset;
    if (Number.isFinite(Number(motionIntensity))) section.motion.intensity = Number(motionIntensity);
  }

  section.cmsEditor = {
    alignment: editor.layout?.alignment || "inherit",
    paddingTop: Number(editor.spacing?.paddingTop || 0),
    paddingBottom: Number(editor.spacing?.paddingBottom || 0),
    backgroundEnabled: editor.appearance?.backgroundEnabled === true,
    backgroundColor: editor.appearance?.backgroundColor || "",
    hideMobile: editor.responsive?.hideMobile === true,
  };
}

export function projectCmsSections(pageSections, cmsSections, { onUnregistered } = {}) {
  if (!Array.isArray(pageSections)) throw new TypeError("pageSections must be an array");
  if (!Array.isArray(cmsSections)) throw new TypeError("cmsSections must be an array");

  const templates = new Map();
  for (const section of pageSections) {
    if (!section?.cmsKey) continue;
    if (templates.has(section.cmsKey)) {
      throw new Error(`duplicate preset cmsKey: ${section.cmsKey}`);
    }
    templates.set(section.cmsKey, section);
  }

  return [...cmsSections]
    .sort((a, b) => numericSortOrder(a) - numericSortOrder(b))
    .filter(cmsSectionEnabled)
    .map((cmsSection) => {
      const templateKey = cmsTemplateKey(cmsSection);
      const template = templates.get(templateKey);
      if (!template) {
        onUnregistered?.(cmsSection, templateKey);
        return null;
      }

      const section = cloneSection(template);
      section.id =
        cmsSection.key === templateKey
          ? template.id
          : `${template.id}--${cmsSection.key}`;
      section.cmsKey = cmsSection.key;
      section.cmsTemplateKey = templateKey;
      section.cmsContent = cmsSection.content || {};
      section.cmsSortOrder = numericSortOrder(cmsSection);
      applyEditorSettings(section, section.cmsContent);
      return section;
    })
    .filter(Boolean);
}
