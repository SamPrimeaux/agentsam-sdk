import {useEffect,useState} from "react";
import {adminFetch} from "../../lib/api";
import type {RangeKey} from "../../lib/types";

type Scan={id:string;repository:string;git_sha:string|null;status:string;source:string;checked_at:string;dimensions:Record<string,unknown>;metrics:Record<string,number>};
type Result={ok:boolean;scans:Scan[];limit:number;source:string};
type Report={scanner:string;schema_version:number;checked_at:string;status:string;dependency_count:number;checked_count:number;dependency_complete:boolean;findings:{kind:string;section:string}[];trust_boundary:{complete:boolean;ast_files:number;browser_reachable_files:number;browser_roots:number;merkle_root:string;metadata_root:string}};
const num=(n:number|undefined)=>typeof n==="number"?n.toLocaleString():"—";
const labels:Record<string,string>={"clean":"Clean","action-required":"Action required","incomplete":"Incomplete"};

export default function SecurityPage({range}:{range:RangeKey;tenant?:string}){
 const [data,setData]=useState<Result|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [refresh,setRefresh]=useState(0);
 const [file,setFile]=useState<File|null>(null);
 const [repository,setRepository]=useState("");
 const [importing,setImporting]=useState(false);
 const [notice,setNotice]=useState("");
 useEffect(()=>{
   const ctl=new AbortController();setLoading(true);setError("");setData(null);
   adminFetch<Result>("/api/analytics/security?range="+encodeURIComponent(range),{signal:ctl.signal})
    .then(v=>{if(!ctl.signal.aborted)setData(v)})
    .catch(e=>{if(!ctl.signal.aborted)setError(e.message||"Security data unavailable")})
    .finally(()=>{if(!ctl.signal.aborted)setLoading(false)});
   return ()=>ctl.abort();
 },[range,refresh]);
 async function importScan(){
  if(!file||!repository.trim())return;
  setImporting(true);setNotice("");
  try{
   if(file.size>20*1024*1024)throw new Error("Report exceeds 20 MB");
   const r=JSON.parse(await file.text()) as Report;
   if(r.scanner!=="agentsam-sca"||r.schema_version!==1||!Array.isArray(r.findings)||!r.trust_boundary)throw new Error("Select an AgentSam security scan JSON report.");
   const b=r.trust_boundary;
   const summary={scanner:r.scanner,schema_version:r.schema_version,checked_at:r.checked_at,status:r.status,repository:repository.trim(),dependency_count:r.dependency_count,checked_count:r.checked_count,dependency_complete:r.dependency_complete,boundary_complete:b.complete,ast_files:b.ast_files,browser_reachable_files:b.browser_reachable_files,browser_roots:b.browser_roots,finding_count:r.findings.length,vulnerability_count:r.findings.filter(x=>x.kind==="vulnerability").length,boundary_count:r.findings.filter(x=>x.section==="trust-boundary").length,merkle_root:b.merkle_root,metadata_root:b.metadata_root};
   const saved=await adminFetch<{ok:boolean;duplicate?:boolean;basin?:{ok:boolean}}>("/api/analytics/security",{method:"POST",body:JSON.stringify(summary)});
   setNotice(saved.duplicate?"Already recorded.":saved.basin?.ok?"Scan recorded in D1 and sent to Basin.":"Scan recorded in D1; Basin delivery not confirmed.");
   setFile(null);setRefresh(v=>v+1);
  }catch(e){setNotice(e instanceof Error?e.message:"Import failed");}finally{setImporting(false);}
 }
 const latest=data?.scans[0],m=latest?.metrics;
 const metric=(label:string,value:number|undefined)=><div className="card health-metric"><div className="muted text-xs">{label}</div><div className="mono fw-600 health-metric-value">{num(value)}</div></div>;
 return <section className="analytics-health">
  <div className="page-head"><div><h1 className="page-title">Security</h1><p className="page-sub">Recorded dependency and indexed JS/TS trust-boundary assessments · {range}</p></div><button className="btn" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>{loading?"Refreshing…":"Refresh"}</button></div>
  {error&&<div className="card health-error" role="alert">{error}</div>}
  {loading&&<p role="status">Loading assessments…</p>}
  {data&&!latest&&<div className="card card-body">No security scans recorded in this period. This does not mean the repository is secure.</div>}
  {latest&&<>
   <div className="card card-body"><strong>{labels[latest.status]||latest.status}</strong> · {latest.repository} · {new Date(latest.checked_at).toLocaleString()}<p className="muted text-xs">{latest.source==="user_imported"?"User-imported report; not independently attested.":latest.source} · Dependency coverage: {latest.dimensions.dependency_complete===true?"complete":"incomplete"} · Indexed trust-boundary coverage: {latest.dimensions.boundary_complete===true?"complete":"incomplete"}</p></div>
   <div className="grid cols-4 health-metrics health-section-space">{metric("Dependencies",m?.dependency_count)}{metric("Checked dependencies",m?.checked_count)}{metric("AST files",m?.ast_files)}{metric("Findings",m?.finding_count)}{metric("Vulnerabilities",m?.vulnerability_count)}{metric("Trust-boundary findings",m?.boundary_count)}{metric("Browser-reachable files",m?.browser_reachable_files)}{metric("Browser roots",m?.browser_roots)}</div>
   <details className="card card-body"><summary>Scan evidence</summary><p style={{overflowWrap:"anywhere"}}>Merkle: {String(latest.dimensions.merkle_root||"Unavailable")}</p><p style={{overflowWrap:"anywhere"}}>Metadata: {String(latest.dimensions.metadata_root||"Unavailable")}</p></details>
   <div className="card health-section-space"><div className="card-head"><div><div className="card-title">Assessment history</div><div className="card-sub">Most recent {data?.limit} recorded scans in this range</div></div></div><div className="health-table-scroll"><table className="tbl"><thead><tr><th>Repository</th><th>When</th><th>Result</th><th>Findings</th></tr></thead><tbody>{data?.scans.map(s=><tr key={s.id}><td>{s.repository}</td><td>{new Date(s.checked_at).toLocaleString()}</td><td>{labels[s.status]||s.status}</td><td>{num(s.metrics.finding_count)}</td></tr>)}</tbody></table></div></div>
  </>}
  <div className="card card-body health-section-space"><h2 className="card-title">Import an existing scan</h2><p>Export the existing scanner as JSON. Only summary metrics and evidence hashes are submitted; the complete report remains on your device.</p><code style={{overflowWrap:"anywhere"}}>npm run --silent security:check -- --path . --json &gt; security-report.json</code><label>Repository <input value={repository} onChange={e=>setRepository(e.target.value)} placeholder="owner/repository" maxLength={160}/></label><label>Scan report <input type="file" accept=".json,application/json" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="btn" disabled={!file||!repository.trim()||importing} onClick={importScan}>{importing?"Importing…":"Import scan"}</button>{notice&&<p role="status">{notice}</p>}</div>
  <div className="card card-body health-section-space"><h2 className="card-title">Not assessed by this scanner</h2><p>Cloud infrastructure, network security, live application security, identity authorization and agent permissions require separate assessments. A clean report is not an overall security certification.</p></div>
 </section>;
}
