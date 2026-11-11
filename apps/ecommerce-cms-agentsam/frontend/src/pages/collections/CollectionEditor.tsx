import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StudioIcon from "../products/StudioIcon";
import { collectionsApi } from "./api";
import CollectionMediaPicker from "./CollectionMediaPicker";
import CollectionProducts from "./CollectionProducts";
import CollectionPresentation from "./CollectionPresentation";
import type { Collection, CollectionForm, CollectionStatus, CollectionTab, MediaAsset, Product } from "./model";
import { collectionHref, initialCollection, parseCollection, safeMediaUrl, slugify } from "./model";
import { normalizeCollectionRules, resolveCollectionMembers } from "../../../../../../packages/agentsam-merch/src/collection-planning.js";
import CollectionRules from "./CollectionRules";

const TABS: {id:CollectionTab;label:string;hint:string}[] = [
  {id:"overview",label:"Overview",hint:"Identity & imagery"},
  {id:"products",label:"Products",hint:"Lineup & curation"},
  {id:"presentation",label:"Presentation",hint:"Campaign design"},
  {id:"rules",label:"Rules",hint:"Selection tools"},
  {id:"seo",label:"SEO",hint:"Discovery"},
];
type MediaRole = "cover"|"artwork"|"background";
declare global {
  interface Window {
    publishDockEdit?: (detail: {active:boolean;dirty?:boolean;canSave?:boolean;hint?:string;saveLabel?:string;onSave?:()=>void;onDiscard?:()=>void})=>void;
  }
}
export default function CollectionEditor() {
  const params=useParams();
  const editId=params.id && /^[A-Za-z0-9_-]+$/.test(params.id) ? params.id : null;
  const navigate=useNavigate();
  const [form,setForm]=useState<CollectionForm>(initialCollection);
  const [collection,setCollection]=useState<Collection|null>(null);
  const [selected,setSelected]=useState<number[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [tab,setTab]=useState<CollectionTab>("overview");
  const [loading,setLoading]=useState(Boolean(editId));
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [mediaRole,setMediaRole]=useState<MediaRole|null>(null);
  const [advanced,setAdvanced]=useState(false);
  const [savedSnapshot,setSavedSnapshot]=useState(()=>JSON.stringify({form:initialCollection(),selected:[]}));
  const runningRef=useRef(false);
  const currentId=useRef<string|null>(editId);
  const collectionRuleMode=useRef<string>("manual");
  const collectionRuleExcluded=useRef<number[]>([]);

  useEffect(()=>{
    document.title = editId ? "Edit collection — Store Admin" : "Create collection — Store Admin";
    let live=true;
    queueMicrotask(()=>{if(live){setLoading(true);setError("");setNotice("");}});
    Promise.all([collectionsApi.products(),editId?collectionsApi.get(editId):Promise.resolve(null)])
      .then(([all,detail])=>{
        if(!live)return;
        setProducts(all);
        const next=detail?parseCollection(detail.collection,detail.rules):initialCollection();
        const members=detail?.product_ids||[];
        setForm(next);setCollection(detail?.collection||null);setSelected(members);
        if (detail?.collection.title) document.title = `${detail.collection.title} — Collections Studio`;
        setSavedSnapshot(JSON.stringify({form:next,selected:members}));
        currentId.current=editId;
        collectionRuleMode.current=next.rules.mode;
        collectionRuleExcluded.current=[...next.rules.excludedIds];
      }).catch(e=>{if(live)setError(e instanceof Error?e.message:"Unable to load collection");})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[editId]);
  const dirty=!loading && savedSnapshot!==JSON.stringify({form,selected});
  const effectiveIds=useMemo(()=>{
    try{return resolveCollectionMembers(products,selected,form.rules);}catch{return [];}
  },[products,selected,form.rules]);
  const activeCount=useMemo(()=>effectiveIds.filter(id=>products.some(p=>p.id===id&&p.status==="active")).length,[effectiveIds,products]);
  const totalMissing=useMemo(()=>selected.filter(id=>!products.some(p=>p.id===id)).length,[selected,products]);
  const progress=[Boolean(form.title.trim()),selected.length>0,activeCount>0,Boolean(form.image_url),Boolean(form.hero.headline||form.title)].filter(Boolean).length;
  const previewUrl=collection?.status==="active"?`/shop/collections/${encodeURIComponent(collection.slug)}`:null;
  const setField=<K extends keyof CollectionForm>(name:K,value:CollectionForm[K])=>setForm(f=>({...f,[name]:value}));
  const confirmLeave=useCallback(()=>!dirty||window.confirm("You have unsaved collection changes. Leave without saving?"),[dirty]);
  useEffect(()=>{
    function prevent(e:BeforeUnloadEvent){if(dirty){e.preventDefault();e.returnValue="";}}
    window.addEventListener("beforeunload",prevent);
    return()=>window.removeEventListener("beforeunload",prevent);
  },[dirty]);

  const save=useCallback(async (target?:CollectionStatus):Promise<string|null>=>{
    if(runningRef.current)return null;
    const targetStatus=target||form.status;
    try { normalizeCollectionRules(form.rules); }
    catch (error) {
      setTab("rules");
      setError(error instanceof Error ? error.message : "Invalid collection membership rules.");
      return null;
    }
    if(!form.title.trim()){setTab("overview");setError("Enter a collection title before saving.");return null;}
    if(form.title.trim().length>120){setError("Collection title cannot exceed 120 characters.");return null;}
    if(targetStatus==="active"&&activeCount===0){setTab("products");setError("Add at least one published product before publishing this collection.");return null;}
    if(targetStatus==="active"&&form.rules.mode!=="automatic"&&totalMissing>0){setTab("products");setError("Remove missing catalog products before publishing.");return null;}
    const resolvedSlug=slugify(form.slug||form.title);
    if(!resolvedSlug){setError("The collection title needs letters or numbers.");return null;}
    const pending={...form,slug:resolvedSlug,status:targetStatus};
    runningRef.current=true;setBusy(true);setError("");setNotice("");
    try{
      // New records remain drafts until their product memberships have been saved.
      const id=currentId.current;
      const isNew=!id;
      const initialStatus:CollectionStatus=isNew?"draft":targetStatus;
      const saved=await collectionsApi.save(pending,id||undefined,initialStatus);
      currentId.current=saved.id;
      // This PUT is the existing ordered membership authority, including for empty lineups.
      try{
        await collectionsApi.assign(saved.id,selected);
        // Rule settings have a separate normalized store; legacy/manual collections
        // do not require the new table to be present before migration.
        if(pending.rules.mode!=="manual" || collectionRuleMode.current!=="manual" || pending.rules.excludedIds.length>0 || collectionRuleExcluded.current.length>0) {
          await collectionsApi.saveRules(saved.id,pending.rules);
        }
      }catch(e){
        throw new Error(`Collection metadata saved, but merchandising assignments failed. ${e instanceof Error?e.message:"Retry Save."}`,{cause:e});
      }
      collectionRuleMode.current=pending.rules.mode;
      collectionRuleExcluded.current=[...pending.rules.excludedIds];
      let final=saved;
      if(initialStatus!==targetStatus){
        final=await collectionsApi.save(pending,saved.id,targetStatus);
      }
      const reconciled={...pending,status:targetStatus};
      setForm(reconciled);setCollection(final);
      setSavedSnapshot(JSON.stringify({form:reconciled,selected}));
      setNotice(isNew?"Collection created. Continue styling or publishing it.":targetStatus==="active"?"Collection published and product assignments saved.":"Collection changes saved.");
      if(isNew)navigate(collectionHref(`/collections/${saved.id}`),{replace:true});
      return saved.id;
    }catch(e){setError(e instanceof Error?e.message:"Couldn't save collection");return null;}
    finally{runningRef.current=false;setBusy(false);}
  },[form,selected,activeCount,totalMissing,navigate]);

  const scaffoldDrafts=useCallback(async ()=>{
    if (collection?.status==="active") {
      setError("This collection is published. Create a separate draft collection before scaffolding new designs.");
      return;
    }
    const id=await save("draft");
    if(!id)return;
    setError("");
    try {
      const result=await collectionsApi.scaffold(id);
      const [updatedProducts,detail]=await Promise.all([collectionsApi.products(),collectionsApi.get(id)]);
      const members=detail.product_ids||[];
      setProducts(updatedProducts);
      setSelected(members);
      setSavedSnapshot(JSON.stringify({form:{...form,status:"draft"},selected:members}));
      setNotice(`${result.created.length} new draft products prepared · ${result.reused.length} already linked`+
        (result.unavailable.length?` · ${result.unavailable.length} unavailable: ${result.unavailable.map(x=>x.reason).join("; ")}`:"")+
        ". Choose a draft to design. No product was published.");
    }catch(e){setError(e instanceof Error?e.message:"Product scaffolding failed");}
  },[save,form,collection?.status]);
  const goToStudio=useCallback(async (supplierId?:string)=>{
    // A blank new collection must not block creating its first store product.
    // Preserve any existing collection edits before leaving this editor.
    let savedId=currentId.current;
    if (dirty && !form.title.trim()) {
      setTab("overview");
      setError("Give this collection a title and save it before opening Product Studio, so your changes are not lost.");
      return;
    }
    if (dirty || (!savedId && form.title.trim())) {
      const persisted=await save();
      if (!persisted) return;
      savedId=persisted;
    }
    const target=supplierId?`/admin/products/create/${encodeURIComponent(supplierId)}`:"/admin/products/create";
    const returnId=savedId?`?collection_id=${encodeURIComponent(savedId)}`:"";
    window.location.assign(collectionHref(target+returnId));
  },[save,dirty,form.title]);
  useEffect(()=>{
    window.publishDockEdit?.({
      active:true,dirty,canSave:!busy&&!!form.title.trim(),hint:dirty?"Unsaved collection changes":"Collection up to date",
      saveLabel:busy?"Saving…":"Save collection",onSave:()=>{void save();},
      onDiscard:()=>{if(!confirmLeave())return;window.location.reload();}
    });
    return()=>window.publishDockEdit?.({active:false});
  },[dirty,busy,form.title,save,confirmLeave]);
  function pickMedia(role:MediaRole,asset:MediaAsset){
    if(role==="cover")setForm(f=>({...f,image_url:asset.url,hero:{...f.hero,backgroundImageUrl:f.hero.backgroundImageUrl||asset.url}}));
    if(role==="artwork")setForm(f=>({...f,hero:{...f.hero,artworkUrl:asset.url}}));
    if(role==="background")setForm(f=>({...f,hero:{...f.hero,backgroundImageUrl:asset.url,backgroundMode:"image"}}));
  }
  function chooseTitle(value:string){
    setForm(f=>({...f,title:value,slug:!collection||!f.slug||f.slug===slugify(f.title)?slugify(value):f.slug,
      hero:{...f.hero,headline:!f.hero.headline||f.hero.headline===f.title?value:f.hero.headline}}));
  }
  if(loading)return <main className="cs-workspace"><div className="cs-container"><div className="cs-loading">Loading Collections Studio…</div></div></main>;
  return <main className="cs-workspace">
    <div className="cs-container cs-editor-container">
      <div className="cs-breadcrumb"><Link to={collectionHref("/products")}>Products</Link><span>/</span><Link to={collectionHref("/collections")} onClick={e=>{if(!confirmLeave())e.preventDefault();}}>Collections</Link><span>/</span><strong>{collection?.title||"Create collection"}</strong></div>
      <header className="cs-editor-header">
        <div><span className="cs-overline">COLLECTION STUDIO · MERCHANDISING</span><h1>{collection?.title||"Create a collection"}</h1><div className="cs-header-sub"><span className={`cs-status-chip ${form.status==="active"?"active":""}`}>{form.status==="active"?"Published":form.status}</span><span>{selected.length} products</span><span>{dirty?"Unsaved changes":"All changes saved"}</span></div></div>
        <div className="cs-header-actions">
          {previewUrl&&<a className="cs-button" href={previewUrl} target="_blank" rel="noreferrer">View storefront</a>}
          <button className="cs-button" type="button" disabled={busy||!dirty} onClick={()=>{if(confirmLeave())window.location.reload();}}>Discard</button>
          <button className="cs-button" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save changes"}</button>
          <button className="cs-button primary" type="button" disabled={busy||!form.title.trim()||!activeCount} onClick={()=>void save("active")}><StudioIcon name="check" size={16}/>{form.status==="active"?"Update published":"Publish collection"}</button>
        </div>
      </header>
      {error&&<div className="cs-alert error" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Dismiss error">×</button></div>}
      {notice&&<div className="cs-alert success" role="status">{notice}<button type="button" onClick={()=>setNotice("")} aria-label="Dismiss notification">×</button></div>}
      <nav className="cs-tabs" aria-label="Collection editor">
        {TABS.map(item=><button key={item.id} type="button" onClick={()=>setTab(item.id)} className={tab===item.id?"active":""} aria-current={tab===item.id?"page":undefined}><strong>{item.label}</strong><small>{item.hint}</small></button>)}
      </nav>
      <div className="cs-editor-layout">
        <div className="cs-editor-main">
          {tab==="overview"&&<div className="cs-tab-stack">
            <section className="cs-panel">
              <header className="cs-section-head"><div><span className="cs-overline">01 / IDENTITY</span><h2>Collection details</h2><p>Give this group a clear name. Storefront handles and search titles are generated automatically.</p></div></header>
              <div className="cs-form-stack">
                <label>Collection title <span className="cs-required">*</span><input autoFocus={!editId} required maxLength={120} value={form.title} onChange={e=>chooseTitle(e.target.value)} placeholder="e.g. Made for the Good Hours"/></label>
                <label>Description<textarea rows={4} maxLength={6000} value={form.description} onChange={e=>setField("description",e.target.value)} placeholder="What connects these products? Who is this collection for?"/></label>
                <label>Short label<input maxLength={120} value={form.eyebrow} onChange={e=>setField("eyebrow",e.target.value)} placeholder="e.g. Built for good hours"/></label>
              </div>
            </section>
            <section className="cs-panel">
              <header className="cs-section-head"><div><span className="cs-overline">02 / CREATIVE</span><h2>Collection cover</h2><p>Choose your own image from the media library, or use the actual product imagery.</p></div></header>
              <button type="button" className="cs-cover-selector" onClick={()=>setMediaRole("cover")}>
                {safeMediaUrl(form.image_url)?<img src={safeMediaUrl(form.image_url)} alt="Collection cover preview"/>:<div className="cs-cover-placeholder"><StudioIcon name="image" size={32}/><strong>Add a cover image</strong><span>Choose an asset from your existing media library</span></div>}
                <span className="cs-cover-edit"><StudioIcon name="pen" size={15}/>{form.image_url?"Change image":"Choose image"}</span>
              </button>
              {form.image_url&&<button className="cs-text-button" type="button" onClick={()=>setField("image_url","")}>Remove cover</button>}
            </section>
            <section className="cs-panel">
              <header className="cs-section-head"><div><span className="cs-overline">03 / DESTINATION</span><h2>Storefront preview</h2><p>See the current public address and select a presentation style from the Presentation tab.</p></div></header>
              <div className="cs-route-summary"><StudioIcon name="layers"/><span><strong>{form.title||"Untitled collection"}</strong><small>Shop / Collections / {slugify(form.slug||form.title)||"new-collection"}</small></span><button className="cs-button small" type="button" onClick={()=>setTab("presentation")}>Customize appearance</button></div>
              <details className="cs-advanced" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}>
                <summary>Advanced address settings</summary><label>Collection handle<input disabled={collection?.status==="active"} value={form.slug} onChange={e=>setField("slug",slugify(e.target.value))} maxLength={180}/></label><p>{collection?.status==="active"?"Published collection handles are locked to protect existing links.":"The handle is generated automatically. You can customize it before publishing."}</p>
              </details>
            </section>
          </div>}
          {tab==="products"&&<CollectionProducts products={products} selected={selected} onSelect={setSelected} plan={form.plan} onPlan={v=>setField("plan",v)} onOpenStudio={goToStudio} onScaffold={scaffoldDrafts} collectionId={currentId.current}/>}
          {tab==="presentation"&&<CollectionPresentation form={form} setForm={setForm} openMedia={setMediaRole} products={products} selected={effectiveIds}/>}
          {tab==="rules"&&<CollectionRules products={products} selected={selected} onSelect={setSelected} rules={form.rules} onRules={rules=>setField("rules",rules)} />}
          {tab==="seo"&&<div className="cs-tab-stack"><section className="cs-panel">
            <header className="cs-section-head"><div><span className="cs-overline">SEARCH & DISCOVERY</span><h2>Search engine listing</h2><p>Keep the generated defaults or tailor the collection’s appearance in search results.</p></div></header>
            <div className="cs-seo-preview"><small>Store / Shop / Collections</small><strong>{form.seo_title||form.title||"Collection title"}</strong><span>{form.seo_description||form.description||"A short description of your collection appears here."}</span></div>
            <div className="cs-form-stack"><label>SEO page title<input maxLength={180} value={form.seo_title} onChange={e=>setField("seo_title",e.target.value)} placeholder={form.title||"Collection title"}/><small>{form.seo_title.length}/180 characters</small></label>
              <label>Meta description<textarea rows={4} maxLength={400} value={form.seo_description} onChange={e=>setField("seo_description",e.target.value)} placeholder={form.description||"Description generated from collection content"}/><small>{form.seo_description.length}/400 characters</small></label></div>
          </section><section className="cs-panel"><h2>Social sharing image</h2><p className="cs-muted">The collection cover serves as your default social image. Select a clear branded image under Overview.</p><button className="cs-button" type="button" onClick={()=>setTab("overview")}>Review collection cover</button></section></div>}
        </div>
        <aside className="cs-editor-rail" aria-label="Collection status">
          <section className="cs-rail-panel"><div className="cs-rail-title"><span>Publication</span><span className={`cs-status-chip ${form.status==="active"?"active":""}`}>{form.status==="active"?"Live":form.status}</span></div>
            <p>{form.status==="active"?"This collection is visible to customers when its product listings are published.":"Build your lineup, save a draft, then publish when ready."}</p>
            <div className="cs-readiness"><strong>Collection setup</strong><span>{progress} / 5</span></div><div className="cs-progress"><span style={{width:`${progress/5*100}%`}}/></div>
            <ul className="cs-checklist">
              {[[Boolean(form.title.trim()),"Collection title"],[selected.length>0,"Products assigned"],[activeCount>0,"Published product ready"],[Boolean(form.image_url),"Cover image"],[Boolean(form.hero.headline||form.title),"Hero headline"]].map(([done,label])=><li key={String(label)}><span className={done?"done":""}><StudioIcon name="check" size={12}/></span>{label}</li>)}
            </ul>
            {collection?.status==="active"&&<button type="button" className="cs-button full" disabled={busy} onClick={()=>void save("draft")}>Unpublish collection</button>}
            {collection?.status==="archived"&&<button type="button" className="cs-button full" disabled={busy} onClick={()=>void save("draft")}>Restore as draft</button>}
          </section>
          <section className="cs-rail-panel"><span className="cs-overline">COLLECTION DETAILS</span><dl><div><dt>Assigned</dt><dd>{selected.length} products</dd></div><div><dt>Ready to sell</dt><dd>{activeCount} products</dd></div><div><dt>Planned blanks</dt><dd>{form.plan.length}</dd></div><div><dt>Last saved</dt><dd>{collection?.updated_at?.slice(0,10)||"Not yet"}</dd></div></dl></section>
          <section className="cs-rail-tip"><StudioIcon name="spark" size={19}/><strong>Build a coordinated drop</strong><p>Plan supplier blanks in Products, prepare them in Product Studio, and return here to curate the published lineup.</p></section>
        </aside>
      </div>
    </div>
    <CollectionMediaPicker key={mediaRole||"closed"} title={mediaRole==="artwork"?"Choose hero artwork":mediaRole==="background"?"Choose background image":"Choose collection cover"} open={mediaRole!==null} onClose={()=>setMediaRole(null)} onSelect={asset=>{if(mediaRole)pickMedia(mediaRole,asset);}}/>
  </main>;
}
