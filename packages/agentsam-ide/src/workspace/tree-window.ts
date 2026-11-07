/** Viewport-only rendering for large workspace file trees. No source or filesystem I/O. */
export type TreeWindow = { start:number; end:number; top:number; bottom:number; total:number };
export function workspaceTreeWindow(count:number,scrollTop:number,viewportHeight:number,rowHeight=30,overscan=10):TreeWindow {
  const length=Math.max(0,Math.floor(Number.isFinite(count)?count:0));
  const height=Math.max(1,Number.isFinite(rowHeight)?rowHeight:30);
  const offset=Math.max(0,Number.isFinite(scrollTop)?scrollTop:0);
  const viewport=Math.max(1,Number.isFinite(viewportHeight)?viewportHeight:320);
  const padding=Math.max(0,Math.floor(Number.isFinite(overscan)?overscan:10));
  const total=length*height;
  const start=Math.min(length,Math.max(0,Math.floor(offset/height)-padding));
  const end=Math.max(start,Math.min(length,Math.ceil((offset+viewport)/height)+padding));
  return {start,end,top:start*height,bottom:Math.max(0,total-end*height),total};
}
