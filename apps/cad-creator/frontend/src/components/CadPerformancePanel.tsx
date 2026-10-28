import {setSceneQuality,useScenePerformance,type RenderQuality} from '../lib/cad/scene-performance';

export function CadPerformancePanel(){
 const {metrics,quality}=useScenePerformance();
 const values=metrics?[
  ['FPS',String(metrics.fps)],
  ['Frame time',metrics.frameMs+' ms'],
  ['Draw calls',metrics.drawCalls.toLocaleString()],
  ['Triangles',metrics.triangles.toLocaleString()],
  ['WebGL geometries',String(metrics.geometries)],
  ['GPU textures',String(metrics.textures)],
  ['Viewport',metrics.width+' × '+metrics.height],
  ['Pixel ratio',metrics.pixelRatio.toFixed(2)+'×'],
 ]:[];
 return <section className="cad-performance-panel" aria-label="Live scene performance">
  <div className="cad-performance-title"><strong>Scene performance</strong><small>{metrics?metrics.source:'Awaiting renderer telemetry'}</small></div>
  {values.map(([name,value])=><div key={name} className="cad-property-summary"><span>{name}</span><b>{value}</b></div>)}
  {metrics&&<div className="cad-performance-advice" aria-label="Scene optimization guidance">
    <strong>Optimization opportunities</strong>
    <p>{metrics.drawCalls>1000?'High draw-call count: investigate instancing and mesh batching.':'Draw calls within the initial review threshold.'}</p>
    <p>{metrics.triangles>2000000?'High triangle count: consider level-of-detail and geometry simplification.':'Triangle count below the initial review threshold.'}</p>
    <p>{metrics.fps<30?'Low FPS: try Performance quality and inspect geometry / material complexity.':'Live frame rate: '+metrics.fps+' FPS.'}</p>
  </div>}
  <h4>Live viewport quality</h4>
  <div className="cad-performance-quality" role="group" aria-label="Scene quality preset">
   {(['performance','balanced','quality']as RenderQuality[]).map(option=>
    <button type="button" key={option} aria-pressed={quality===option} onClick={()=>setSceneQuality(option)}>{option[0].toUpperCase()+option.slice(1)}</button>)}
  </div>
  <p className="cad-property-help">Presets adjust live rendering resolution without altering BIM geometry, materials or the saved design. Counts are reported by the active WebGL renderer, not the native OCCT kernel.</p>
 </section>;
}
