export function savedDimension(key:string,fallback:number,min:number,max:number) {
  try {
    const raw=localStorage.getItem('cad.workbench.'+key);
    const value=raw===null?NaN:Number(raw);
    return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
  } catch { return fallback }
}
export function rememberDimension(key:string,value:number) {
  try { localStorage.setItem('cad.workbench.'+key,String(value)) } catch { /* Private browsing. */ }
}
