import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {useEffect,useState} from 'react';
import {Box,FileCheck2,ShieldCheck} from 'lucide-react';
import {measuredTakeoff} from '../lib/cad/project-takeoff';

/** Manufacturing readiness belongs to the CAD document, not the Franka chess simulation. */
export function CadCamWorkspace({project,onCode,onExport}:{project:ProjectState;onCode:()=>void;onExport:()=>void}){
 const q=measuredTakeoff(project);
 const [native,setNative]=useState<'checking'|'ready'|'unavailable'>('checking');
 useEffect(()=>{let active=true;fetch('/api/cad/project/native/doctor').then(async r=>{
  if(!r.ok)throw new Error('Native kernel unavailable');
  const body=await r.json();
  if(active)setNative(body?.ready?'ready':'unavailable');
 }).catch(()=>{if(active)setNative('unavailable')});return()=>{active=false}},[]);
 return <section className="cad-cam-workspace" aria-label="CAM and manufacturing workspace">
   <header><strong>CAM / manufacturing preparation</strong><p>Source-linked manufacturing review. No machine operations are initiated from this workspace.</p></header>
   <div className="cad-cam-grid">
    <article><Box size={21}/><h3>CAD geometry source</h3><p>{project.name}</p>
     <div className="cad-property-summary"><span>Modeled walls</span><b>{q.walls}</b></div>
     <div className="cad-property-summary"><span>Hosted openings</span><b>{q.doors+q.windows}</b></div>
     <div className="cad-property-summary"><span>Parametric parts</span><b>{project.parametricObjects?.length||0}</b></div>
     <div className="cad-property-summary"><span>Native OCCT</span><b>{native}</b></div>
     <button type="button" onClick={onCode}>Edit parametric source</button>
    </article>
    <article><FileCheck2 size={21}/><h3>Design / output review</h3>
      <p>Verified dimensional design and approved geometry exports are prerequisites for downstream manufacturing preparation.</p>
      <div className="cad-property-summary"><span>Assembly layers</span><b>{project.walls.reduce((s,w)=>s+(w.assembly?.layers.length||0),0)}</b></div>
      <div className="cad-property-summary"><span>Pricing</span><b>Not configured</b></div>
      <div className="cad-property-summary"><span>Machine profile / post processor</span><b>Not selected</b></div>
      <button type="button" onClick={onExport}>Review available project exports</button>
    </article>
    <article><ShieldCheck size={21}/><h3>Separation of concerns</h3>
     <p>Franka chess remains an independent robotics simulation, not a CNC job. CAM operations will use revision-locked CAD solids and validated machine configurations, never a game-world mesh.</p>
     <p>No toolpath generation or physical machine commands are available in this initial preparation view.</p>
    </article>
   </div>
 </section>;
}
