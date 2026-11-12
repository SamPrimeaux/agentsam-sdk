import type {
  SettingsStoragePreferenceProvider,
  SettingsStorageTarget,
  HealthState,
} from "@inneranimalmedia/agentsam-settings/contracts";

/** Observable Cloudflare service inventory. The access probe does not imply write permission. */
export type StorageFamily = {
  status?: string;
  available?: boolean;
  count?: number | null;
  buckets?: Array<{ name: string }>;
  truncated?: boolean;
};
export type CloudflareStorageDiscovery = {
  ok?: boolean;
  status?: string;
  account?: { id?: string } | null;
  r2?: StorageFamily;
  images?: StorageFamily;
  stream?: StorageFamily;
};
export type StorageSettingsResponse = {
  ok: boolean;
  preferences?: Array<{
    provider: SettingsStoragePreferenceProvider;
    enabled: boolean;
    isDefault: boolean;
    config: Record<string, string>;
  }>;
  connectionHints?: {
    cloudAvailable?: boolean;
    oauthAvailable?: boolean;
    cloud?: Array<{ provider: string; status: string; lastVerifiedAt?: number | null }>;
    oauth?: Array<{ provider: string; authorizationRecorded: boolean }>;
  };
};

const MANAGE_PLUGINS="/settings/customize?view=plugins";
function familyHealth(family: StorageFamily | undefined): HealthState {
  if (!family) return "unknown";
  if (["needs_scope","not_connected","unavailable"].includes(family.status||"")) return "attention";
  return family.available===true ? "healthy" : "unknown";
}
function countDetail(family: StorageFamily | undefined, noun: string): string {
  const count=Number(family?.count);
  if (!family || !family.available || !Number.isFinite(count) || count < 0)
    return "Inventory unavailable or not authorized.";
  return String(count)+" "+noun+(count===1?"":"s")+(family.truncated?" (more pages available)":"")+".";
}

export function projectSettingsStorageTargets(
  indexedDbAvailable: boolean,
  cloudflare: CloudflareStorageDiscovery | null,
  settings: StorageSettingsResponse | null = null,
  localCapabilities: { opfs?: boolean; deviceFsa?: boolean } = {},
): SettingsStorageTarget[] {
  const preference=new Map((settings?.preferences||[]).map(row=>[row.provider,row]));
  const hints=settings?.connectionHints;
  const hasGrant=(...aliases:string[]) =>
    hints?.oauth?.some(grant=>aliases.includes(grant.provider)&&grant.authorizationRecorded) ||
    hints?.cloud?.some(record=>aliases.includes(record.provider)&&record.status==="active") || false;
  const withPreference=(target:SettingsStorageTarget, provider:SettingsStoragePreferenceProvider):SettingsStorageTarget => {
    const pref=preference.get(provider);
    return {...target,preferenceProvider:provider,
      ...(pref ? { enabled:pref.enabled,isDefault:pref.isDefault,config:pref.config } : {})};
  };

  const connected=Boolean(cloudflare?.account?.id && cloudflare.ok!==false);
  const serviceSpec=[
    {id:"cloudflare-r2",name:"Cloudflare R2",kind:"Object buckets",brand:"cloudflare-r2" as const,family:cloudflare?.r2,noun:"bucket",pref:"artifacts_r2" as const},
    {id:"cloudflare-images",name:"Cloudflare Images",kind:"Managed images & delivery",brand:"cloudflare-images" as const,family:cloudflare?.images,noun:"image"},
    {id:"cloudflare-stream",name:"Cloudflare Stream",kind:"Managed video",brand:"cloudflare-stream" as const,family:cloudflare?.stream,noun:"video"},
  ];
  const cloud:SettingsStorageTarget[]=serviceSpec.map(spec=>{
    const access=connected
      ? spec.family?.available ? "verified" as const
        : spec.family?.status==="needs_scope" ? "needs_scope" as const : "unverified" as const
      : cloudflare?.status==="not_connected" ? "not_configured" as const : "unverified" as const;
    const target:SettingsStorageTarget={
      id:spec.id,name:spec.name,kind:spec.kind,brand:spec.brand,group:"cloudflare",
      status:connected?familyHealth(spec.family):access==="not_configured"?"attention":"unknown",
      access,actionHref:MANAGE_PLUGINS,actionLabel:"Manage connection",
      detail:connected
        ? spec.family?.available ? countDetail(spec.family,spec.noun)
          : spec.family?.status==="needs_scope" ? "The current Cloudflare grant lacks this service permission."
          : "The service could not be verified; its contents are not assumed empty."
        : cloudflare?.status==="not_connected"
          ? "Cloudflare is not connected in this account."
          : "Cloudflare access could not be verified from this host.",
    };
    return "pref" in spec&&spec.pref?withPreference(target,spec.pref):target;
  });
  const externalSpec:Array<{
    id:string;name:string;kind:string;brand:SettingsStorageTarget["brand"];
    pref:SettingsStoragePreferenceProvider; aliases:string[]; detail:string;
  }>=[
    {id:"amazon-s3",name:"Amazon S3 / S3 compatible",kind:"Object storage",brand:"amazon-s3",
      pref:"s3",aliases:["aws","amazon_s3","s3"],detail:"Specify a bucket, endpoint and region. Credentials are managed separately."},
    {id:"google-drive",name:"Google Drive",kind:"Connected cloud folders",brand:"google-drive",
      pref:"google_drive",aliases:["google_drive","google"],detail:"Choose a Drive folder. File access requires a verified Google grant."},
    {id:"supabase-storage",name:"Supabase Storage",kind:"Project object storage",brand:"supabase",
      pref:"supabase",aliases:["supabase"],detail:"Set a bucket and project URL. Account authorization is managed separately."},
    {id:"github-storage",name:"GitHub",kind:"Repository files",brand:"github",
      pref:"github",aliases:["github"],detail:"For repository-backed files, not a general-purpose object bucket."},
  ];
  const external=externalSpec.map(spec=>{
    const saved=preference.get(spec.pref);
    const recorded=hasGrant(...spec.aliases);
    return withPreference({
      id:spec.id,name:spec.name,kind:spec.kind,group:"external",brand:spec.brand,
      detail:saved ? "Location preferences saved; a successful file operation has not been verified." : spec.detail,
      status:"unknown" as const,
      access:recorded?"authorization_recorded":
        (!settings || hints?.cloudAvailable===false || hints?.oauthAvailable===false)?"unverified":
        saved?"unverified":"not_configured",
      actionHref:["s3","supabase"].includes(spec.pref)?"/settings/keys":MANAGE_PLUGINS,
      actionLabel:["s3","supabase"].includes(spec.pref)?"Keys & Secrets":"Manage authorization",
    },spec.pref);
  });
  const local:SettingsStorageTarget[]=[
    {id:"local-content-indexeddb",name:"Browser content storage",kind:"IndexedDB · this device",
      detail:indexedDbAvailable
        ? "Browser storage API is available. Persistence and backup are not verified."
        : "IndexedDB is unavailable in this runtime.",
      brand:"local",group:"device",status:indexedDbAvailable?"unknown":"attention",
      access:indexedDbAvailable?"unverified":"not_configured"},
    withPreference({id:"local-opfs",name:"Local OPFS",kind:"Origin-private files · this device",
      detail:localCapabilities.opfs?"File-system API available; data remains local and backup is not verified.":"OPFS is unavailable or not checked.",
      brand:"local",group:"device",status:"unknown",access:"unverified"},"opfs"),
    withPreference({id:"local-device-fsa",name:"Device folders",kind:"File System Access · this device",
      detail:localCapabilities.deviceFsa?"Folder picker available; access requires user permission.":"Folder picker unavailable or not checked.",
      brand:"local",group:"device",status:"unknown",access:"unverified"},"device_fsa"),
  ];
  return [...cloud,...external,...local];
}
