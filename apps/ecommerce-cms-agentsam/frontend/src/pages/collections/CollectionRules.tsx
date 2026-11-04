import { useMemo } from "react";
import StudioIcon from "../products/StudioIcon";
import type { MerchCollectionRules, Product } from "./model";
import { resolveCollectionMembers } from "../../../../../../packages/agentsam-merch/src/collection-planning.js";

const modes=[
  {id:"manual",label:"Manual",hint:"You choose each product"},
  {id:"automatic",label:"Automatic",hint:"Include products matching rules"},
  {id:"hybrid",label:"Hybrid",hint:"Manual picks + rules"},
] as const;
export default function CollectionRules({products,selected,onSelect,rules,onRules}:{
  products:Product[];selected:number[];onSelect:(ids:number[])=>void;rules:MerchCollectionRules;onRules:(rules:MerchCollectionRules)=>void;
}) {
  const valid=rules.mode==="manual" || rules.conditions.length>0 && rules.conditions.every(c=>Boolean(c.value.trim()));
  const results=useMemo(()=>{
    if(!valid)return [];
    try {return resolveCollectionMembers(products,selected,rules);}catch{return [];}
  },[products,selected,rules,valid]);
  const eligible=results.filter(id=>products.some(p=>p.id===id&&p.status==="active"));
  function addCondition(){
    if(rules.conditions.length>=8)return;
    onRules({...rules,conditions:[...rules.conditions,{field:"title",operator:"contains",value:""}]});
  }
  return <div className="cs-tab-stack">
    <section className="cs-panel">
      <header className="cs-section-head"><div><span className="cs-overline">COLLECTION AUTOMATION</span><h2>How products are included</h2><p>Control manual membership, automatic catalog matching, and explicit exclusions. Automatic collections re-evaluate when your catalog changes.</p></div></header>
      <div className="cs-rule-modes">{modes.map(mode=><button className={rules.mode===mode.id?"active":""} type="button" key={mode.id} onClick={()=>onRules({...rules,mode:mode.id,conditions:mode.id==="manual"?[]:rules.conditions})}>
        <span className="cs-rule-radio"/><strong>{mode.label}</strong><small>{mode.hint}</small>
      </button>)}</div>
      {rules.mode!=="manual"&&<>
        <div className="cs-rule-tools">
          <label>Products must match
            <select value={rules.match} onChange={e=>onRules({...rules,match:e.target.value as MerchCollectionRules["match"]})}>
              <option value="all">All conditions</option><option value="any">Any condition</option>
            </select>
          </label>
          <button type="button" className="cs-button" disabled={rules.conditions.length>=8} onClick={addCondition}>＋ Add condition</button>
        </div>
        <div className="cs-condition-list">
          {rules.conditions.map((c,i)=><div className="cs-condition" key={i}>
            <span className="cs-condition-number">{i+1}</span>
            <select aria-label={`Rule ${i+1} field`} value={c.field} onChange={e=>onRules({...rules,conditions:rules.conditions.map((x,n)=>n===i?{...x,field:e.target.value as typeof c.field}:x)})}>
              <option value="title">Product title</option><option value="slug">Product handle</option><option value="collection">Legacy product collection</option>
            </select>
            <select aria-label={`Rule ${i+1} operator`} value={c.operator} onChange={e=>onRules({...rules,conditions:rules.conditions.map((x,n)=>n===i?{...x,operator:e.target.value as typeof c.operator}:x)})}>
              <option value="contains">Contains</option><option value="equals">Equals</option><option value="starts_with">Starts with</option>
            </select>
            <input maxLength={100} aria-label={`Rule ${i+1} value`} value={c.value} onChange={e=>onRules({...rules,conditions:rules.conditions.map((x,n)=>n===i?{...x,value:e.target.value}:x)})} placeholder="Type a value"/>
            <button className="cs-icon-button" aria-label={`Remove rule ${i+1}`} onClick={()=>onRules({...rules,conditions:rules.conditions.filter((_,n)=>n!==i)})} type="button"><StudioIcon name="close" size={16}/></button>
          </div>)}
          {!rules.conditions.length&&<div className="cs-empty-mini"><p>Automatic matching requires at least one rule. Start with a product title or existing collection.</p><button type="button" className="cs-button" onClick={addCondition}>Add first rule</button></div>}
        </div>
        {!valid&&<p className="cs-rule-warning">Enter a value for each condition before saving or publishing automatic membership.</p>}
      </>}
    </section>
    <section className="cs-panel">
      <header className="cs-section-head"><div><span className="cs-overline">LIVE RULE PREVIEW</span><h2>{results.length} products matched <span className="cs-count">{eligible.length} published</span></h2><p>This is a preview against the currently loaded catalog. Public pages only display published products.</p></div></header>
      <div className="cs-rule-preview">{results.slice(0,36).map(id=>{
        const p=products.find(item=>item.id===id);
        if(!p)return null;
        return <div key={id}><span className="cs-rule-dot"/><span>{p.title}</span><small>{p.status}</small>
          {rules.mode!=="manual"&&<button className="cs-button small" type="button" onClick={()=>onRules({...rules,excludedIds:[...rules.excludedIds,id]})}>Exclude</button>}
          {rules.mode==="manual"&&<button className="cs-icon-button" type="button" onClick={()=>onSelect(selected.filter(v=>v!==id))} aria-label={`Remove ${p.title}`}><StudioIcon name="close" size={14}/></button>}
        </div>;
      })}{valid&&!results.length&&<div className="cs-empty-mini">No products currently match this configuration.</div>}</div>
      {rules.mode!=="manual"&&!!rules.excludedIds.length&&<div className="cs-exclusions"><strong>Excluded products ({rules.excludedIds.length})</strong><div>{rules.excludedIds.map(id=><button key={id} type="button" className="cs-exclusion" onClick={()=>onRules({...rules,excludedIds:rules.excludedIds.filter(v=>v!==id)})}>{products.find(p=>p.id===id)?.title||`#${id}`} ×</button>)}</div></div>}
      <p className="cs-rule-footnote">Manual product order is preserved for manual and hybrid collections. Auto-matched products follow in title order. Exclusions always win.</p>
    </section>
  </div>;
}
