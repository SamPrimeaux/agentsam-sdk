import { icon } from "./icons";
import "./settings-drawer.css";

type Tab = "scene" | "styles" | "camera" | "light" | "simulation" | "effects" | "fog" | "sky" | "shadows" | "global";
type SettingValue = string | number | boolean;
type SettingsApi = { open: (tab?: Tab) => void; close: () => void; toggle: (tab?: Tab) => void; activeTab: () => Tab };
type HostWindow = Window & { __samsketchSettings?: SettingsApi; __samsketchAssistant?: { close?: () => void }; __samsketchMiniAgentSam?: { close?: () => void } };

const isDashboard = location.pathname === "/" || location.pathname === "";
const materialOptions: [string, string][] = isDashboard
  ? [["clay","Soft clay"],["glass","Glass"],["metal","Brushed metal"],["source","Source materials"]]
  : [["clay","Soft clay"],["glass","Glass"],["metal","Brushed metal"]];
const tabs: { id: Tab; label: string; glyph: string }[] = [
  { id: "scene", label: "Scene", glyph: "cube" },
  { id: "styles", label: "Styles", glyph: "palette" },
  { id: "camera", label: "Camera", glyph: "camera" },
  { id: "light", label: "Light", glyph: "sun" },
  { id: "simulation", label: "Simulation", glyph: "play" },
  { id: "effects", label: "Effects", glyph: "sparkles" },
  { id: "fog", label: "Fog", glyph: "cloud-fog" },
  { id: "sky", label: "Sky", glyph: "cloud" },
  { id: "shadows", label: "Ambient Shadows", glyph: "eye" },
  { id: "global", label: "Global Settings", glyph: "settings" },
];

function field(label: string, control: string, hint = "") {
  return `<label class="settings-field"><span class="settings-field-label">${label}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
}
function range(label: string, key: string, min: number, max: number, step: number, value: number, hint = "") {
  return field(label, `<span class="settings-range"><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><output>${value}</output></span>`, hint);
}
function toggle(label: string, key: string, checked: boolean, hint = "") {
  return field(label, `<input class="settings-toggle" type="checkbox" data-setting="${key}" ${checked ? "checked" : ""} aria-label="${label}">`, hint);
}
function select(label: string, key: string, options: [string, string][], value: string) {
  return field(label, `<select data-setting="${key}" aria-label="${label}">${options.map(([v,l]) => `<option value="${v}" ${v===value?"selected":""}>${l}</option>`).join("")}</select>`);
}
function action(label: string, key: string, glyph: string) {
  return `<button type="button" class="settings-action" data-setting-action="${key}">${icon(glyph,15)}<span>${label}</span></button>`;
}

function panel(tab: Tab) {
  switch (tab) {
    case "scene": return `
      <p class="settings-description">Scene composition and the active chapter.</p>
      ${select("Active chapter","scene.chapter",[["0","01 · Sculpt"],["1","02 · Draft"],["2","03 · Engineer"],["3","04 · Deliver"]],"0")}
      ${toggle("Loop the presentation","scene.autoplay",isDashboard,"Advance through all four scenes.")}
      ${toggle("Auto-rotate selected geometry","scene.autorotate",isDashboard)}
      ${action("Frame current scene","camera.frame","frame")}
      ${action("Reset scene view","scene.reset","undo")}`;
    case "styles": return `
      <p class="settings-description">Surface treatment and presentation colors.</p>
      ${select("Material treatment","styles.material",materialOptions,"clay")}
      ${select("Workspace backdrop","styles.backdrop",[["blue","Blue studio"],["neutral","Warm neutral"],["slate","Midnight slate"],["paper","Soft paper"]],"blue")}
      ${range("Material roughness","styles.roughness",0,1,.01,isDashboard?.72:.82)}
      ${range("Material metalness","styles.metalness",0,1,.01,.08)}
      ${action("Restore presentation style","styles.reset","undo")}`;
    case "camera": return `
      <p class="settings-description">Camera framing, orbit and field of view.</p>
      ${range("Camera distance","camera.distance",5,24,.25,isDashboard?12.5:18.5)}
      ${range("Field of view","camera.fov",20,70,1,isDashboard?34:37)}
      ${toggle("Orbit interaction","camera.orbit",true)}
      ${action("Frame selected object","camera.frame","frame")}
      ${action("Reset camera","camera.reset","camera")}`;
    case "light": return `
      <p class="settings-description">Control the scene's key and fill lights.</p>
      ${range("Key light intensity","light.key",0,8,.1,isDashboard?4.2:3.5)}
      ${range("Fill light intensity","light.fill",0,5,.1,isDashboard?2.4:2.1)}
      ${select("Light temperature","light.temperature",[["neutral","Neutral"],["cool","Cool daylight"],["warm","Warm studio"]],"neutral")}
      ${toggle("Cast shadows","light.shadows",true)}
      ${action("Reset lighting","light.reset","sun")}`;
    case "simulation": return `
      <p class="settings-description">Animation, playback and scene motion.</p>
      ${toggle("Automatic chapter playback","simulation.autoplay",isDashboard)}
      ${range("Scene rotation speed","simulation.speed",0,.02,.001,.003)}
      ${action("Play presentation","simulation.play","play")}
      ${action("Pause presentation","simulation.pause","pause")}`;
    case "effects": return `
      <p class="settings-description">Geometry display and viewport effects.</p>
      ${toggle("Wireframe overlay","effects.wireframe",false)}
      ${toggle("Ground shadows","effects.shadows",true)}
      ${toggle("Construction grid","effects.grid",false)}
      ${toggle("Selection outline","effects.selection",true)}
      ${action("Clear viewport effects","effects.reset","undo")}`;
    case "fog": return `
      <p class="settings-description">Atmospheric depth for the current scene.</p>
      ${toggle("Enable scene fog","fog.enabled",false)}
      ${range("Fog density","fog.density",.001,.08,.001,.012)}
      ${select("Fog color","fog.color",[["backdrop","Match backdrop"],["blue","#DDE7F8"],["neutral","#E8E4DD"],["slate","#222B3D"]],"backdrop")}`;
    case "sky": return `
      <p class="settings-description">Environment color and horizon balance.</p>
      ${select("Environment","sky.environment",[["studio","Studio gradient"],["daylight","Daylight"],["overcast","Overcast"],["night","Night studio"]],"studio")}
      ${range("Horizon brightness","sky.brightness",.4,2,.05,isDashboard?1:1.55)}
      ${toggle("Show horizon grid","sky.horizon",true)}`;
    case "shadows": return `
      <p class="settings-description">Contact and ambient shadow intensity.</p>
      ${range("Ambient shadow opacity","shadows.ambient",0,.6,.01,isDashboard?.23:.13)}
      ${range("Shadow softness","shadows.softness",1,6,.25,3)}
      ${toggle("Receive ground shadows","shadows.ground",true)}
      ${toggle("Contact shadow","shadows.contact",true)}`;
    case "global": return `
      <p class="settings-description">Workspace behavior and panel preferences.</p>
      <p class="settings-description">Appearance inherits AgentSam Settings.</p>
      ${toggle("Reduce motion","global.reducedMotion",matchMedia("(prefers-reduced-motion: reduce)").matches)}
      ${toggle("Show object properties","global.properties",true)}
      ${toggle("Keep timeline visible","global.timeline",true)}
      ${action("Reset panel layout","global.resetLayout","panel")}
      ${action("Restore defaults","global.reset","undo")}`;
  }
}

export function mountSettingsDrawer(host: HTMLElement) {
  host.innerHTML = `
    <div class="sam-settings-layer" data-open="false">
      <button class="sam-settings-backdrop" type="button" aria-label="Close settings panel" tabindex="-1"></button>
      <aside class="sam-settings-drawer" aria-label="Scene settings" aria-hidden="true">
        <div class="sam-settings-resize" role="separator" aria-orientation="vertical" aria-label="Resize settings panel" tabindex="0"></div>
        <header class="sam-settings-header">
          <div><span class="settings-eyebrow">SAMSKETCH / INSPECTOR</span><strong>Scene settings</strong></div>
          <button class="settings-close" type="button" aria-label="Close settings panel" title="Close settings panel">${icon("close",17)}</button>
        </header>
        <nav class="sam-settings-tabs" role="tablist" aria-label="Scene setting categories">${tabs.map(t=>`<button type="button" role="tab" data-settings-tab="${t.id}" aria-selected="false" title="${t.label}">${icon(t.glyph,16)}<span>${t.label}</span></button>`).join("")}</nav>
        <div class="sam-settings-panel" id="sam-settings-panel"></div>
      </aside>
    </div>`;
  const layer=host.querySelector<HTMLElement>(".sam-settings-layer")!;
  const drawer=host.querySelector<HTMLElement>(".sam-settings-drawer")!;
  const panelHost=host.querySelector<HTMLElement>("#sam-settings-panel")!;
  const resizeHandle=host.querySelector<HTMLElement>(".sam-settings-resize")!;
  let active:Tab="scene",width=365,start:{x:number;width:number}|null=null;
  const render=(tab:Tab)=>{
    active=tab;
    host.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach(button=>{
      const selected=button.dataset.settingsTab===tab;
      button.classList.toggle("is-active",selected);button.setAttribute("aria-selected",String(selected));
    });
    panelHost.innerHTML=panel(tab);
  };
  const api:SettingsApi={
    open(tab){(window as HostWindow).__samsketchAssistant?.close?.();(window as HostWindow).__samsketchMiniAgentSam?.close?.();layer.dataset.open="true";drawer.setAttribute("aria-hidden","false");render(tab||active);},
    close(){layer.dataset.open="false";drawer.setAttribute("aria-hidden","true");},
    toggle(tab){if(layer.dataset.open==="true"&&(!tab||tab===active))api.close();else api.open(tab||active);},
    activeTab(){return active;}
  };
  (window as HostWindow).__samsketchSettings=api;
  host.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach(button=>button.addEventListener("click",()=>render(button.dataset.settingsTab as Tab)));
  host.querySelector<HTMLButtonElement>(".settings-close")?.addEventListener("click",api.close);
  host.querySelector<HTMLButtonElement>(".sam-settings-backdrop")?.addEventListener("click",api.close);
  panelHost.addEventListener("input",event=>{
    const target=event.target as HTMLInputElement|HTMLSelectElement;
    const key=target.dataset.setting;if(!key)return;
    let value:SettingValue;
    if(target instanceof HTMLInputElement&&target.type==="checkbox")value=target.checked;
    else if(target instanceof HTMLInputElement&&target.type==="range")value=Number(target.value);
    else value=target.value;
    const output=target.parentElement?.querySelector("output");if(output&&typeof value==="number")output.textContent=String(value);
    window.dispatchEvent(new CustomEvent("samsketch:settings.change",{detail:{key,value,tab:active}}));
  });
  panelHost.addEventListener("click",event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-setting-action]");
    if(button)window.dispatchEvent(new CustomEvent("samsketch:settings.action",{detail:{action:button.dataset.settingAction,tab:active}}));
  });
  resizeHandle.addEventListener("pointerdown",event=>{event.preventDefault();start={x:event.clientX,width};resizeHandle.setPointerCapture(event.pointerId);});
  resizeHandle.addEventListener("pointermove",event=>{if(!start)return;width=Math.max(300,Math.min(Math.min(680,window.innerWidth-20),start.width+start.x-event.clientX));drawer.style.setProperty("--settings-width",width+"px");});
  const stop=()=>{start=null;};resizeHandle.addEventListener("pointerup",stop);resizeHandle.addEventListener("pointercancel",stop);
  resizeHandle.addEventListener("keydown",event=>{if(event.key==="ArrowLeft")width=Math.min(Math.min(680,window.innerWidth-20),width+24);if(event.key==="ArrowRight")width=Math.max(300,width-24);drawer.style.setProperty("--settings-width",width+"px");});
  render("scene");
  return api;
}
