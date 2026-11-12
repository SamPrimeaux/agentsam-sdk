import { useState } from "react";
import { Check, ChevronDown, ExternalLink, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import type {
  SettingsHost, SettingsSnapshot, SettingsStoragePreferenceInput,
  SettingsStoragePreferenceProvider, SettingsStorageTarget,
} from "../contracts/index";
import { StorageBrandMark } from "./storage-brands";

const GROUPS: Array<{ id: NonNullable<SettingsStorageTarget["group"]>; label: string; description: string }> = [
  { id: "cloudflare", label: "Cloudflare", description: "Object, image and video services share a provider but retain independent permissions." },
  { id: "external", label: "External providers", description: "Connected cloud accounts and file destinations." },
  { id: "device", label: "On this device", description: "Local browser storage and folders are not cloud backups." },
  { id: "other", label: "Other storage", description: "Targets reported by this host." },
];
type Field = { key: string; label: string; placeholder: string };
const FIELDS: Record<SettingsStoragePreferenceProvider, Field[]> = {
  artifacts_r2: [
    {key:"bucket",label:"Bucket name",placeholder:"my-artifacts"},
    {key:"publicBaseUrl",label:"Public base URL",placeholder:"https://assets.example.com"},
    {key:"prefix",label:"Object prefix",placeholder:"assets/"},
  ],
  s3: [
    {key:"bucket",label:"Bucket name",placeholder:"site-objects"},
    {key:"region",label:"Region",placeholder:"us-east-1"},
    {key:"endpoint",label:"HTTPS endpoint",placeholder:"https://s3.amazonaws.com"},
    {key:"prefix",label:"Object prefix",placeholder:"uploads/"},
  ],
  google_drive: [
    {key:"folderId",label:"Folder ID",placeholder:"Folder identifier"},
    {key:"folderName",label:"Folder label",placeholder:"Customer assets"},
  ],
  supabase: [
    {key:"bucket",label:"Bucket name",placeholder:"assets"},
    {key:"projectUrl",label:"Project URL",placeholder:"https://project.supabase.co"},
  ],
  github: [
    {key:"repository",label:"Repository",placeholder:"owner/repository"},
    {key:"path",label:"Directory",placeholder:"public/assets"},
  ],
  opfs: [], device_fsa: [],
};
function accessLabel(target: SettingsStorageTarget): string {
  if(target.access==="verified") return "Read verified";
  if(target.access==="authorization_recorded") return "Authorization recorded";
  if(target.access==="needs_scope") return "Needs permission";
  if(target.access==="not_configured") return "Not configured";
  return target.status==="attention" ? "Needs attention" : "Not verified";
}
function accessTone(target: SettingsStorageTarget): string {
  if(target.access==="verified") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
  if(target.access==="needs_scope") return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  return "border-border bg-muted/20 text-muted-foreground";
}
function initialDraft(target: SettingsStorageTarget): SettingsStoragePreferenceInput | null {
  return target.preferenceProvider ? {
    provider:target.preferenceProvider, enabled:target.enabled??true,
    isDefault:target.isDefault??false,config:{...(target.config||{})},
  } : null;
}
function StorageTile({ target, host, onChanged }: {
  target: SettingsStorageTarget; host:SettingsHost;onChanged:()=>Promise<void>;
}) {
  const [expanded,setExpanded]=useState(false);
  const [draft,setDraft]=useState<SettingsStoragePreferenceInput|null>(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const canConfigure=Boolean(target.preferenceProvider&&host.updateStoragePreference);
  const fields=target.preferenceProvider?FIELDS[target.preferenceProvider]:[];
  const toggle=()=>{
    if(expanded){setExpanded(false);return;}
    setDraft(initialDraft(target));setError("");setSaved(false);setExpanded(true);
  };
  const save=async()=>{
    if(!draft||!host.updateStoragePreference)return;
    setSaving(true);setError("");setSaved(false);
    try {await host.updateStoragePreference(draft);await onChanged();setSaved(true);}
    catch(e){setError(e instanceof Error?e.message:"Storage preferences could not be saved.");}
    finally{setSaving(false);}
  };
  return <article className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card/40" data-storage-provider={target.id}>
    <div className="flex items-start gap-3 p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/20" aria-label={target.name+" logo"}>
        <StorageBrandMark provider={target.brand||target.id} size={25}/>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-[13px] font-semibold text-foreground">{target.name}</h4>
          {target.isDefault&&<span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-300">Default</span>}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{target.kind}</p>
      </div>
      <span className={"shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium "+accessTone(target)}>{accessLabel(target)}</span>
    </div>
    <div className="px-4 pb-3">
      <p className="text-[11px] leading-[1.6] text-muted-foreground">{target.detail}</p>
      {target.enabled===false&&<p className="mt-1 text-[10px] text-muted-foreground">Disabled in preferences.</p>}
    </div>
    <div className="flex min-h-10 items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
      <span className="text-[10px] text-muted-foreground">
        {target.access==="verified"?<><ShieldCheck size={12} className="mr-1 inline"/>Live service read succeeded</>:"No verified write access implied"}
      </span>
      <div className="flex items-center gap-2">
        {target.actionHref&&<a href={target.actionHref} className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline">
          {target.actionLabel||"Connections"}<ExternalLink size={12}/>
        </a>}
        {canConfigure&&<button type="button" onClick={toggle} aria-expanded={expanded}
          aria-label={"Configure "+target.name}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/40">
          <Settings2 size={12}/> Configure <ChevronDown size={12} className={expanded?"rotate-180":""}/>
        </button>}
      </div>
    </div>
    {expanded&&draft&&<div className="space-y-3 border-t border-border/60 bg-muted/10 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(field=><label key={field.key} className="space-y-1">
          <span className="block text-[11px] font-medium">{field.label}</span>
          <input type="text" autoComplete="off" value={draft.config[field.key]||""} placeholder={field.placeholder}
            onChange={e=>setDraft(cur=>cur?{...cur,config:{...cur.config,[field.key]:e.target.value}}:cur)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] outline-none focus:border-violet-500/60"/>
        </label>)}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[11px]">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.enabled}
          onChange={e=>setDraft(cur=>cur?{...cur,enabled:e.target.checked,isDefault:e.target.checked?cur.isDefault:false}:cur)}/>
          Enabled preference</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.isDefault} disabled={!draft.enabled}
          onChange={e=>setDraft(cur=>cur?{...cur,isDefault:e.target.checked}:cur)}/>
          Preferred default</label>
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">Location preferences only. Credentials live in connected account vaults, not this form. Saving does not test access or upload files.</p>
      {error&&<p role="alert" className="text-[11px] text-red-400">{error}</p>}
      {saved&&<p role="status" className="flex items-center gap-1 text-[11px] text-emerald-400"><Check size={13}/> Preferences saved</p>}
      <div className="flex justify-end"><button type="button" disabled={saving} onClick={save}
        className="rounded-md bg-foreground px-3 py-2 text-[11px] font-semibold text-background disabled:opacity-50">
        {saving?"Saving…":"Save preferences"}</button></div>
    </div>}
  </article>;
}

export function SettingsStoragePanel({ snapshot, host, onChanged }: {
  snapshot:SettingsSnapshot;host:SettingsHost;onChanged:()=>Promise<void>;
}) {
  const storage=snapshot.storage||[];
  const verified=storage.filter(t=>t.access==="verified").length;
  const attention=storage.filter(t=>t.status==="attention"||t.access==="needs_scope").length;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">Storage & providers</h2>
        <p className="mt-1 max-w-xl text-[12px] leading-5 text-muted-foreground">Where files, assets and backups live. Connections, routing preferences and permissions are separate settings.</p>
      </div>
      <button type="button" onClick={()=>void onChanged()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[11px] font-medium hover:bg-muted/30">
        <RefreshCw size={13}/> Refresh status
      </button>
    </div>
    <div className="grid grid-cols-3 gap-2.5">
      {[
        {label:"Verified reads",value:verified},
        {label:"Needs attention",value:attention},
        {label:"Listed services",value:storage.length},
      ].map(stat=><div key={stat.label} className="rounded-lg border border-border/70 bg-muted/10 px-3 py-3">
        <div className="text-[20px] font-semibold tabular-nums">{stat.value}</div>
        <div className="text-[10px] text-muted-foreground">{stat.label}</div>
      </div>)}
    </div>
    {storage.length===0&&<div role="status" className="rounded-lg border border-border/70 p-4 text-[12px] text-muted-foreground">No storage inventory was supplied by this host. No provider status is assumed.</div>}
    {GROUPS.map(group=>{
      const items=storage.filter(t=>(t.group||"other")===group.id);
      if(!items.length)return null;
      return <section key={group.id} className="space-y-3" aria-label={group.label+" storage providers"}>
        <div><h3 className="text-[12px] font-semibold">{group.label}</h3><p className="mt-0.5 text-[11px] text-muted-foreground">{group.description}</p></div>
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map(target=><StorageTile key={target.id} target={target} host={host} onChanged={onChanged}/>)}
        </div>
      </section>;
    })}
    <p className="border-t border-border/60 pt-3 text-[10px] leading-5 text-muted-foreground">Saved credentials or bucket names are not evidence of successful storage access. Only live provider responses count as verified reads; uploads and backup integrity require separate checks.</p>
  </div>;
}
