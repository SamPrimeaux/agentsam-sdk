import { icon } from "./icons";
import {
  CAMERA_SHOTS, DEFAULT_SCENE_SETTINGS, DEFAULT_STORYBOARD, FINISHES, MOODS, SCENE_PROFILES,
  SCENERY_PROPS, TRANSITIONS, VOICES, VOICE_STYLES,
  type SceneSettings, type StoryBeat,
} from "./samspeaks-controls";
import "./settings-drawer.css";

type Tab = "scene" | "finish" | "camera" | "light" | "samspeaks" | "advanced";
type SamStep = "inspo" | "compose" | "stage" | "direct" | "flow";
type SettingValue = string | number | boolean;
type SettingsState = { sceneSettings: SceneSettings; storyboard: StoryBeat[]; chapter: number; activeBeatIndex?: number };
type SettingsApi = {
  open: (tab?: Tab) => void;
  close: () => void;
  toggle: (tab?: Tab) => void;
  activeTab: () => Tab;
  sync: (state: Partial<SettingsState>) => void;
};
type HostWindow = Window & {
  __samsketchSettings?: SettingsApi;
  __samsketchAssistant?: { close?: () => void };
  __samsketchMiniAgentSam?: { close?: () => void };
};

const tabs: { id: Tab; label: string; glyph: string }[] = [
  { id: "samspeaks", label: "SamSpeaks", glyph: "sparkles" },
  { id: "scene", label: "Scene", glyph: "cube" },
  { id: "finish", label: "Finish", glyph: "palette" },
  { id: "camera", label: "Camera", glyph: "camera" },
  { id: "light", label: "Lighting", glyph: "sun" },
  { id: "advanced", label: "Advanced", glyph: "settings" },
];
const steps: { id: SamStep; label: string }[] = [
  { id: "inspo", label: "Inspo" }, { id: "compose", label: "Compose" },
  { id: "stage", label: "Stage" }, { id: "direct", label: "Direct" }, { id: "flow", label: "Flow" },
];
const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
const field = (label: string, control: string, hint = "") =>
  '<label class="settings-field"><span class="settings-field-label">' + label + '</span>' + control + (hint ? '<small>' + hint + '</small>' : "") + '</label>';
const range = (label: string, key: string, min: number, max: number, step: number, value: number, hint = "") =>
  field(label, '<span class="settings-range"><input type="range" data-setting="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" aria-label="' + label + '"><output>' + value + '</output></span>', hint);
const toggle = (label: string, key: string, checked: boolean, hint = "") =>
  field(label, '<input class="settings-toggle" type="checkbox" data-setting="' + key + '" ' + (checked ? "checked" : "") + ' aria-label="' + label + '">', hint);
const select = (label: string, key: string, options: [string, string][], value: string) =>
  field(label, '<select id="' + key.replaceAll('.', '-') + '" data-setting="' + key + '" aria-label="' + label + '">' + options.map(([v, l]) => '<option value="' + v + '" ' + (v === value ? "selected" : "") + '>' + l + '</option>').join("") + '</select>');
const action = (label: string, key: string, glyph: string, extra = "") =>
  '<button type="button" class="settings-action" data-setting-action="' + key + '" ' + extra + '>' + icon(glyph, 15) + '<span>' + label + '</span></button>';
const choiceButtons = (key: string, items: { id: string; label: string; color?: string }[], active: string, className = "settings-choice-grid") =>
  '<div class="' + className + '">' + items.map(item =>
    '<button type="button" class="settings-choice ' + (item.id === active ? "is-active" : "") + '" data-setting-choice="' + key + '" data-value="' + item.id + '" aria-pressed="' + (item.id === active) + '">' +
    (item.color ? '<span class="settings-choice-swatch" style="background:' + item.color + '"></span>' : "") +
    '<span>' + escapeHtml(item.label) + '</span></button>'
  ).join("") + '</div>';

function renderStoryCards(beats: StoryBeat[], activeIndex: number, compact = false) {
  return '<div class="' + (compact ? "sam-flow-list" : "sam-beat-strip") + '">' + beats.map((beat, index) =>
    '<button type="button" class="sam-beat-card ' + (index === activeIndex ? "is-active" : "") + '" data-beat-index="' + index + '">' +
    '<span class="sam-beat-number">' + String(index + 1).padStart(2, "0") + '</span>' +
    '<span class="sam-beat-copy"><strong>' + escapeHtml(beat.title) + '</strong><small>' + escapeHtml(beat.cameraShot) + ' · ' + escapeHtml(beat.transitionType) + ' · ' + escapeHtml(beat.mood) + '</small></span>' +
    '<span class="sam-beat-dot" style="background:' + (MOODS.find(m => m.id === beat.mood)?.swatchHex || "#64748b") + '"></span></button>'
  ).join("") + '</div>';
}

function renderBeatEditor(beat: StoryBeat | undefined, index: number, total: number) {
  if (!beat) return '<div class="settings-empty">Add a beat to start your SamSpeaks story.</div>';
  return '<div class="sam-beat-editor">' +
    '<div class="sam-beat-editor-head"><span class="settings-section-label">BEAT ' + String(index + 1).padStart(2, "0") + '</span>' +
    '<div class="sam-inline-actions"><button type="button" class="settings-text-action" data-beat-action="preview">Preview shot</button><button type="button" class="settings-text-action" data-beat-action="delete" ' + (total <= 1 ? "disabled" : "") + '>Remove</button></div></div>' +
    '<div class="sam-form-row"><input class="settings-text-input" data-beat-field="title" value="' + escapeHtml(beat.title) + '" aria-label="Beat title"><select data-beat-field="cameraShot" aria-label="Camera shot">' + CAMERA_SHOTS.map(s => '<option value="' + s.id + '" ' + (s.id === beat.cameraShot ? "selected" : "") + '>' + s.label + '</option>').join("") + '</select></div>' +
    '<div class="sam-form-row"><select data-beat-field="transitionType" aria-label="Transition">' + TRANSITIONS.map(t => '<option value="' + t.id + '" ' + (t.id === beat.transitionType ? "selected" : "") + '>' + t.label + '</option>').join("") + '</select>' +
    '<select data-beat-field="mood" aria-label="Atmosphere">' + MOODS.map(m => '<option value="' + m.id + '" ' + (m.id === beat.mood ? "selected" : "") + '>' + m.label + '</option>').join("") + '</select></div>' +
    '<div class="sam-form-row"><select data-beat-field="ttsMode" aria-label="Voice mode"><option value="single" ' + (beat.ttsMode === "single" ? "selected" : "") + '>Single voice</option><option value="dual" ' + (beat.ttsMode === "dual" ? "selected" : "") + '>Dual voice</option></select>' +
    '<select data-beat-field="voiceName" aria-label="Voice">' + VOICES.map(v => '<option value="' + v.name + '" ' + (v.name === beat.voiceName ? "selected" : "") + '>' + v.name + ' · ' + v.tone + '</option>').join("") + '</select></div>' +
    '<input class="settings-text-input" data-beat-field="voiceStyle" value="' + escapeHtml(beat.voiceStyle) + '" aria-label="Voice direction" placeholder="Voice direction">' +
    '<label class="settings-field"><span class="settings-field-label">Exploded view</span><span class="settings-range"><input type="range" data-beat-field="explodeAmount" min="0" max="1" step=".05" value="' + beat.explodeAmount + '"><output>' + Math.round(beat.explodeAmount * 100) + '%</output></span></label>' +
    '<textarea class="settings-textarea" data-beat-field="script" rows="3" aria-label="Narration script">' + escapeHtml(beat.script) + '</textarea>' +
    '<div class="sam-inline-actions"><button type="button" class="settings-action is-primary" data-beat-action="speak">' + icon("waves", 15) + '<span>Preview narration</span></button></div>' +
    '</div>';
}

function renderSamStep(step: SamStep, state: SettingsState, images: { name: string; url: string }[]) {
  const ss = state.sceneSettings;
  const beat = state.storyboard[Math.min(state.storyboard.length - 1, Math.max(0, (state as SettingsState & { activeBeatIndex?: number }).activeBeatIndex || 0))];
  if (step === "inspo") {
    return '<div class="settings-panel-intro"><strong>Reference board</strong><span>Collect visual direction before shaping the scene.</span></div>' +
      '<label class="sam-upload-zone"><input id="sam-inspo-files" type="file" accept="image/*" multiple hidden><span class="sam-upload-icon">' + icon("capture", 22) + '</span><strong>Drop images or browse files</strong><small>Reference images stay in this browser session until a media-library connection is added.</small></label>' +
      (images.length ? '<div class="sam-inspo-grid">' + images.map((img, i) => '<div class="sam-inspo-card"><img src="' + img.url + '" alt="' + escapeHtml(img.name) + '"><span>' + escapeHtml(img.name) + '</span><button type="button" data-inspo-remove="' + i + '" aria-label="Remove reference">×</button></div>').join("") + '</div>' : '<div class="settings-empty">No references added yet.</div>') +
      action("Send reference notes to AgentSam", "inspo.attach", "sparkles", images.length ? "" : "disabled");
  }
  if (step === "compose") {
    return '<div class="settings-panel-intro"><strong>SamSpeaks Composer</strong><span>Describe the scene, pacing and story you want to create.</span></div>' +
      '<textarea id="sam-compose-prompt" class="settings-textarea" rows="4" placeholder="Describe a guided tour, material reveal, lighting transition or creative story..."></textarea>' +
      '<div class="sam-inline-actions">' + action("Compose story with AgentSam", "story.compose", "sparkles") + action("Add beat", "story.add", "plus") + '</div>' +
      '<div class="settings-section-head"><span class="settings-section-label">STORYBOARD · ' + state.storyboard.length + ' BEATS</span></div>' +
      renderStoryCards(state.storyboard, (state as SettingsState & { activeBeatIndex?: number }).activeBeatIndex || 0) +
      renderBeatEditor(beat, (state as SettingsState & { activeBeatIndex?: number }).activeBeatIndex || 0, state.storyboard.length);
  }
  if (step === "stage") {
    return '<div class="settings-panel-intro"><strong>Scene and stage</strong><span>Profiles tune the presentation defaults; they do not replace your current geometry.</span></div>' +
      '<span class="settings-section-label">SCENE PROFILE</span>' +
      choiceButtons("scene.profile", SCENE_PROFILES.map(p => ({ id: p.id, label: p.label, color: p.color })), ss.profile) +
      '<span class="settings-section-label">PBR FINISH</span>' +
      choiceButtons("styles.finish", FINISHES.map(f => ({ id: f.id, label: f.label, color: f.swatchHex })), ss.finish) +
      '<span class="settings-section-label">ATMOSPHERE MOOD</span>' +
      choiceButtons("styles.mood", MOODS.map(m => ({ id: m.id, label: m.label, color: m.swatchHex })), ss.mood) +
      '<div class="settings-section-head"><span class="settings-section-label">SCENERY MAKER</span><small>Insert a procedural prop into the scene</small></div>' +
      '<div class="sam-prop-grid">' + SCENERY_PROPS.map(p => '<button type="button" class="sam-prop-card" data-setting-action="stage.addProp" data-prop="' + p.id + '"><span class="sam-prop-swatch" style="background:' + p.color + '"></span><strong>' + p.label + '</strong><small>' + p.hint + '</small></button>').join("") + '</div>' +
      '<span class="settings-section-label">STAGE CONTROLS</span>' +
      range("Exploded view", "stage.explode", 0, 1, .05, ss.explodeAmount) +
      range("Turntable spin", "stage.spin", 0, 1.6, .04, ss.spinSpeed) +
      range("Key light orbit", "stage.lightAngle", -3.14, 3.14, .05, ss.keyLightAngle) +
      '<div class="sam-inline-actions">' + action(ss.brushEnabled ? "3D brush · On" : "3D brush · Off", "stage.brush", "pen") + action("Clear brush strokes", "stage.clearBrush", "trash") + '</div>';
  }
  if (step === "direct") {
    return '<div class="settings-panel-intro"><strong>Camera and voice direction</strong><span>Direct the shot, delivery and narration for the active scene.</span></div>' +
      '<span class="settings-section-label">CAMERA DIRECTOR</span>' +
      choiceButtons("camera.shot", CAMERA_SHOTS.map(s => ({ id: s.id, label: s.label })), ss.cameraShot) +
      select("Transition", "camera.transition", TRANSITIONS.map(t => [t.id, t.label] as [string, string]), ss.transitionType) +
      toggle("Automatic orbit tour", "camera.autoTour", ss.autoTour) +
      '<span class="settings-section-label">VOICE & SOUND DIRECTION</span>' +
      select("Voice mode", "direct.voiceMode", [["single", "Single narrator"], ["dual", "Dual voice"]] as [string, string][], ss.voiceMode) +
      select("Voice", "direct.voiceName", VOICES.map(v => [v.name, v.name + " · " + v.tone] as [string, string]), ss.voiceName) +
      select("Style preset", "direct.voicePreset", [["", "Choose a style"] as [string, string], ...VOICE_STYLES.map(v => [v.style, v.label] as [string, string])], ss.voiceStyle) +
      '<input id="sam-direct-style" class="settings-text-input" data-setting="direct.voicePreset" value="' + escapeHtml(ss.voiceStyle) + '" placeholder="Warm, articulate design documentary narrator" aria-label="Voice style direction">' +
      '<textarea id="sam-direct-script" class="settings-textarea" data-beat-field="script" rows="4" aria-label="Narration script">' + escapeHtml(beat?.script || "") + '</textarea>' +
      '<div class="sam-inline-actions">' + action("Draft script with AgentSam", "direct.draft", "sparkles") + action("Preview narration", "direct.speak", "waves") + action("Stop", "direct.stop", "stop") + '</div>' +
      '<p class="settings-note">Narration preview uses the browser voice available on this device. SamSpeaks Gemini voice synthesis is a separate runtime integration.</p>';
  }
  return '<div class="settings-panel-intro"><strong>Creativity Flow</strong><span>Review the complete storyboard and play the camera and atmosphere sequence.</span></div>' +
    '<div class="sam-flow-toolbar">' + action("Add beat", "story.add", "plus") + action("Play flow", "story.play", "play") + action("Stop", "story.stop", "stop") + '</div>' +
    renderStoryCards(state.storyboard, (state as SettingsState & { activeBeatIndex?: number }).activeBeatIndex || 0, true) +
    renderBeatEditor(beat, (state as SettingsState & { activeBeatIndex?: number }).activeBeatIndex || 0, state.storyboard.length);
}

function renderPanel(tab: Tab, step: SamStep, state: SettingsState, images: { name: string; url: string }[]) {
  const ss = state.sceneSettings;
  switch (tab) {
    case "scene":
      return '<p class="settings-description">Scene composition, profile and chapter behavior.</p>' +
        '<span class="settings-section-label">SCENE PROFILE</span>' +
        choiceButtons("scene.profile", SCENE_PROFILES.map(p => ({ id: p.id, label: p.label, color: p.color })), ss.profile) +
        select("Active chapter", "scene.chapter", [["0", "01 · Encounter"], ["1", "02 · Unfold"], ["2", "03 · Discover"], ["3", "04 · Experience"]], String(state.chapter)) +
        toggle("Loop presentation", "scene.autoplay", ss.loopPresentation, "Advance through the four presentation chapters.") +
        toggle("Auto-rotate selected geometry", "scene.autorotate", ss.autoTour) +
        action("Frame current scene", "camera.frame", "frame") +
        action("Reset scene view", "scene.reset", "undo");
    case "finish":
      return '<p class="settings-description">Refine the surface response and atmosphere of your scene.</p>' +
        '<span class="settings-section-label">PBR FINISH</span>' +
        choiceButtons("styles.finish", FINISHES.map(f => ({ id: f.id, label: f.label, color: f.swatchHex })), ss.finish) +
        select("Surface treatment", "styles.material", [["clay", "Soft clay"], ["glass", "Optical glass"], ["metal", "Machined metal"]], ss.surfaceTreatment) +
        range("Material roughness", "styles.roughness", .02, 1, .01, ss.roughness) +
        range("Material metalness", "styles.metalness", 0, 1, .01, ss.metalness) +
        '<span class="settings-section-label">ATMOSPHERE MOOD</span>' +
        choiceButtons("styles.mood", MOODS.map(m => ({ id: m.id, label: m.label, color: m.swatchHex })), ss.mood);
    case "camera":
      return '<p class="settings-description">Camera framing, shot language and movement.</p>' +
        choiceButtons("camera.shot", CAMERA_SHOTS.map(s => ({ id: s.id, label: s.label })), ss.cameraShot) +
        select("Transition", "camera.transition", TRANSITIONS.map(t => [t.id, t.label] as [string, string]), ss.transitionType) +
        range("Camera distance", "camera.distance", 4, 35, .25, ss.cameraDistance) +
        range("Field of view", "camera.fov", 20, 70, 1, ss.fieldOfView) +
        toggle("Automatic camera tour", "camera.autoTour", ss.autoTour) +
        action("Frame selected object", "camera.frame", "frame") +
        action("Reset camera", "camera.reset", "camera");
    case "light":
      return '<p class="settings-description">Dynamic studio lighting and atmospheric depth.</p>' +
        choiceButtons("styles.mood", MOODS.map(m => ({ id: m.id, label: m.label, color: m.swatchHex })), ss.mood) +
        range("Key light intensity", "light.key", 0, 5, .05, ss.keyIntensity) +
        range("Key light orbit", "light.angle", -3.14, 3.14, .05, ss.keyLightAngle) +
        range("Ambient color hue", "light.ambientHue", 0, 360, 1, ss.ambientHue) +
        range("Ambient tint", "light.ambientSaturation", 0, 100, 1, ss.ambientSaturation) +
        range("Ambient fill", "light.ambientFill", 0, 2.5, .05, ss.ambientIntensity) +
        range("Shadow softness", "light.shadowSoftness", 1, 6, .25, ss.shadowSoftness) +
        toggle("Cast scene shadows", "light.shadows", ss.shadowsEnabled) +
        toggle("Enable atmospheric fog", "fog.enabled", ss.fogEnabled) +
        range("Fog density", "fog.density", .001, .08, .001, ss.fogDensity) +
        action("Reset lighting", "light.reset", "sun");
    case "samspeaks":
      return '<div class="sam-step-nav" role="tablist" aria-label="SamSpeaks workflow">' + steps.map(s =>
        '<button type="button" role="tab" data-sam-step="' + s.id + '" aria-selected="' + (step === s.id) + '" class="' + (step === s.id ? "is-active" : "") + '">' + s.label + '</button>'
      ).join("") + '</div>' + renderSamStep(step, state, images);
    case "advanced":
      return '<p class="settings-description">Viewport, environment and workspace preferences.</p>' +
        toggle("Wireframe overlay", "effects.wireframe", ss.wireframe) +
        toggle("Ground shadows", "effects.shadows", ss.shadowsEnabled) +
        toggle("Construction grid", "effects.grid", ss.showGrid) +
        toggle("Selection outline", "effects.selection", ss.selectionOutline) +
        select("Environment", "sky.environment", [["studio", "Studio gradient"], ["daylight", "Daylight"], ["overcast", "Overcast"], ["night", "Night studio"]], ss.environment) +
        range("Horizon brightness", "sky.brightness", .4, 2, .05, ss.horizonBrightness) +
        range("Ambient shadow opacity", "shadows.ambient", 0, .6, .01, ss.ambientShadowOpacity) +
        toggle("Reduce motion", "global.reducedMotion", ss.reducedMotion) +
        toggle("Show object properties", "global.properties", ss.showProperties) +
        toggle("Keep timeline visible", "global.timeline", ss.keepTimeline) +
        action("Reset panel layout", "global.resetLayout", "panel") +
        action("Restore defaults", "global.reset", "undo");
  }
}

export function mountSettingsDrawer(host: HTMLElement) {
  host.innerHTML = '<div class="sam-settings-layer" data-open="false">' +
    '<button class="sam-settings-backdrop" type="button" aria-label="Close creative controls" tabindex="-1"></button>' +
    '<aside class="sam-settings-drawer" aria-label="SamSpeaks creative controls" aria-hidden="true">' +
    '<div class="sam-settings-resize" role="separator" aria-orientation="vertical" aria-label="Resize creative controls" tabindex="0"></div>' +
    '<header class="sam-settings-header"><div><span class="settings-eyebrow">SAMSKETCH / SAMSPEAKS</span><strong>Creative controls</strong></div>' +
    '<button class="settings-close" type="button" aria-label="Close creative controls" title="Close creative controls">' + icon("close", 17) + '</button></header>' +
    '<nav class="sam-settings-tabs" role="tablist" aria-label="Creative control categories">' + tabs.map(t =>
      '<button type="button" role="tab" data-settings-tab="' + t.id + '" aria-selected="false" title="' + t.label + '">' + icon(t.glyph, 16) + '<span>' + t.label + '</span></button>'
    ).join("") + '</nav><div class="sam-settings-panel" id="sam-settings-panel"></div></aside></div>';

  const layer = host.querySelector<HTMLElement>(".sam-settings-layer")!;
  const drawer = host.querySelector<HTMLElement>(".sam-settings-drawer")!;
  const panelHost = host.querySelector<HTMLElement>("#sam-settings-panel")!;
  const resizeHandle = host.querySelector<HTMLElement>(".sam-settings-resize")!;
  let active: Tab = "samspeaks";
  let activeStep: SamStep = "stage";
  let width = 390;
  let start: { x: number; width: number } | null = null;
  let state: SettingsState = {
    sceneSettings: { ...DEFAULT_SCENE_SETTINGS },
    storyboard: structuredClone(DEFAULT_STORYBOARD),
    chapter: 0,
  };
  let activeBeatIndex = 0;
  let images: { name: string; url: string }[] = [];

  const sync = (next: Partial<SettingsState>) => {
    if (next.sceneSettings) state.sceneSettings = { ...DEFAULT_SCENE_SETTINGS, ...next.sceneSettings };
    if (next.storyboard) state.storyboard = structuredClone(next.storyboard);
    if (typeof next.activeBeatIndex === "number") activeBeatIndex = next.activeBeatIndex;
    if (typeof next.chapter === "number") state.chapter = next.chapter;
    activeBeatIndex = Math.max(0, Math.min(state.storyboard.length - 1, activeBeatIndex));
    render();
  };
  const render = () => {
    host.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach(button => {
      const selected = button.dataset.settingsTab === active;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    panelHost.innerHTML = renderPanel(active, activeStep, { ...state, activeBeatIndex } as SettingsState, images);
  };
  const api: SettingsApi = {
    open(tab) {
      (window as HostWindow).__samsketchAssistant?.close?.();
      (window as HostWindow).__samsketchMiniAgentSam?.close?.();
      layer.dataset.open = "true";
      drawer.setAttribute("aria-hidden", "false");
      if (tab) active = tab;
      render();
    },
    close() {
      layer.dataset.open = "false";
      drawer.setAttribute("aria-hidden", "true");
    },
    toggle(tab) {
      if (layer.dataset.open === "true" && (!tab || tab === active)) api.close();
      else api.open(tab || active);
    },
    activeTab() { return active; },
    sync,
  };
  (window as HostWindow).__samsketchSettings = api;

  host.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach(button =>
    button.addEventListener("click", () => { active = button.dataset.settingsTab as Tab; render(); })
  );
  host.querySelector<HTMLButtonElement>(".settings-close")?.addEventListener("click", api.close);
  host.querySelector<HTMLButtonElement>(".sam-settings-backdrop")?.addEventListener("click", api.close);

  const dispatchChange = (key: string, value: SettingValue) => {
    const stateMap: Record<string, keyof SceneSettings> = {
      "scene.profile": "profile", "styles.finish": "finish", "styles.mood": "mood",
      "styles.roughness": "roughness", "styles.metalness": "metalness", "styles.material": "surfaceTreatment",
      "scene.autorotate": "autoTour", "scene.autoplay": "loopPresentation", "camera.autoTour": "autoTour", "camera.shot": "cameraShot",
      "camera.transition": "transitionType", "camera.distance": "cameraDistance", "camera.fov": "fieldOfView",
      "stage.explode": "explodeAmount", "stage.spin": "spinSpeed", "stage.lightAngle": "keyLightAngle",
      "stage.brush": "brushEnabled", "light.key": "keyIntensity", "light.angle": "keyLightAngle",
      "light.ambientHue": "ambientHue", "light.ambientSaturation": "ambientSaturation",
      "light.ambientFill": "ambientIntensity", "light.shadowSoftness": "shadowSoftness",
      "light.shadows": "shadowsEnabled", "fog.enabled": "fogEnabled", "fog.density": "fogDensity",
      "effects.wireframe": "wireframe", "effects.shadows": "shadowsEnabled", "effects.grid": "showGrid",
      "effects.selection": "selectionOutline", "direct.voiceMode": "voiceMode", "direct.voiceName": "voiceName", "direct.voicePreset": "voiceStyle",
      "sky.environment": "environment", "sky.brightness": "horizonBrightness", "shadows.ambient": "ambientShadowOpacity",
      "global.reducedMotion": "reducedMotion", "global.properties": "showProperties", "global.timeline": "keepTimeline",
    };
    if (key === "scene.chapter") state.chapter = Number(value);
    else {
      const prop = stateMap[key];
      if (prop) (state.sceneSettings as unknown as Record<string, SettingValue>)[prop] = value;
    }
    if (key === "scene.profile") {
      const profile = SCENE_PROFILES.find(item => item.id === value);
      if (profile) { state.sceneSettings.finish = profile.finish; state.sceneSettings.mood = profile.mood; }
    }
    if (key === "styles.finish") {
      const preset = FINISHES.find(item => item.id === value);
      if (preset) { state.sceneSettings.surfaceTreatment = "metal"; state.sceneSettings.roughness = preset.roughness; state.sceneSettings.metalness = preset.metalness; }
    }
    if (key === "styles.mood") {
      const mood = MOODS.find(item => item.id === value);
      if (mood) { state.sceneSettings.keyIntensity = mood.keyIntensity; state.sceneSettings.ambientIntensity = mood.ambientIntensity; state.sceneSettings.fogDensity = mood.fogDensity; }
    }
    if (key === "camera.shot") {
      const shot = CAMERA_SHOTS.find(item => item.id === value);
      if (shot) state.sceneSettings.cameraDistance = shot.distance;
    }
    if (key === "stage.spin") state.sceneSettings.autoTour = Number(value) > 0;
    if (key === "scene.autorotate" || key === "camera.autoTour") {
      state.sceneSettings.autoTour = Boolean(value);
      if (state.sceneSettings.autoTour && state.sceneSettings.spinSpeed <= 0) state.sceneSettings.spinSpeed = DEFAULT_SCENE_SETTINGS.spinSpeed;
    }
    window.dispatchEvent(new CustomEvent("samsketch:settings.change", { detail: { key, value, tab: active } }));
  };

  panelHost.addEventListener("input", event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const key = target.dataset.setting;
    if (key) {
      let value: SettingValue;
      if (target instanceof HTMLInputElement && target.type === "checkbox") value = target.checked;
      else if (target instanceof HTMLInputElement && target.type === "range") value = Number(target.value);
      else value = target.value;
      const output = target.parentElement?.querySelector("output");
      if (output && typeof value === "number") output.textContent = String(value);
      dispatchChange(key, value);
    }
    const beatField = target.dataset.beatField as keyof StoryBeat | undefined;
    if (beatField) {
      const beat = state.storyboard[activeBeatIndex];
      if (!beat) return;
      const raw = target instanceof HTMLInputElement && target.type === "range" ? Number(target.value) : target.value;
      (beat as unknown as Record<string, string | number>)[beatField] = beatField === "explodeAmount" ? Number(raw) : raw;
      window.dispatchEvent(new CustomEvent("samsketch:storyboard.change", { detail: { beats: structuredClone(state.storyboard) } }));
      const output = target.parentElement?.querySelector("output");
      if (output && beatField === "explodeAmount") output.textContent = Math.round(Number(raw) * 100) + "%";
    }
  });

  panelHost.addEventListener("change", event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const key = target.dataset.setting;
    if (key) {
      const value: SettingValue = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked :
        target instanceof HTMLInputElement && target.type === "range" ? Number(target.value) : target.value;
      dispatchChange(key, value);
    }
    const beatField = target.dataset.beatField as keyof StoryBeat | undefined;
    if (beatField) {
      const beat = state.storyboard[activeBeatIndex];
      if (!beat) return;
      const value = beatField === "explodeAmount" ? Number(target.value) : target.value;
      (beat as unknown as Record<string, string | number>)[beatField] = value;
      window.dispatchEvent(new CustomEvent("samsketch:storyboard.change", { detail: { beats: structuredClone(state.storyboard) } }));
    }
  });

  panelHost.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    const step = target.closest<HTMLButtonElement>("[data-sam-step]");
    if (step) { activeStep = step.dataset.samStep as SamStep; render(); return; }

    const choice = target.closest<HTMLButtonElement>("[data-setting-choice]");
    if (choice) {
      const key = choice.dataset.settingChoice!;
      const value = choice.dataset.value!;
      dispatchChange(key, value);
      render();
      return;
    }

    const beatIndex = target.closest<HTMLButtonElement>("[data-beat-index]");
    if (beatIndex) { activeBeatIndex = Number(beatIndex.dataset.beatIndex); render(); return; }

    const beatAction = target.closest<HTMLButtonElement>("[data-beat-action]");
    if (beatAction) {
      const actionName = beatAction.dataset.beatAction;
      if (actionName === "delete" && state.storyboard.length > 1) {
        state.storyboard.splice(activeBeatIndex, 1);
        activeBeatIndex = Math.max(0, activeBeatIndex - 1);
        window.dispatchEvent(new CustomEvent("samsketch:storyboard.change", { detail: { beats: structuredClone(state.storyboard) } }));
        render();
      } else if (actionName === "preview") {
        const beat = state.storyboard[activeBeatIndex];
        if (beat) window.dispatchEvent(new CustomEvent("samsketch:storyboard.preview", { detail: { beat } }));
      } else if (actionName === "speak") {
        const beat = state.storyboard[activeBeatIndex];
        if (beat) window.dispatchEvent(new CustomEvent("samsketch:settings.action", { detail: { action: "story.speak", beat } }));
      }
      return;
    }

    const removeImage = target.closest<HTMLButtonElement>("[data-inspo-remove]");
    if (removeImage) {
      const index = Number(removeImage.dataset.inspoRemove);
      const removed = images.splice(index, 1)[0];
      if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
      render();
      return;
    }

    const settingAction = target.closest<HTMLButtonElement>("[data-setting-action]");
    if (settingAction) {
      const actionName = settingAction.dataset.settingAction!;
      const detail: Record<string, unknown> = { action: actionName, tab: active };
      if (settingAction.dataset.prop) detail.prop = settingAction.dataset.prop;
      if (actionName === "story.add") {
        const n = state.storyboard.length + 1;
        const beat: StoryBeat = { id: "beat-" + Date.now(), title: String(n).padStart(2, "0") + " · New Scene", script: "Move into the next chapter of this scene.", ttsMode: "single", voiceName: "Kore", voiceStyle: "Warm cinematic narrator", cameraShot: "hero", transitionType: "glide", mood: state.sceneSettings.mood, explodeAmount: 0 };
        state.storyboard.push(beat); activeBeatIndex = state.storyboard.length - 1;
        window.dispatchEvent(new CustomEvent("samsketch:storyboard.change", { detail: { beats: structuredClone(state.storyboard) } }));
        render(); return;
      }
      if (actionName === "story.compose") detail.prompt = (panelHost.querySelector("#sam-compose-prompt") as HTMLTextAreaElement | null)?.value || "";
      if (actionName === "direct.draft" || actionName === "direct.speak") {
        detail.script = (panelHost.querySelector("#sam-direct-script") as HTMLTextAreaElement | null)?.value || "";
        detail.voiceName = (panelHost.querySelector("#direct-voiceName") as HTMLSelectElement | null)?.value || "Kore";
        detail.voiceStyle = (panelHost.querySelector("#sam-direct-style") as HTMLInputElement | null)?.value || "";
        detail.voiceMode = (panelHost.querySelector("#direct-voiceMode") as HTMLSelectElement | null)?.value || "single";
      }
      if (actionName === "inspo.attach") detail.images = images.map(img => img.name);
      window.dispatchEvent(new CustomEvent("samsketch:settings.action", { detail }));
      return;
    }
  });

  panelHost.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.id !== "sam-inspo-files") return;
    const files = Array.from(target.files || []).filter(file => file.type.startsWith("image/")).slice(0, 6);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      images.push({ name: file.name, url });
    }
    images = images.slice(-6);
    render();
    window.dispatchEvent(new CustomEvent("samsketch:inspo.change", { detail: { names: images.map(img => img.name) } }));
  });

  resizeHandle.addEventListener("pointerdown", event => {
    event.preventDefault(); start = { x: event.clientX, width };
    resizeHandle.setPointerCapture(event.pointerId);
  });
  resizeHandle.addEventListener("pointermove", event => {
    if (!start) return;
    width = Math.max(320, Math.min(Math.min(680, window.innerWidth - 20), start.width + start.x - event.clientX));
    drawer.style.setProperty("--settings-width", width + "px");
  });
  const stop = () => { start = null; };
  resizeHandle.addEventListener("pointerup", stop);
  resizeHandle.addEventListener("pointercancel", stop);
  resizeHandle.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") width = Math.min(Math.min(680, window.innerWidth - 20), width + 24);
    if (event.key === "ArrowRight") width = Math.max(320, width - 24);
    drawer.style.setProperty("--settings-width", width + "px");
  });
  render();
  return api;
}
