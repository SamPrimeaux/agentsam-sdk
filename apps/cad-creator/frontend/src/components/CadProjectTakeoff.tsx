import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {measuredTakeoff} from '../lib/cad/project-takeoff';
export function CadProjectTakeoff({project}:{project:ProjectState}){
 const q=measuredTakeoff(project),fmt=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:1});
 return <section className="cad-takeoff" aria-label="Measured project takeoff">
  <h4>Bill of quantities · measured</h4>
  <div className="cad-property-summary"><span>Modeled floor area (spaces)</span><b>{fmt(q.floorFt2)} ft²</b></div>
  <div className="cad-property-summary"><span>Wall centerline length</span><b>{fmt(q.lengthFt)} ft</b></div>
  <div className="cad-property-summary"><span>Gross wall face area (one side)</span><b>{fmt(q.wallGrossFt2)} ft²</b></div>
  <div className="cad-property-summary"><span>Scheduled opening area</span><b>{fmt(q.openingFt2)} ft²</b></div>
  <div className="cad-property-summary"><span>Net wall face area (one side)</span><b>{fmt(q.wallNetFt2)} ft²</b></div>
  {q.assemblies.length>0&&<><h4>Construction assemblies</h4>{q.assemblies.map(a=><div className="cad-property-summary" key={a.name}><span>{a.name} · {a.count} wall(s)</span><b>{fmt(a.lengthFt)} ft</b></div>)}</>}
  <h4>Budget / BOM status</h4>
  <p className="cad-property-help">Cost estimate unavailable until priced materials, labor rates, waste allowances and construction scope are supplied. No invented $/ft² estimate. Quantities derive from this document, not the visual scene.</p>
 </section>;
}
