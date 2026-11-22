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


export function resizePanelPercent(current:number,deltaPx:number,containerWidth:number,otherPanelPercent=0){
  if(!Number.isFinite(containerWidth)||containerWidth<=0||!Number.isFinite(deltaPx))return current;
  const minPanelPercent=180/containerWidth*100;
  const minViewportPercent=320/containerWidth*100;
  const reservedHandlesPercent=16/containerWidth*100;
  const maxPanelPercent=Math.max(minPanelPercent,Math.min(42,100-otherPanelPercent-minViewportPercent-reservedHandlesPercent));
  const next=current+deltaPx/containerWidth*100;
  return Math.round(Math.max(minPanelPercent,Math.min(maxPanelPercent,next))*100)/100;
}
