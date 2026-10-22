import { icon } from "./icons";

/* Reuse the studio's tiny SVG primitives: no ReactDOM server bundle in the browser. */
const iconAliases: Record<string,string> = {
 MousePointer2:"select",Hand:"orbit",Move3D:"move",Rotate3D:"rotate",Scaling:"scale",Orbit:"orbit",
 Focus:"frame",Grid2X2:"grid",Ruler:"ruler",Magnet:"snap",Box:"cube",Circle:"circle",Cylinder:"cylinder",
 Cone:"cone",Spline:"spline",PenTool:"pen",Layers:"layers",Blocks:"blocks",Shapes:"templates",BoxSelect:"frame",
 Combine:"combine",Split:"split",Scissors:"scissors",GitMerge:"branch",Repeat2:"repeat",
 AlignHorizontalJustifyCenter:"alignh",AlignVerticalJustifyCenter:"alignv",Copy:"copy",Trash2:"trash",
 Undo2:"undo",Redo2:"redo",Palette:"palette",Droplet:"droplet",Sun:"sun",Moon:"moon",CloudFog:"cloud-fog",
 CloudSun:"sun",Waves:"waves",Wind:"wind",Sparkles:"sparkles",Eye:"eye",EyeOff:"eyeoff",Camera:"camera",
 Aperture:"aperture",Scan:"scan",Frame:"frame",Monitor:"monitor",Smartphone:"phone",Play:"play",Pause:"pause",
 StepForward:"step",PanelLeft:"panel",PanelRight:"panel",PanelTop:"panel",PanelBottom:"panel",Activity:"activity",
 Zap:"zap",Gauge:"gauge",Timer:"timer",GitBranch:"branch",Workflow:"workflow",Package:"package",Terminal:"terminal",
 Code:"code",Wrench:"wrench",DraftingCompass:"compass",Waypoints:"waypoints",Lightbulb:"lightbulb",
 Snowflake:"snowflake",Glasses:"glasses",MoveHorizontal:"movehorizontal",MoveVertical:"movevertical",
 CircleDot:"circledot",CirclePlay:"circleplay",MonitorCheck:"monitorcheck",Save:"save",Download:"download",
 Upload:"upload",RefreshCcw:"refresh",RotateCcw:"rotateccw",History:"history",ListFilter:"list-filter",
 Settings2:"settings",Lock:"lock",Unlock:"unlock",ArrowUpRight:"arrowup",CircleHelp:"help",Plus:"plus",
 X:"close",Check:"check",ChevronDown:"down",ArrowUp:"arrowup",Share:"share",Layers2:"layers",
};
export function renderIcon(name: string, size = 18) {
 return icon(iconAliases[name] || "cube", size);
}
export type ToolIcon = { name: string; icon: string; note: string };
export type ToolFamily = { id: string; title: string; tools: ToolIcon[] };
const family = (id: string, title: string, entries: [string, string, string][]): ToolFamily => ({
  id, title, tools: entries.map(([name, icon, note]) => ({ name, icon, note })),
});
export const toolFamilies: ToolFamily[] = [
  family("navigation","Navigate & inspect",[
    ["Select","MousePointer2","Select scene objects"],["Pan","Hand","Pan the viewport"],["Move","Move3D","Translate geometry"],
    ["Rotate","Rotate3D","Rotate objects"],["Scale","Scaling","Scale proportionally"],["Orbit","Orbit","Orbit the camera"],
    ["Frame","Focus","Frame a selection"],["Grid","Grid2X2","Toggle construction grid"],["Measure","Ruler","Read dimensions"],
    ["Snap","Magnet","Snap to alignment"]
  ]),
  family("create","Create & sketch",[
    ["Box","Box","Box primitive"],["Circle","Circle","Circular profile"],["Cylinder","Cylinder","Cylinder primitive"],
    ["Cone","Cone","Cone primitive"],["Spline","Spline","Curve path"],["Pen","PenTool","Draw a profile"],
    ["Layers","Layers","Organize geometry"],["Components","Blocks","Compose components"],
    ["Shapes","Shapes","Primitive library"],["Box select","BoxSelect","Select by region"]
  ]),
  family("modify","Modify & combine",[
    ["Combine","Combine","Combine solids"],["Split","Split","Split a body"],["Cut","Scissors","Cut geometry"],
    ["Merge","GitMerge","Merge components"],["Array","Repeat2","Repeat a component"],
    ["Align horizontal","AlignHorizontalJustifyCenter","Align on X"],["Align vertical","AlignVerticalJustifyCenter","Align on Y"],
    ["Duplicate","Copy","Duplicate selection"],["Delete","Trash2","Remove selection"],
    ["Undo","Undo2","Undo last change"],["Redo","Redo2","Redo last change"]
  ]),
  family("materials","Materials & finish",[
    ["Palette","Palette","Material presets"],["Color","Droplet","Surface color"],["Key light","Sun","Key lighting"],
    ["Night","Moon","Night lighting"],["Fog","CloudFog","Atmospheric depth"],["Daylight","CloudSun","Environment light"],
    ["Waves","Waves","Surface effects"],["Wind","Wind","Motion effects"],["Polish","Sparkles","Finish treatment"],
    ["Show","Eye","Show object"],["Hide","EyeOff","Hide object"]
  ]),
  family("camera","Camera & output",[
    ["Camera","Camera","Camera controls"],["Aperture","Aperture","Camera aperture"],["Inspect","Scan","Inspect geometry"],
    ["Frame","Frame","Frame view"],["Desktop","Monitor","Desktop composition"],["Mobile","Smartphone","Mobile composition"],
    ["Play","Play","Play story"],["Pause","Pause","Pause story"],["Step","StepForward","Next frame"],
    ["Panels","PanelRight","Panel layout"]
  ]),
  family("scene","Scene & delivery",[
    ["Timeline","PanelBottom","Timeline panel"],["Activity","Activity","Scene activity"],["Dynamics","Zap","Dynamic controls"],
    ["Performance","Gauge","Performance settings"],["Timer","Timer","Timed playback"],["Relations","GitBranch","Scene relationships"],
    ["Workflow","Workflow","Workflow tools"],["Package","Package","Package scene"],["Terminal","Terminal","Command console"],
    ["Code","Code","Inspect generated code"],["Tools","Wrench","Tool settings"],["Drafting","DraftingCompass","Drafting aids"],
    ["Waypoints","Waypoints","Scene waypoints"],["Lighting","Lightbulb","Lighting settings"],["Environment","Snowflake","Environment presets"],
    ["Inspect style","Glasses","Display modes"],["Move horizontal","MoveHorizontal","Horizontal movement"],
    ["Move vertical","MoveVertical","Vertical movement"],["Center","CircleDot","Center target"],
    ["Render","CirclePlay","Render preview"],["Monitor check","MonitorCheck","Validate viewport"],
    ["Save","Save","Save scene"],["Download","Download","Export artifact"],["Upload","Upload","Import artifact"],
    ["Refresh","RefreshCcw","Refresh scene"],["Reset view","RotateCcw","Reset view"],["History","History","History"],
    ["Filter","ListFilter","Filter tools"],["Settings","Settings2","Workspace settings"],["Lock","Lock","Lock object"],
    ["Unlock","Unlock","Unlock object"],["Share","Share","Share scene"],["Help","CircleHelp","Help and shortcuts"],
  ]),
];
