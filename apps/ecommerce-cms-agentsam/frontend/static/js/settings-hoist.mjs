const EDITOR_KEYS = {
  padding: "padding",
  alignment: "alignment",
  background: "background",
  motion: "motion",
};

export function hoistSettings(declared) {
  const editor = {};
  const generated = {};
  Object.entries(declared || {}).forEach(function(entry) {
    if (EDITOR_KEYS[entry[0]]) editor[entry[0]] = entry[1];
    else generated[entry[0]] = entry[1];
  });
  return { editor, generated };
}

export function applyHoisted(wrapper, values) {
  const calls = [];
  Object.entries(values || {}).forEach(function(entry) {
    const cssName = "--agentsam-setting-" + entry[0];
    calls.push([cssName, String(entry[1])]);
    if (wrapper && wrapper.style) wrapper.style.setProperty(cssName, String(entry[1]));
    if (wrapper && wrapper.dataset) wrapper.dataset[entry[0]] = String(entry[1]);
  });
  return calls;
}

export function settingsReferenced(code, keys) {
  const surface = [code.html || "", code.css || "", code.js || ""].join(" ");
  return (keys || []).filter(function(key) { return !surface.includes(key); });
}
