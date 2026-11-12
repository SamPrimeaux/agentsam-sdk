import { useCallback } from "react";
import { AdminAppsDirectory, type AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";

/** Host-owned account management using the same real directory as the Apps + menu. */
async function appsRequest(method:"GET"|"POST"|"DELETE"|"PATCH",body?:Record<string,unknown>) {
  const response=await fetch(method==="GET"?"/api/apps/launcher":"/api/apps/install",{
    method,credentials:"same-origin",
    headers:{accept:"application/json",...(body?{"content-type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.ok)throw new Error("apps_account_request_failed");
  return payload;
}
export function AppsManagementPage(){
  const load=useCallback(async():Promise<AdminInstallableApp[]>=>{
    const value=await appsRequest("GET");
    if(!Array.isArray(value.apps))throw new Error("apps_inventory_invalid");
    return value.apps;
  },[]);
  const install=useCallback(async(key:string)=>{await appsRequest("POST",{key});},[]);
  const remove=useCallback(async(key:string)=>{await appsRequest("DELETE",{key});},[]);
  const update=useCallback(async(key:string,enabled:boolean)=>{await appsRequest("PATCH",{key,enabled});},[]);
  const onChanged=useCallback(()=>{window.dispatchEvent(new Event("agentsam:navigation-changed"));},[]);
  const onOpen=useCallback((href:string)=>{
    if(/^\/(?!\/)[\w/%?&=.,#:+~-]*$/.test(href))window.location.assign(href);
  },[]);
  const selectedTheme=typeof document==='undefined'?'system':document.documentElement.dataset.theme;
  const navTheme=selectedTheme==='light'||selectedTheme==='dark'?selectedTheme:'system';
  return <section className="as-nav-scope as-apps-inline space-y-5 pb-8" data-nav-theme={navTheme}>
    <header className="flex flex-wrap justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-foreground">Apps</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Install, open, disable, or remove the existing admin applications for this account. Each app keeps its own editor and full route. Side Stage shortcuts and plugins are configured separately.</p></div>
    </header>
    <div className="overflow-hidden rounded-xl border border-border bg-card py-5">
      <AdminAppsDirectory loadApps={load} installApp={install} removeApp={remove} updateApp={update} onInstalled={onChanged} onOpenApp={onOpen}/>
    </div>
  </section>;
}
