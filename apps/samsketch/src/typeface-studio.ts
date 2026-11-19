import "../../../packages/agentsam-nav/src/shell.css";
import { observeShellAppearance } from "./shell-appearance";
import * as opentype from "opentype.js";
import { createInitialTypeface, validateTypeface, type Point, type GlyphContour, type TypefaceDocument, type TypefaceGlyph } from "./typeface/model";
import "./typeface-studio.css";

const KEY = "agentsam:samsketch:inneranimal-typeface-001:v1";
const VIEW = { x: 80, baseline: 760, scale: 0.78 };
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("SamSketch root is missing");
let doc = load();
let selected = "A";
let selectedNode: { contour: number; point: number } | null = null;
let tool: "select" | "draw" = "select";
let draft: Point[] = [];
let drag: { contour: number; point: number; pointerId: number } | null = null;
let undoStack: string[] = [];
let redoStack: string[] = [];
let previewText = "INNERANIMAL";
let group: "uppercase" | "lowercase" | "numbers" | "symbols" = "uppercase";
let saveTimer = 0;

function load(): TypefaceDocument {
  try {
    const value = localStorage.getItem(KEY);
    if (value) {
      const parsed: unknown = JSON.parse(value);
      if (validateTypeface(parsed)) return parsed;
    }
  } catch { /* use bundled source */ }
  return createInitialTypeface();
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c] || c));
}
function glyph(): TypefaceGlyph { return doc.glyphs[selected] || doc.glyphs.A; }
function saveState(text: string): void {
  const el = root?.querySelector<HTMLElement>("[data-save]");
  if (el) el.textContent = text;
}
function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(doc)); saveState("Saved in this browser"); }
  catch { saveState("Export source JSON to keep your work"); }
}
function scheduleSave(): void {
  saveState("Unsaved changes");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 250);
}
function snapshot(): void {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}
function undo(): void {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(doc));
  doc = JSON.parse(undoStack.pop()!) as TypefaceDocument;
  selectedNode = null; scheduleSave(); render();
}
function redo(): void {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(doc));
  doc = JSON.parse(redoStack.pop()!) as TypefaceDocument;
  selectedNode = null; scheduleSave(); render();
}
function pathData(items: GlyphContour[]): string {
  return items.map((item) => {
    if (item.points.length < 3) return "";
    const p = item.points;
    return "M " + p[0][0] + " " + p[0][1] + " " + p.slice(1).map(([x,y]) => "L " + x + " " + y).join(" ") + " Z";
  }).filter(Boolean).join(" ");
}
function signedArea(points: Point[]): number {
  return points.reduce((sum,p,i) => {
    const n = points[(i+1)%points.length];
    return sum + p[0]*n[1] - n[0]*p[1];
  },0)/2;
}
function fontPath(items: GlyphContour[]): InstanceType<typeof opentype.Path> {
  const path = new opentype.Path();
  for (const item of items) {
    if (item.points.length < 3) continue;
    const positive = Boolean(item.hole);
    const points = (signedArea(item.points) > 0) === positive ? item.points : [...item.points].reverse();
    path.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x,y]) => path.lineTo(x,y));
    path.close();
  }
  return path;
}
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSource(): void {
  download(new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),"inneranimal-typeface-001.source.json");
}
function exportFont(): void {
  try {
    const nd = new opentype.Path();
    nd.moveTo(70,0); nd.lineTo(70,700); nd.lineTo(530,700); nd.lineTo(530,0); nd.close();
    nd.moveTo(150,80); nd.lineTo(450,80); nd.lineTo(450,620); nd.lineTo(150,620); nd.close();
    const glyphs = [new opentype.Glyph({name:".notdef",unicode:0,advanceWidth:620,path:nd})];
    Object.values(doc.glyphs).sort((a,b)=>a.unicode-b.unicode).forEach((g) => {
      glyphs.push(new opentype.Glyph({name:g.name,unicode:g.unicode,advanceWidth:Math.max(80,Math.round(g.advanceWidth)),path:fontPath(g.contours)}));
    });
    const font = new opentype.Font({
      familyName:doc.familyName, styleName:doc.styleName, unitsPerEm:doc.unitsPerEm,
      ascender:doc.metrics.ascender, descender:doc.metrics.descender, glyphs,
    });
    download(new Blob([font.toArrayBuffer()],{type:"font/ttf"}),"inneranimal-display-regular.ttf");
    saveState("TTF exported");
  } catch (error) {
    saveState(error instanceof Error ? error.message : "Font export failed");
  }
}
function importSource(file: File): void {
  void file.text().then((text) => {
    const value: unknown = JSON.parse(text);
    if (!validateTypeface(value)) throw new Error("Unsupported InnerAnimal source file");
    snapshot(); doc = value; selected = "A"; selectedNode = null; scheduleSave(); render();
  }).catch((error) => saveState(error instanceof Error ? error.message : "Import failed"));
}
function chars(): string[] {
  if (group === "uppercase") return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  if (group === "lowercase") return [..."abcdefghijklmnopqrstuvwxyz"];
  if (group === "numbers") return [..."0123456789"];
  return [".",",",":",";","!","?","-","_","=","+","/","\\","'",'"',"(",")"];
}
function renderRail(): void {
  const rail = root!.querySelector<HTMLElement>("[data-rail]")!;
  rail.innerHTML = chars().map((c) => {
    const traced = doc.glyphs[c]?.source === "wordmark-trace";
    return '<button class="tf-glyph' + (c===selected ? ' is-active' : '') + '" data-char="' + esc(c) + '" aria-pressed="' + (c===selected) + '"><span>' + esc(c) + '</span><i class="' + (traced ? 'is-traced' : '') + '"></i></button>';
  }).join("");
  root!.querySelector<HTMLElement>("[data-count]")!.textContent = Object.keys(doc.glyphs).length + " glyphs · 7 traced masters";
}
function renderCanvas(): void {
  const svg = root!.querySelector<SVGSVGElement>("[data-canvas]")!;
  const g = glyph();
  const y = (v:number) => VIEW.baseline - v*VIEW.scale;
  const guides: [string,number][] = [
    ["ASCENDER",doc.metrics.ascender],["CAP HEIGHT",doc.metrics.capHeight],
    ["X-HEIGHT",doc.metrics.xHeight],["BASELINE",0],["DESCENDER",doc.metrics.descender],
  ];
  const guideMarkup = guides.map(([name,value]) =>
    '<g class="tf-guide"><line x1="44" x2="876" y1="' + y(value) + '" y2="' + y(value) + '"/><text x="18" y="' + (y(value)-5) + '">' + name + '</text></g>'
  ).join("");
  const nodes = g.contours.map((c,ci) => c.points.map(([x,yy],pi) => {
    const active = selectedNode?.contour===ci && selectedNode.point===pi;
    return '<circle class="tf-node' + (active ? ' is-selected' : '') + '" data-node="' + ci + ':' + pi + '" cx="' + x + '" cy="' + yy + '" r="' + (active?8:6) + '"/>';
  }).join("")).join("");
  const draftNodes = draft.map(([x,yy]) => '<circle class="tf-draft-node" cx="' + x + '" cy="' + yy + '" r="5"/>').join("");
  const draftLine = draft.length ? '<polyline class="tf-draft" points="' + draft.map((p)=>p.join(",")).join(" ") + '"/>' + draftNodes : "";
  svg.innerHTML =
    '<defs><pattern id="tf-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="currentColor" stroke-opacity=".07"/></pattern>' +
    '<pattern id="tf-grid-small" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".035"/></pattern></defs>' +
    '<rect width="920" height="930" fill="url(#tf-grid-small)"/><rect width="920" height="930" fill="url(#tf-grid)"/>' + guideMarkup +
    '<g transform="translate(' + VIEW.x + ' ' + VIEW.baseline + ') scale(' + VIEW.scale + ' -' + VIEW.scale + ')">' +
    '<path class="tf-outline" d="' + pathData(g.contours) + '" fill-rule="evenodd"/>' +
    (tool==="select" ? nodes : "") + draftLine + '</g>';
}
function renderInspector(): void {
  const panel = root!.querySelector<HTMLElement>("[data-inspector]")!;
  const g = glyph();
  const node = selectedNode ? g.contours[selectedNode.contour]?.points[selectedNode.point] : null;
  const count = g.contours.reduce((n,c)=>n+c.points.length,0);
  panel.innerHTML =
    '<section><header>Glyph properties <span>' + (g.source==="wordmark-trace"?"TRACED":"CONSTRUCTED") + '</span></header>' +
    '<div class="tf-identity"><b>' + esc(g.character===" "?"Space":g.character) + '</b><div><strong>' + esc(g.name) + '</strong><small>U+' + g.unicode.toString(16).toUpperCase().padStart(4,"0") + '</small></div></div>' +
    '<label>Advance width<input type="number" min="80" max="1600" data-field="advanceWidth" value="' + g.advanceWidth + '"></label>' +
    '<label>Left sidebearing<input type="number" min="-300" max="500" data-field="leftSideBearing" value="' + g.leftSideBearing + '"></label>' +
    '<div class="tf-stats"><span>Contours <b>' + g.contours.length + '</b></span><span>Nodes <b>' + count + '</b></span></div></section>' +
    '<section><header>Selected node</header>' +
    (node ? '<div class="tf-node-fields"><label>X<input type="number" data-node-field="x" value="' + node[0] + '"></label><label>Y<input type="number" data-node-field="y" value="' + node[1] + '"></label></div><button data-action="delete-node">Delete node</button>' : '<p>Select a point on the glyph to edit its exact coordinates.</p>') +
    '</section><section><header>Font metrics</header>' +
    '<label>Cap height<input type="number" data-metric="capHeight" value="' + doc.metrics.capHeight + '"></label>' +
    '<label>X-height<input type="number" data-metric="xHeight" value="' + doc.metrics.xHeight + '"></label>' +
    '<label>Stem target<input type="number" data-metric="stemWidth" value="' + doc.metrics.stemWidth + '"></label>' +
    '<label>Preview tracking<input type="number" data-metric="tracking" value="' + doc.tracking + '"></label></section>' +
    '<section><header>Construction source</header><p>' + (g.source==="wordmark-trace" ? "Traced from the original INNERANIMAL wordmark; the contour remains editable." : "Custom-constructed from the measured proportions, angles and terminal language of the original wordmark.") + '</p></section>';
}
function renderPreview(): void {
  const el = root!.querySelector<HTMLElement>("[data-preview]")!;
  const input = root!.querySelector<HTMLInputElement>("[data-preview-input]")!;
  if (input.value !== previewText) input.value = previewText;
  const scale = 0.19; let x = 18; const paths: string[] = [];
  for (const char of previewText) {
    const g = doc.glyphs[char] || doc.glyphs[char.toUpperCase()] || doc.glyphs[" "];
    if (!g) continue;
    if (g.contours.length) paths.push('<path d="' + pathData(g.contours) + '" transform="translate(' + x + ' 150) scale(' + scale + ' -' + scale + ')"/>');
    x += (g.advanceWidth + doc.tracking)*scale;
  }
  const width = Math.max(720,x+24);
  el.innerHTML = '<svg viewBox="0 0 ' + width + ' 205" role="img" aria-label="Typeface preview"><line x1="0" y1="150" x2="' + width + '" y2="150"/><g>' + paths.join("") + '</g></svg>';
}
function render(): void {
  renderRail(); renderCanvas(); renderInspector(); renderPreview();
  root!.querySelector<HTMLElement>("[data-current]")!.textContent = selected;
  root!.querySelector<HTMLElement>("[data-current-meta]")!.textContent =
    "U+" + glyph().unicode.toString(16).toUpperCase().padStart(4,"0") + " · " + (glyph().source==="wordmark-trace"?"Original wordmark trace":"Custom construction");
  root!.querySelector<HTMLInputElement>("[data-family]")!.value = doc.familyName;
}
function coords(svg:SVGSVGElement,cx:number,cy:number):Point {
  const p=svg.createSVGPoint(); p.x=cx; p.y=cy;
  const m=svg.getScreenCTM(); if(!m) return [0,0];
  const v=p.matrixTransform(m.inverse());
  return [Math.round((v.x-VIEW.x)/VIEW.scale),Math.round((VIEW.baseline-v.y)/VIEW.scale)];
}
function finishContour():void {
  if(draft.length<3) return;
  snapshot(); glyph().contours.push({points:clone(draft)}); draft=[]; tool="select"; scheduleSave(); render();
}
function selectGlyph(c:string):void {
  if(!doc.glyphs[c]) return;
  selected=c; selectedNode=null; draft=[]; tool="select"; render();
}
function mount():void {
  document.title="Typeface Studio · SamSketch";
  root!.innerHTML =
    '<div class="tf-app"><header class="tf-topbar"><div class="tf-brand"><button data-action="back">← <span>SamSketch</span></button><i></i><div><strong>Typeface Studio</strong><small>InnerAnimal · Typeface 001</small></div></div>' +
    '<div class="tf-actions"><span data-save role="status">Saved in this browser</span><button data-action="source">Source JSON</button><button data-action="font" class="tf-primary">Export TTF</button><label class="tf-import">Import source<input type="file" accept=".json,application/json" data-import hidden></label></div></header>' +
    '<div class="tf-layout"><aside class="tf-glyph-panel"><div class="tf-panel-title"><div><small>CHARACTER SET</small><strong>Glyph inventory</strong></div><span data-count></span></div>' +
    '<nav class="tf-tabs"><button data-group="uppercase" class="is-active">A–Z</button><button data-group="lowercase">a–z</button><button data-group="numbers">0–9</button><button data-group="symbols">Symbols</button></nav>' +
    '<div class="tf-rail" data-rail></div><p class="tf-source-note">Seven original glyphs are traced from your wordmark. All remaining characters are custom constructions in the same design system.</p>' +
    '<label class="tf-family">Font family<input data-family value="' + esc(doc.familyName) + '"></label></aside>' +
    '<main class="tf-editor"><div class="tf-editor-head"><div><small>EDITING GLYPH</small><strong data-current>A</strong><span data-current-meta></span></div>' +
    '<div class="tf-tools"><button data-tool="select" class="is-active">Select nodes</button><button data-tool="draw">Draw contour</button><button data-action="finish" hidden>Finish contour</button><button data-action="undo">Undo</button><button data-action="redo">Redo</button></div></div>' +
    '<div class="tf-canvas-wrap"><svg data-canvas viewBox="0 0 920 930" role="img" aria-label="Drag glyph nodes to edit vector outlines" tabindex="0"></svg></div>' +
    '<section class="tf-preview-panel"><div><div><small>LIVE SPECIMEN</small><strong>Test your typeface</strong></div><input data-preview-input aria-label="Preview text" value="' + esc(previewText) + '"></div><div data-preview></div></section></main>' +
    '<aside class="tf-inspector" data-inspector></aside></div></div>';
  root!.addEventListener("click",(e)=>{
    const t=e.target as HTMLElement;
    const tab=t.closest<HTMLButtonElement>("[data-group]");
    if(tab){group=tab.dataset.group as typeof group;root!.querySelectorAll<HTMLButtonElement>("[data-group]").forEach(b=>b.classList.toggle("is-active",b===tab));renderRail();return;}
    const char=t.closest<HTMLButtonElement>("[data-char]");
    if(char){selectGlyph(char.dataset.char||"A");return;}
    const toolBtn=t.closest<HTMLButtonElement>("[data-tool]");
    if(toolBtn){tool=toolBtn.dataset.tool==="draw"?"draw":"select";draft=[];selectedNode=null;renderCanvas();return;}
    const action=t.closest<HTMLButtonElement>("[data-action]"); if(!action)return;
    if(action.dataset.action==="back") location.assign(location.pathname);
    if(action.dataset.action==="font") exportFont();
    if(action.dataset.action==="source") exportSource();
    if(action.dataset.action==="finish") finishContour();
    if(action.dataset.action==="undo") undo();
    if(action.dataset.action==="redo") redo();
    if(action.dataset.action==="delete-node"&&selectedNode){
      const pts=glyph().contours[selectedNode.contour]?.points;
      if(pts&&pts.length>3){snapshot();pts.splice(selectedNode.point,1);selectedNode=null;scheduleSave();render();}
    }
  });
  root!.addEventListener("change",(e)=>{
    const t=e.target as HTMLInputElement;
    if(t.matches("[data-import]")){const f=t.files?.[0];if(f)importSource(f);t.value="";return;}
    if(t.matches("[data-family]")){doc.familyName=t.value.trim()||"InnerAnimal";scheduleSave();return;}
    if(t.matches("[data-field]")){
      const key=t.dataset.field as "advanceWidth"|"leftSideBearing",v=Number(t.value);if(!Number.isFinite(v))return;
      snapshot();
      if(key==="advanceWidth") glyph().advanceWidth=Math.max(80,Math.min(1600,v));
      else {const d=v-glyph().leftSideBearing;glyph().contours.forEach(c=>c.points.forEach(p=>p[0]+=d));glyph().leftSideBearing=v;}
      scheduleSave();render();return;
    }
    if(t.matches("[data-metric]")){
      const key=t.dataset.metric as keyof TypefaceDocument["metrics"]|"tracking",v=Number(t.value);if(!Number.isFinite(v))return;
      snapshot();if(key==="tracking")doc.tracking=v;else doc.metrics[key]=v;scheduleSave();renderCanvas();renderPreview();return;
    }
    if(t.matches("[data-node-field]")&&selectedNode){
      const v=Number(t.value);if(!Number.isFinite(v))return;snapshot();
      const p=glyph().contours[selectedNode.contour]?.points[selectedNode.point];
      if(p)p[t.dataset.nodeField==="x"?0:1]=v;scheduleSave();render();
    }
  });
  root!.addEventListener("input",(e)=>{
    const t=e.target as HTMLInputElement;
    if(t.matches("[data-preview-input]")){previewText=t.value;renderPreview();}
    if(t.matches("[data-family]")){doc.familyName=t.value.trim()||"InnerAnimal";scheduleSave();}
  });
  const svg=root!.querySelector<SVGSVGElement>("[data-canvas]")!;
  svg.addEventListener("pointerdown",(e)=>{
    const target=e.target as Element,node=target.closest<SVGCircleElement>("[data-node]");
    if(tool==="draw"&&!node){
      const p=coords(svg,e.clientX,e.clientY);
      draft.push([Math.max(-120,Math.min(1100,p[0])),Math.max(-250,Math.min(850,p[1]))]);
      renderCanvas();root!.querySelector<HTMLButtonElement>('[data-action="finish"]')!.hidden=false;return;
    }
    if(node){
      const [ci,pi]=(node.dataset.node||"0:0").split(":").map(Number);
      selectedNode={contour:ci,point:pi};snapshot();drag={contour:ci,point:pi,pointerId:e.pointerId};
      svg.setPointerCapture(e.pointerId);renderCanvas();renderInspector();return;
    }
    selectedNode=null;renderCanvas();renderInspector();
  });
  svg.addEventListener("pointermove",(e)=>{
    if(!drag||drag.pointerId!==e.pointerId)return;
    const p=coords(svg,e.clientX,e.clientY),n=glyph().contours[drag.contour]?.points[drag.point];
    if(!n)return;n[0]=p[0];n[1]=p[1];renderCanvas();
  });
  const up=(e:PointerEvent)=>{if(!drag||drag.pointerId!==e.pointerId)return;drag=null;scheduleSave();renderInspector();};
  svg.addEventListener("pointerup",up);svg.addEventListener("pointercancel",up);
  const stopAppearance=observeShellAppearance(({theme,accent})=>{
    document.documentElement.dataset.samsketchTheme=theme;
    document.documentElement.style.setProperty("--nav-accent",accent);
    root!.style.setProperty("--tf-accent",accent);
  });
  window.addEventListener("beforeunload",()=>{stopAppearance();window.clearTimeout(saveTimer);},{once:true});
  render();save();
}
mount();
