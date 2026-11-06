import { useEffect, useState } from "react";
import { ArrowUpRight, Check, X } from "lucide-react";
import { API, canvasRequest, type CanvasMeta } from "./model";

type Review = {compatible:boolean;issues:Array<{severity:string;code:string;node_id?:string;message:string}>;mapping:{page_count:number;section_count:number;block_count:number};source:{id:string;revision:string|number;content_hash:string}};
export function CanvasCmsHandoff({canvas,onClose}:{canvas:CanvasMeta;onClose:()=>void}) {
 const [sites,setSites]=useState<Array<{id:string;name:string}>>([]);
 const [site,setSite]=useState("");
 const [review,setReview]=useState<Review|null>(null);
 const [result,setResult]=useState<{editor_url:string;project_id:string}|null>(null);
 const [busy,setBusy]=useState("Loading websites");
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  canvasRequest<{available_sites:Array<{id:string;name:string}>}>("/api/admin/store/online")
   .then(data=>{if(active)setSites(data.available_sites||[]);})
   .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy("");});
  return()=>{active=false;};
 },[]);
 async function submit(convert=false) {
  setError("");setBusy(convert?"Creating private draft":"Validating compatibility");
  try {
   const data=await canvasRequest<Review&{editor_url:string;project_id:string}>(API+"/"+encodeURIComponent(canvas.id)+"/cms/"+(convert?"convert":"validate"),{
    method:"POST",body:JSON.stringify({site_id:site,expected_revision:canvas.revision}),
   });
   if(convert)setResult(data);else setReview(data);
  }catch(e){setError(e instanceof Error?e.message:"The handoff could not be completed.");}
  finally{setBusy("");}
 }
 return <div className="cv-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="canvas-cms-title" className="cv-modal">
  <header><div><span className="cv-eyebrow">Optional next step</span><h2 id="canvas-cms-title">Prepare for your website</h2></div><button aria-label="Close CMS handoff" onClick={onClose}><X size={18}/></button></header>
  <p>Your Canvas remains independent. This checks the selected website's capabilities and creates an editable private draft.</p>
  {!result?<><label className="cv-field"><span>Website</span><select disabled={Boolean(busy)} value={site} onChange={e=>{setSite(e.target.value);setReview(null);}}><option value="">Choose a website</option>{sites.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
   {!busy&&!sites.length&&<p>No authorized website is available. You can continue working on this Canvas.</p>}
   {review&&<div className="cv-conversion-review"><strong>{review.compatible?"Ready to create a draft":"Some elements need attention"}</strong><p>{review.mapping.page_count} pages · {review.mapping.section_count} sections · {review.mapping.block_count} blocks</p>
    {review.issues.map((issue,index)=><div key={index} className={"cv-issue "+issue.severity}><strong>{issue.node_id?issue.node_id+" · ":""}{issue.code.replaceAll("_"," ")}</strong><p>{issue.message}</p></div>)}
   </div>}
   <footer><button disabled={!site||Boolean(busy)} onClick={()=>void submit(false)}>{review?"Check again":"Check compatibility"}</button><button className="cv-primary" disabled={!review?.compatible||Boolean(busy)} onClick={()=>void submit(true)}>Create private draft</button></footer>
  </>:<div className="cv-conversion-success"><Check size={22}/><h3>Private draft created</h3><p>Open it in the Theme Editor to edit sections, blocks, and preview the saved result. Nothing has been published.</p><a className="cv-primary" href={result.editor_url} target="_blank" rel="noopener noreferrer">Open Theme Editor <ArrowUpRight size={14}/></a></div>}
  {busy&&<p role="status">{busy}…</p>}{error&&<p role="alert" className="cv-error-text">{error}</p>}
 </section></div>;
}
