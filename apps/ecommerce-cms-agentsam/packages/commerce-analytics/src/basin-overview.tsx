import type { ReactNode } from "react";

/** Reusable capability-gated Basin analytics read model. No warehouse fixtures. */
export type BasinOverview = {
  enabled:boolean;status:string;source:string;checkedAt:string|null;
  warehouses:Array<{id:string;label:string}>;
  pipelines:Array<{id:string;label:string;status:string;lastEventAt:string|null}>;
  catalogTables:Array<{name:string;namespace:string;rows:number|null}>;
};

function Indicator({ready,children}:{ready:boolean;children:ReactNode}) {
  return <span className={ready?"pill good":"pill"} aria-label={String(children)}>
    <span className={ready?"dot":"muted"}/>{children}
  </span>;
}
function Coverage({label,number,source}:{label:string;number:number;source:string}) {
  return <div className="card" style={{padding:14,minWidth:0}}>
    <div className="muted text-xs">{label}</div>
    <div className="mono fw-600" style={{fontSize:26,marginTop:7}}>{number.toLocaleString()}</div>
    <div className="muted text-xs" style={{marginTop:8}}>{source}</div>
  </div>;
}
/** Domain-neutral presentation: host must authorize/discover actual Basin data. */
export function BasinOverviewPanel({basin}:{basin:BasinOverview}) {
  if(!basin.enabled)return null;
  const ready=basin.status==="connected";
  return <section className="card" aria-label="Basin lakehouse" style={{marginTop:14}}>
    <div className="card-head">
      <div><div className="card-title">Basin · historical analytics</div>
        <div className="card-sub">Pipelines → Iceberg / R2 → Catalog → SQL</div></div>
      <Indicator ready={ready}>{ready?"Provider connected":basin.status==="permission_required"?"Connection required":"Basin unavailable"}</Indicator>
    </div>
    {!ready?<div className="muted" style={{padding:"24px 16px"}}>
      An authorized Basin provider must discover warehouses, catalog tables and pipelines.
      Configuration alone does not prove the resources exist.
    </div>:
      <>
        <div className="grid cols-4" style={{padding:12,gap:12}}>
          <Coverage label="Warehouses" number={basin.warehouses.length} source={basin.source}/>
          <Coverage label="Pipelines" number={basin.pipelines.length} source={basin.source}/>
          <Coverage label="Catalog tables" number={basin.catalogTables.length} source={basin.source}/>
          <div className="card" style={{padding:14}}>
            <div className="muted text-xs">Last provider discovery</div>
            <div style={{marginTop:12}}>{basin.checkedAt?new Date(basin.checkedAt).toLocaleString():"Not collected"}</div>
          </div>
        </div>
        <div className="grid cols-12" style={{padding:"0 12px 12px",gap:12}}>
          <div className="span-6"><div className="card-sub" style={{marginBottom:9}}>Warehouses</div>
            {basin.warehouses.length?basin.warehouses.map(w=>
              <div className="row gap-2" key={w.id} style={{padding:8,borderBottom:"1px solid var(--border)"}}>
                <strong>{w.label}</strong><small className="muted mono">{w.id}</small>
              </div>):<div className="muted text-xs">No warehouses returned by provider.</div>}
          </div>
          <div className="span-6"><div className="card-sub" style={{marginBottom:9}}>Pipelines</div>
            {basin.pipelines.length?basin.pipelines.map(p=>
              <div className="row gap-2" key={p.id} style={{padding:8,borderBottom:"1px solid var(--border)"}}>
                <span>{p.label}</span><Indicator ready={p.status==="running"}>{p.status}</Indicator>
              </div>):<div className="muted text-xs">No discovered pipelines.</div>}
          </div>
        </div>
        {basin.catalogTables.length>0&&<div style={{padding:"0 12px 12px",overflowX:"auto"}}>
          <div className="card-sub" style={{marginBottom:8}}>Iceberg catalog tables</div>
          <table className="tbl"><thead><tr><th>Namespace</th><th>Table</th><th className="num">Rows</th></tr></thead>
            <tbody>{basin.catalogTables.map((table,i)=><tr key={table.namespace+":"+table.name+":"+i}>
              <td className="mono">{table.namespace}</td><td>{table.name}</td>
              <td className="num mono">{table.rows==null?"Not reported":table.rows.toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div className="card-foot">
          Historical row counts, lag, volume and freshness appear only when returned by the Basin adapter.
        </div>
      </>}
  </section>;
}
