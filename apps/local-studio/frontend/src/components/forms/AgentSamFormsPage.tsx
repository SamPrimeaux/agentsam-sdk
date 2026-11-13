import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, ClipboardCopy, Code2, Eye, FileText, Loader2, Mail, Plus, RotateCcw, Save, Send, ShieldCheck, Trash2, X } from "lucide-react";
import "./AgentSamFormsPage.css";

type FormField = { key:string; label:string; type:"text"|"email"|"tel"|"textarea"|"select"|"checkbox"; required:boolean; placeholder:string; options:string[] };
type FormDocument = {
  version:number; title:string; description:string; mode:"inline"|"popup"; fields:FormField[];
  appearance:{ background:string; text:string; accent:string; button:string; radius:number; font:string };
  behavior:{ trigger:string; device:string; pages:string };
  success:{ title:string; message:string };
};
type FormSummary = { id:string;key:string;title:string;description:string;status:"draft"|"published";version:number;updated_at:number;submission_count:number };
type FormDetail = FormSummary & { document:FormDocument };
type Submission = { id:string;values:Record<string,string|boolean>;is_test:boolean;created_at:number };
type ApiResult = {ok:boolean;error?:string;installed?:boolean;enabled?:boolean;forms?:FormSummary[];form?:FormDetail;submissions?:Submission[]};

const API = "/api/forms";
const INSTALL_KEY = "agentsam-app-forms";
const inputs:Record<FormField["type"],string> = {
  text:"Short text",email:"Email",tel:"Phone",textarea:"Long answer",select:"Dropdown",checkbox:"Consent checkbox",
};
const colors = ["#238552","#3f6fd1","#7144ce","#e05b83","#262626"];
const formatTime = (value:number) => new Date(value * 1000).toLocaleString();
async function request(path:string,method="GET",body?:unknown):Promise<ApiResult> {
  const response = await fetch(path,{method,credentials:"same-origin",headers:body!==undefined?{"content-type":"application/json"}:{},
    body:body!==undefined?JSON.stringify(body):undefined,cache:"no-store"});
  const data:ApiResult = await response.json().catch(() => ({ok:false,error:"Invalid server response"}));
  if (!response.ok || !data.ok) throw Error(data.error || "Request failed");
  return data;
}
function FieldPreview({field,value,setValue}:{field:FormField;value:string|boolean|undefined;setValue:(value:string|boolean)=>void}) {
  const common = {id:"preview-"+field.key,required:field.required,name:field.key};
  if(field.type==="checkbox") return <label className="as-forms-check"><input type="checkbox" {...common} checked={value===true} onChange={e=>setValue(e.target.checked)}/><span>{field.label}</span></label>;
  return <label className="as-forms-field"><span>{field.label}{field.required&&" *"}</span>
    {field.type==="textarea" ? <textarea {...common} value={String(value||"")} placeholder={field.placeholder} onChange={e=>setValue(e.target.value)}/> :
     field.type==="select" ? <select {...common} value={String(value||"")} onChange={e=>setValue(e.target.value)}>
      <option value="">Choose an option</option>{field.options.map(o=><option key={o} value={o}>{o}</option>)}</select> :
     <input {...common} type={field.type} placeholder={field.placeholder} value={String(value||"")} onChange={e=>setValue(e.target.value)}/>}
  </label>;
}
function PanelHeader({title,sub}:{title:string;sub:string}){return <div className="as-forms-panel-header"><strong>{title}</strong><span>{sub}</span></div>;}
function EmptyState({title,detail}:{title:string;detail:string}){return <div className="as-forms-empty"><FileText size={30}/><strong>{title}</strong><span>{detail}</span></div>;}

export function AgentSamFormsPage(){
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [installed,setInstalled]=useState(false);
  const [forms,setForms]=useState<FormSummary[]>([]);
  const [active,setActive]=useState<FormDetail|null>(null);
  const [doc,setDoc]=useState<FormDocument|null>(null);
  const [selected,setSelected]=useState(0);
  const [answers,setAnswers]=useState<Record<string,string|boolean>>({});
  const [submissions,setSubmissions]=useState<Submission[]|null>(null);
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load = useCallback(async()=>{
    const r=await request(API);
    setInstalled(Boolean(r.installed));setForms(r.forms||[]);
  },[]);
  useEffect(()=>{let active=true;request(API).then(r=>{if(active){setInstalled(Boolean(r.installed));setForms(r.forms||[]);}})
    .catch(e=>{if(active)setError(String(e.message));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false};},[]);
  const run=async(operation:()=>Promise<void>)=>{
    setBusy(true);setError("");setNotice("");
    try{await operation();}catch(e){setError(e instanceof Error?e.message:"Operation failed");}
    finally{setBusy(false);}
  };
  const selectForm=async(id:string)=>{
    await run(async()=>{
      const r=await request(API+"/"+encodeURIComponent(id));
      setActive(r.form!);setDoc(structuredClone(r.form!.document));setDirty(false);setAnswers({});setSubmissions(null);setSelected(0);
    });
  };
  const install=()=>run(async()=>{
    const response=await request("/api/apps/install","POST",{key:INSTALL_KEY});
    if(response.enabled===false) throw Error("This app is disabled. Re-enable AgentSamForms in Apps first.");
    const seeded=await request(API+"/bootstrap","POST");
    setInstalled(true);setForms(seeded.forms||[]);setNotice("Five starter forms are now saved to this account.");
  });
  const changeDoc=(update:(current:FormDocument)=>FormDocument)=>{
    setDoc(current=>current?update(current):null);setDirty(true);
  };
  const changeField=(index:number,patch:Partial<FormField>)=>changeDoc(current=>({
    ...current,fields:current.fields.map((field,i)=>i===index?{...field,...patch}:field),
  }));
  const addField=(type:FormField["type"])=>{
    if(!doc || doc.fields.length>=20)return;
    const ids=new Set(doc.fields.map(f=>f.key));let key="field_"+(doc.fields.length+1);
    while(ids.has(key))key+="_new";
    const next:FormField={key,label:inputs[type],type,required:false,placeholder:"",options:type==="select"?["Option 1","Option 2"]:[]};
    changeDoc(current=>({...current,fields:[...current.fields,next]}));
    setSelected(doc.fields.length);
  };
  const save=()=>run(async()=>{
    if(!active||!doc)return;
    const r=await request(API+"/"+active.id,"PUT",{version:active.version,document:doc});
    setActive(r.form!);setDoc(structuredClone(r.form!.document));setDirty(false);await load();setNotice("Draft saved.");
  });
  const togglePublish=()=>run(async()=>{
    if(!active||!doc)return;
    if(dirty)throw Error("Save your changes before changing publication status.");
    const operation=active.status==="published"?"unpublish":"publish";
    const r=await request(API+"/"+active.id+"/"+operation,"POST");
    setActive(r.form!);await load();
    setNotice(operation==="publish"?"Form published. Public embed is ready.":"Form returned to draft.");
  });
  const testSubmission=()=>run(async()=>{
    if(!active || dirty)throw Error("Save the draft before testing.");
    await request(API+"/"+active.id+"/test","POST",answers);
    setNotice("Test submission saved to this account.");setAnswers({});await load();
    if(submissions){const r=await request(API+"/"+active.id+"/submissions");setSubmissions(r.submissions||[]);}
  });
  const openSubmissions=()=>run(async()=>{
    if(!active)return;
    if(submissions){setSubmissions(null);return;}
    const r=await request(API+"/"+active.id+"/submissions");setSubmissions(r.submissions||[]);
  });
  const copyEmbed=async()=>{
    if(!active || active.status!=="published")return;
    const url=new URL("/forms/embed/"+active.id,window.location.origin).toString();
    const code='<iframe src="'+url+'" title="'+active.title.replace(/"/g,"&quot;")+'" style="width:100%;min-height:650px;border:0" loading="lazy"></iframe>';
    try { await navigator.clipboard.writeText(code);setNotice("Embed code copied."); }
    catch {setError("Clipboard access unavailable. Open the public form to copy its URL.");}
  };
  const view=useMemo(()=>doc&&active?{
    ...doc,
    style:{"--form-bg":doc.appearance.background,"--form-fg":doc.appearance.text,
      "--form-accent":doc.appearance.accent,"--form-button":doc.appearance.button,
      "--form-radius":doc.appearance.radius+"px"} as CSSProperties,
  }:null,[doc,active]);
  return <main className="as-forms-root">
    <header className="as-forms-header">
      <div className="as-forms-heading"><div className="as-forms-icon"><FileText size={19}/></div><div>
        <h1>AgentSamForms</h1><p>Forms, inquiries and signups owned by your account</p>
      </div></div>
      {active&&<div className="as-forms-toolbar">
        <button onClick={()=>{setActive(null);setDoc(null);setSubmissions(null);}}><ArrowLeft size={15}/> All forms</button>
        <span className={"as-forms-status "+active.status}>{active.status==="published"?"Published":"Draft"}</span>
        {active.status==="published"&&<>
          <a href={"/forms/embed/"+active.id} target="_blank" rel="noopener noreferrer"><Eye size={15}/> Open</a>
          <button onClick={copyEmbed}><Code2 size={15}/> Copy embed</button>
        </>}
        <button disabled={busy||dirty} onClick={togglePublish}>{active.status==="published"?"Unpublish":"Publish"}</button>
        {active.status==="draft"&&<button className="as-forms-primary" disabled={!dirty||busy} onClick={save}><Save size={15}/> Save</button>}
      </div>}
    </header>
    {error&&<div className="as-forms-alert error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError("")}><X size={16}/></button></div>}
    {notice&&<div className="as-forms-alert success" role="status"><Check size={15}/><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice("")}><X size={16}/></button></div>}
    {loading ? <div className="as-forms-loading"><Loader2 className="animate-spin"/> Loading forms…</div> :
    !installed ? <section className="as-forms-install">
      <div className="as-forms-icon"><ShieldCheck size={28}/></div><h2>Install AgentSamForms</h2>
      <p>Add one account-owned application and five complete, editable starter forms. Form definitions and submissions stay separate from every other customer's account.</p>
      <button className="as-forms-primary" disabled={busy} onClick={install}>{busy?<Loader2 className="animate-spin" size={16}/>:<Plus size={16}/>} Install and create five forms</button>
      <span>No storefront forms publish automatically.</span>
    </section> :
    !active ? <section className="as-forms-library">
      <div className="as-forms-library-header"><div><h2>Your forms</h2><p>Five ready-to-edit starters, stored as drafts until you publish.</p></div>
        <button disabled={busy} onClick={()=>run(async()=>{const r=await request(API+"/bootstrap","POST");setForms(r.forms||[]);setNotice("Starter forms verified.");})}><RotateCcw size={15}/> Restore missing starters</button></div>
      <div className="as-forms-grid">
        {forms.map((f,i)=><button key={f.id} className="as-forms-card" onClick={()=>selectForm(f.id)} disabled={busy}>
          <div className="as-forms-card-top"><span className="as-forms-card-number">{String(i+1).padStart(2,"0")}</span><span className={"as-forms-status "+f.status}>{f.status}</span></div>
          <div className="as-forms-card-symbol">{i===2?<Mail size={24}/>:<FileText size={24}/>}</div>
          <h3>{f.title}</h3><p>{f.description}</p>
          <div className="as-forms-card-foot"><span>{f.submission_count} submissions</span><span>Edit form →</span></div>
        </button>)}
      </div>
      {forms.length===0&&<EmptyState title="No forms yet" detail="Use Restore missing starters to create your five forms."/>}
    </section> :
    doc&&view&&<div className="as-forms-workspace">
      <aside className="as-forms-sidebar">
        <PanelHeader title="Form fields" sub={String(doc.fields.length)+" fields · click to edit"}/>
        <div className="as-forms-fieldlist">{doc.fields.map((field,i)=><button key={field.key} onClick={()=>setSelected(i)} className={selected===i?"selected":""}>
          <span className="as-forms-fieldindex">{i+1}</span><span>{field.label}</span>{field.required&&<span className="as-forms-req">Required</span>}
        </button>)}</div>
        <div className="as-forms-addfield"><strong>Add field</strong><div>
          {(Object.keys(inputs) as FormField["type"][]).map(type=><button disabled={doc.fields.length>=20||active.status==="published"} key={type} onClick={()=>addField(type)}><Plus size={13}/>{inputs[type]}</button>)}
        </div></div>
      </aside>
      <section className="as-forms-preview-column">
        <div className="as-forms-previewbar"><div><strong>Live preview</strong><span>Test submissions are saved; visitors cannot see drafts.</span></div><span>{doc.mode==="popup"?"Popup-style":"Inline form"}</span></div>
        <form className="as-forms-preview" style={view.style} onSubmit={e=>{e.preventDefault();void testSubmission();}}>
          <div className="as-forms-preview-inner">
            <h2>{doc.title}</h2><p>{doc.description}</p>
            {doc.fields.map((field,i)=><div key={field.key} className={"as-forms-preview-selectable "+(i===selected?"is-selected":"")} onClick={()=>setSelected(i)}>
              <FieldPreview field={field} value={answers[field.key]} setValue={value=>setAnswers(a=>({...a,[field.key]:value}))}/>
            </div>)}
            <button type="submit" className="as-forms-preview-submit" disabled={busy||dirty}><Send size={15}/> Submit test response</button>
            {dirty&&<small>Save your draft before sending a test submission.</small>}
          </div>
        </form>
        <div className="as-forms-preview-footer">
          <button onClick={openSubmissions} disabled={busy}><Eye size={15}/>{submissions?"Hide submissions":"View submissions"}</button>
          <span>{active.status==="published"?"Public form enabled":"Draft — not publicly accessible"}</span>
        </div>
        {submissions&&<section className="as-forms-submissions">
          <PanelHeader title="Stored responses" sub={submissions.length+" most recent submissions"}/>
          {submissions.length===0&&<EmptyState title="No responses yet" detail="Complete the preview form to save a test submission."/>}
          {submissions.map(row=><details key={row.id}><summary>{row.is_test?"Test submission":"Visitor submission"} · {formatTime(row.created_at)}</summary>
            <dl>{Object.entries(row.values).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
          </details>)}
        </section>}
      </section>
      <aside className="as-forms-inspector">
        <PanelHeader title="Form settings" sub={active.status==="published"?"Unpublish to edit":"Changes are saved to your drafts"}/>
        <fieldset disabled={active.status==="published"||busy}>
          <label className="as-forms-setting">Form title<input value={doc.title} maxLength={120} onChange={e=>changeDoc(d=>({...d,title:e.target.value}))}/></label>
          <label className="as-forms-setting">Description<textarea value={doc.description} maxLength={500} onChange={e=>changeDoc(d=>({...d,description:e.target.value}))}/></label>
          <label className="as-forms-setting">Presentation<select value={doc.mode} onChange={e=>changeDoc(d=>({...d,mode:e.target.value as FormDocument["mode"]}))}>
            <option value="inline">Inline form</option><option value="popup">Popup-style embed</option>
          </select></label>
          <div className="as-forms-section-title">Selected field</div>
          {doc.fields[selected]&&<>
            <label className="as-forms-setting">Label<input value={doc.fields[selected].label} maxLength={100} onChange={e=>changeField(selected,{label:e.target.value})}/></label>
            {doc.fields[selected].type!=="checkbox"&&<label className="as-forms-setting">Placeholder<input value={doc.fields[selected].placeholder} maxLength={150} onChange={e=>changeField(selected,{placeholder:e.target.value})}/></label>}
            {doc.fields[selected].type==="select"&&<label className="as-forms-setting">Dropdown options (one per line)<textarea value={doc.fields[selected].options.join("\n")} onChange={e=>changeField(selected,{options:e.target.value.split("\n").filter(Boolean)})}/></label>}
            <label className="as-forms-toggle"><input type="checkbox" checked={doc.fields[selected].required} onChange={e=>changeField(selected,{required:e.target.checked})}/> Required</label>
            <button className="as-forms-danger" disabled={doc.fields.length===1} onClick={()=>{changeDoc(d=>({...d,fields:d.fields.filter((_,i)=>i!==selected)}));setSelected(0);}}><Trash2 size={14}/> Remove selected field</button>
          </>}
          <div className="as-forms-section-title">Appearance</div>
          <div className="as-forms-swatches">{colors.map(c=><button type="button" key={c} aria-label={"Set accent to "+c} style={{background:c}} onClick={()=>changeDoc(d=>({...d,appearance:{...d.appearance,accent:c,button:c}}))} />)}</div>
          <label className="as-forms-setting">Background<input type="color" value={doc.appearance.background} onChange={e=>changeDoc(d=>({...d,appearance:{...d.appearance,background:e.target.value}}))}/></label>
          <div className="as-forms-section-title">Success message</div>
          <label className="as-forms-setting">Title<input value={doc.success.title} onChange={e=>changeDoc(d=>({...d,success:{...d.success,title:e.target.value}}))}/></label>
          <label className="as-forms-setting">Message<textarea value={doc.success.message} onChange={e=>changeDoc(d=>({...d,success:{...d.success,message:e.target.value}}))}/></label>
        </fieldset>
        <div className="as-forms-inspector-note"><ShieldCheck size={15}/><span>Submissions are stored under this account. Publishing is explicit; no email or order is sent automatically.</span></div>
      </aside>
    </div>}
  </main>;
}
