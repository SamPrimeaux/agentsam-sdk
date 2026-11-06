import type { CSSProperties } from "react";

export type CanvasNode = {
  id: string; type: "frame" | "text" | "button" | "image" | "input" | "link";
  name: string; x: number; y: number; width: number; height: number;
  text?: string; src?: string; style?: Record<string, string | number>;
  children?: CanvasNode[]; componentId?: string;
  action?: { type: "navigate" | "toggle" | "submit"; target: string };
  binding?: Record<string, unknown>;
  responsive?: Record<string, Partial<Pick<CanvasNode, "x" | "y" | "width" | "height" | "style">>>;
};
export type Artboard = {
  id: string; name: string; width: number; height: number; x: number; y: number;
  background: string; nodes: CanvasNode[]; route?: string;
};
export type Direction = { id: string; title: string; description: string; creativeIntent?: string; [key: string]: unknown };
export type CanvasDocument = {
  version: 1; name: string; host: string; brief: string; artboards: Artboard[];
  tokens: Record<string, unknown>; components: Array<{id: string; name: string; node?: CanvasNode}>;
  assets: Array<Record<string, unknown>>; dataRequirements: Array<Record<string, unknown>>;
  provenance: Record<string, unknown>; directions?: Direction[];
  [key: string]: unknown;
};
export type CanvasMeta = {
  id: string; name: string; revision: string | number; contentHash: string; updatedAt?: string;
};
export type CanvasResponse = { ok: boolean; canvas: CanvasMeta; document: CanvasDocument };
export type CanvasRun = {
  id: string; status: string; instruction?: string; error?: string; [key: string]: unknown;
};
export type CanvasEvent = {
  id?: string | number; sequence: number; type: string;
  message?: string; run_id?: string; runId?: string; resource_id?: string;
  payload?: Record<string, unknown>; data?: Record<string, unknown>;
  [key: string]: unknown;
};
export const API = "/api/work/canvases";
export const blankDocument = (host = "design", brief = ""): CanvasDocument => ({
  version: 1, name: "Untitled Canvas", host, brief, artboards: [], tokens: {},
  components: [], assets: [], dataRequirements: [], provenance: {},
});
export const copy = <T,>(value: T): T => structuredClone(value);
export const makeId = (prefix: string) => prefix + "_" + crypto.randomUUID();
export const terminalRun = (status?: string) => !status || ["completed","done","failed","cancelled","canceled","conflict","interrupted"].includes(status);

export function locateNode(document: CanvasDocument, id: string) {
  let found: {node: CanvasNode; artboard: Artboard; parent?: CanvasNode} | undefined;
  const visit = (nodes: CanvasNode[], artboard: Artboard, parent?: CanvasNode) => {
    for (const node of nodes) {
      if (node.id === id) { found = {node, artboard, parent}; return; }
      if (node.children) visit(node.children, artboard, node);
      if (found) return;
    }
  };
  for (const artboard of document.artboards) { visit(artboard.nodes, artboard); if (found) break; }
  return found;
}
export function editNode(document: CanvasDocument, id: string, patch: Partial<CanvasNode>): CanvasDocument {
  const next = copy(document);
  const target = locateNode(next, id);
  if (target) Object.assign(target.node, patch);
  return next;
}
export function removeNode(document: CanvasDocument, id: string): CanvasDocument {
  const next = copy(document);
  const target = locateNode(next, id);
  if (target) {
    const nodes = target.parent?.children ?? target.artboard.nodes;
    nodes.splice(nodes.findIndex(n => n.id === id), 1);
  }
  return next;
}
export function cloneNode(node: CanvasNode): CanvasNode {
  return {...copy(node), id: makeId("node"), children: node.children?.map(cloneNode)};
}
export function insertNode(document: CanvasDocument, boardId: string, node: CanvasNode): CanvasDocument {
  const next = copy(document);
  next.artboards.find(b => b.id === boardId)?.nodes.push(node);
  return next;
}
export function nodeAtWidth(node: CanvasNode, width?: number): CanvasNode {
  if (!width || !node.responsive) return node;
  const entries = Object.entries(node.responsive).filter(([key]) => Number(key) >= width).sort((a,b) => Number(b[0]) - Number(a[0]));
  return entries.reduce((result, [, patch]) => ({...result, ...patch, style: {...result.style, ...patch.style}}), node);
}
export function canvasBounds(boards: Artboard[]) {
  if (!boards.length) return {x:0,y:0,width:1000,height:700};
  const x = Math.min(...boards.map(b=>b.x)), y = Math.min(...boards.map(b=>b.y));
  return {x,y,width:Math.max(...boards.map(b=>b.x+b.width))-x,height:Math.max(...boards.map(b=>b.y+b.height))-y};
}
export function safeUrl(value?: string, image = false): string | undefined {
  if (!value) return undefined;
  if (/^\/(?!\/)/.test(value) || /^#[A-Za-z0-9_-]+$/.test(value)) return value;
  try { const url = new URL(value); return ["http:","https:"].includes(url.protocol) ? value : undefined; }
  catch { return image && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : undefined; }
}
const styleKeys = new Set([
  "color","background","backgroundColor","borderColor","borderWidth","borderStyle","borderRadius",
  "fontFamily","fontSize","fontWeight","fontStyle","letterSpacing","lineHeight","textAlign","textTransform",
  "textDecoration","opacity","padding","paddingTop","paddingRight","paddingBottom","paddingLeft",
  "display","alignItems","justifyContent","gap","boxShadow","objectFit","overflow","whiteSpace",
]);
export function safeStyle(style?: CanvasNode["style"]): CSSProperties {
  return Object.fromEntries(Object.entries(style ?? {}).filter(([key,value]) =>
    styleKeys.has(key) && ["string","number"].includes(typeof value) && !/url\s*\(|expression\s*\(|javascript:/i.test(String(value))
  )) as CSSProperties;
}
export class CanvasApiError extends Error {
  constructor(message: string, public status: number, public details: Record<string, unknown> = {}) { super(message); }
}
export async function canvasRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {credentials:"same-origin", ...init, headers:{"Content-Type":"application/json",...init.headers}});
  const data = await response.json().catch(()=>({error:"The server returned an unreadable response."}));
  if (!response.ok || data.ok === false) throw new CanvasApiError(
    data.message || data.error?.message || (typeof data.error === "string" ? data.error : "Canvas request failed"),
    response.status, data,
  );
  return data as T;
}
