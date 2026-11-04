import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StudioIcon from "../products/StudioIcon";
import { collectionsApi } from "./api";
import type { Collection, CollectionStatus } from "./model";
import { collectionHref, parseCollection, safeMediaUrl, slugify } from "./model";

type StatusFilter = "all" | CollectionStatus;
const STATUSES: {value:StatusFilter;label:string}[] = [{value:"all",label:"All collections"},{value:"active",label:"Published"},{value:"draft",label:"Drafts"},{value:"archived",label:"Archived"}];
export default function CollectionLibrary() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const visible = useMemo(()=>collections.filter(c=>(status==="all"||c.status===status) && `${c.title} ${c.slug} ${c.description}`.toLowerCase().includes(search.toLowerCase())),[collections,search,status]);
  useEffect(()=>{
    document.title = "Collections — Store Admin";
    let live=true;
    collectionsApi.list().then(items=>{if(live)setCollections(items);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Collections unavailable");}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[]);
  async function duplicate(c: Collection) {
    setBusy(c.id);setError("");setNotice("");
    try{
      const data=await collectionsApi.get(c.id);
      const form=parseCollection(data.collection,data.rules);
      form.title=`${form.title} (Copy)`;
      const base=slugify(`${form.slug}-copy`);
      let suffix=1;
      let proposed=base;
      while(collections.some(item=>item.slug===proposed))proposed=slugify(`${base}-${++suffix}`);
      form.slug=proposed;form.status="draft";
      const clone=await collectionsApi.save(form,undefined,"draft");
      if(data.product_ids.length)await collectionsApi.assign(clone.id,data.product_ids);
      if(form.rules.mode!=="manual")await collectionsApi.saveRules(clone.id,form.rules);
      navigate(collectionHref(`/collections/${clone.id}`));
    }catch(e){setError(e instanceof Error?e.message:"Couldn't duplicate collection");}
    finally{setBusy(null);}
  }
  async function archive(c: Collection) {
    if (!window.confirm(`Archive "${c.title}"? The storefront collection will be hidden, but its products remain intact.`)) return;
    setBusy(c.id);setError("");setNotice("");
    try{
      const data=await collectionsApi.get(c.id);
      await collectionsApi.save({...parseCollection(data.collection),status:"archived"},c.id,"archived");
      setCollections(items=>items.map(item=>item.id===c.id?{...item,status:"archived"}:item));
      setNotice(`${c.title} archived.`);
    }catch(e){setError(e instanceof Error?e.message:"Couldn't archive collection");}
    finally{setBusy(null);}
  }
  return <main className="cs-workspace">
    <div className="cs-container">
      <div className="cs-breadcrumb"><Link to={collectionHref("/products")}>Products</Link><span>/</span><strong>Collections</strong></div>
      <header className="cs-page-header">
        <div><span className="cs-overline">MERCHANDISING / COLLECTION LIBRARY</span><h1>Collections</h1><p>Curate product lines, build presentations, and publish coordinated shopping experiences.</p></div>
        <Link className="cs-button primary cs-new-button" to={collectionHref("/collections/new")}><span aria-hidden="true">＋</span> Create collection</Link>
      </header>
      <div className="cs-library-metrics">
        <div><span>Total collections</span><strong>{collections.length}</strong></div>
        <div><span>Published</span><strong>{collections.filter(c=>c.status==="active").length}</strong></div>
        <div><span>Drafts</span><strong>{collections.filter(c=>c.status==="draft").length}</strong></div>
        <div><span>Product assignments</span><strong>{collections.reduce((total,c)=>total+Number(c.product_count||0),0)}</strong></div>
      </div>
      {(error||notice)&&<div className={`cs-alert ${error?"error":"success"}`} role="status">{error||notice}</div>}
      <section className="cs-panel cs-library-panel">
        <div className="cs-library-tools">
          <div className="cs-input-search"><StudioIcon name="search" size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search collections" aria-label="Search collections"/></div>
          <div className="cs-segmented cs-library-filters" aria-label="Filter collections">{STATUSES.map(f=><button key={f.value} type="button" className={status===f.value?"active":""} onClick={()=>setStatus(f.value)}>{f.label}</button>)}</div>
        </div>
        {loading?<div className="cs-loading">Loading your collection library…</div>:visible.length?<div className="cs-library-list">{visible.map(c=>{
          const image=safeMediaUrl(c.image_url);
          return <article className="cs-library-row" key={c.id}>
            <Link className="cs-library-thumbnail" to={collectionHref(`/collections/${c.id}`)}>{image?<img src={image} alt="" loading="lazy"/>:<StudioIcon name="layers" size={29}/>}</Link>
            <div className="cs-library-info"><Link to={collectionHref(`/collections/${c.id}`)}>{c.title}</Link><span>{c.product_count||0} products · Updated {c.updated_at?.slice(0,10)||"recently"}</span><small>{c.description||"No description yet"}</small></div>
            <span className={`cs-status-chip ${c.status==="active"?"active":""}`}>{c.status==="active"?"Published":c.status}</span>
            <div className="cs-library-actions"><Link className="cs-button small" to={collectionHref(`/collections/${c.id}`)}>Edit</Link>
              {c.status==="active"&&<a className="cs-icon-button" title="View storefront" aria-label={`Preview ${c.title}`} href={`/shop/collections/${encodeURIComponent(c.slug)}`} target="_blank" rel="noreferrer"><StudioIcon name="image" size={16}/></a>}
              <button type="button" className="cs-icon-button" title="Duplicate" aria-label={`Duplicate ${c.title}`} disabled={busy!==null} onClick={()=>void duplicate(c)}><StudioIcon name="layers" size={16}/></button>
              {c.status!=="archived"&&<button type="button" className="cs-icon-button" title="Archive" aria-label={`Archive ${c.title}`} disabled={busy!==null} onClick={()=>void archive(c)}><StudioIcon name="close" size={16}/></button>}
            </div>
          </article>;
        })}</div>:<div className="cs-library-empty"><StudioIcon name="layers" size={36}/><h2>No collections here</h2><p>{search||status!=="all"?"Try clearing the search or selecting another filter.":"Build your first coordinated merchandising collection."}</p><Link className="cs-button primary" to={collectionHref("/collections/new")}>Create collection</Link></div>}
      </section>
    </div>
  </main>;
}
